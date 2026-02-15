/**
 * Channel Background Service
 *
 * Manages persistent channel connections that run independently of user sessions.
 * Bots continue running even when users sign out.
 *
 * Inspired by Clawdbot's gateway architecture.
 */

import { db } from "@/lib/db";
import { channelAccounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getChannelManager, registerConnector } from "./manager";
import { ChannelMessageProcessor } from "./processor";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";

// ============================================================================
// Types
// ============================================================================

export interface ChannelRuntimeState {
    userId: string;
    channelAccountId: string;
    channelType: string;
    running: boolean;
    connected: boolean;
    lastStartAt: number | null;
    lastStopAt: number | null;
    lastError: string | null;
    model: string;
    provider: string;
}

// ============================================================================
// Background Service
// ============================================================================

class ChannelBackgroundService {
    private static instance: ChannelBackgroundService | null = null;
    private runtimeStates: Map<string, ChannelRuntimeState> = new Map();
    private abortControllers: Map<string, AbortController> = new Map();
    private started: boolean = false;

    private constructor() {}

    static getInstance(): ChannelBackgroundService {
        if (!ChannelBackgroundService.instance) {
            ChannelBackgroundService.instance = new ChannelBackgroundService();
        }
        return ChannelBackgroundService.instance;
    }

    /**
     * Get key for runtime state map
     */
    private getKey(userId: string, channelAccountId: string): string {
        return `${userId}:${channelAccountId}`;
    }

    /**
     * Get runtime state for a channel
     */
    getState(userId: string, channelAccountId: string): ChannelRuntimeState | undefined {
        return this.runtimeStates.get(this.getKey(userId, channelAccountId));
    }

    /**
     * Get all running channels
     */
    getRunningChannels(): ChannelRuntimeState[] {
        return Array.from(this.runtimeStates.values()).filter((s) => s.running);
    }

    /**
     * Get all channels for a user
     */
    getUserChannels(userId: string): ChannelRuntimeState[] {
        return Array.from(this.runtimeStates.values()).filter((s) => s.userId === userId);
    }

    /**
     * Determine best model for a user based on API keys
     * Uses user's configured default or auto-detects from available providers
     */
    private async getBestModel(userId: string, channelConfig?: Record<string, unknown>): Promise<{ provider: string; model: string }> {
        try {
            // Check if channel has a configured model
            const config = channelConfig as { provider?: string; model?: string } | undefined;
            if (config?.model && config.model !== 'auto') {
                return {
                    provider: config.provider || this.detectProvider(config.model),
                    model: config.model
                };
            }

            const apiKeys = await getUserApiKeys(userId);

            // Priority: Use first available provider with a real default model
            if (apiKeys.anthropic) {
                return { provider: "anthropic", model: "claude-sonnet-4-20250514" };
            }
            if (apiKeys.openai) {
                return { provider: "openai", model: "gpt-4o" };
            }
            if (apiKeys.google) {
                return { provider: "google", model: "gemini-2.0-flash" };
            }
            if (apiKeys.xai) {
                return { provider: "xai", model: "grok-2" };
            }
            if (apiKeys.openrouter) {
                return { provider: "openrouter", model: "anthropic/claude-3.5-sonnet" };
            }

            // Check for local models
            // TODO: Add Ollama/LM Studio detection here

            // Fallback to OpenRouter with a working model
            return { provider: "openrouter", model: "anthropic/claude-3.5-sonnet" };
        } catch {
            return { provider: "openrouter", model: "anthropic/claude-3.5-sonnet" };
        }
    }

    /**
     * Detect provider from model ID
     */
    private detectProvider(modelId: string): string {
        if (modelId.includes('claude')) return 'anthropic';
        if (modelId.includes('gpt') || modelId.includes('o1') || modelId.includes('o3')) return 'openai';
        if (modelId.includes('gemini')) return 'google';
        if (modelId.includes('grok')) return 'xai';
        if (modelId.startsWith('ollama/')) return 'ollama';
        if (modelId.startsWith('lmstudio/')) return 'lmstudio';
        if (modelId.includes('/')) return 'openrouter';
        return 'openrouter';
    }

    /**
     * Start a single channel
     */
    async startChannel(
        userId: string,
        channelAccountId: string,
        options?: { force?: boolean }
    ): Promise<void> {
        const key = this.getKey(userId, channelAccountId);

        // Check if already running
        const existing = this.runtimeStates.get(key);
        if (existing?.running && !options?.force) {
            console.log(`[BackgroundService] Channel ${key} already running`);
            return;
        }

        // Stop existing if forcing restart
        if (existing?.running && options?.force) {
            await this.stopChannel(userId, channelAccountId);
        }

        // Get channel account from database
        const [account] = await db
            .select()
            .from(channelAccounts)
            .where(
                and(eq(channelAccounts.id, channelAccountId), eq(channelAccounts.userId, userId))
            );

        if (!account) {
            console.error(`[BackgroundService] Channel account not found: ${channelAccountId}`);
            return;
        }

        if (!account.isActive) {
            console.log(`[BackgroundService] Channel ${key} is not active`);
            return;
        }

        // Determine model for this user (use channel config if available)
        const { provider, model } = await this.getBestModel(userId, account.config as Record<string, unknown> | undefined);

        // Create abort controller
        const abort = new AbortController();
        this.abortControllers.set(key, abort);

        // Update runtime state
        const state: ChannelRuntimeState = {
            userId,
            channelAccountId,
            channelType: account.channelType,
            running: true,
            connected: false,
            lastStartAt: Date.now(),
            lastStopAt: null,
            lastError: null,
            model,
            provider,
        };
        this.runtimeStates.set(key, state);

        try {
            // Get channel manager (may already exist with default handler)
            const channelManager = getChannelManager();

            // Always update the message handler to ensure processor is used
            // This fixes the race condition where singleton is created before we can set the handler
            channelManager.setMessageHandler(async (uid, message) => {
                const processor = new ChannelMessageProcessor({
                    channelManager: getChannelManager(),
                    defaultProvider: provider,
                    defaultModel: model,
                });
                await processor.processMessage(uid, message);
            });

            // Connect the channel
            await channelManager.connectChannel(userId, account);

            // Update state to connected
            state.connected = true;
            this.runtimeStates.set(key, state);

            console.log(
                `[BackgroundService] Started channel ${account.channelType} for user ${userId} with model ${model}`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            state.running = false;
            state.lastError = message;
            state.lastStopAt = Date.now();
            this.runtimeStates.set(key, state);
            this.abortControllers.delete(key);

            console.error(`[BackgroundService] Failed to start channel ${key}:`, error);
        }
    }

    /**
     * Stop a single channel
     */
    async stopChannel(userId: string, channelAccountId: string): Promise<void> {
        const key = this.getKey(userId, channelAccountId);

        // Abort any running tasks
        const abort = this.abortControllers.get(key);
        if (abort) {
            abort.abort();
            this.abortControllers.delete(key);
        }

        // Get channel account for disconnect
        const [account] = await db
            .select()
            .from(channelAccounts)
            .where(
                and(eq(channelAccounts.id, channelAccountId), eq(channelAccounts.userId, userId))
            );

        if (account) {
            try {
                const channelManager = getChannelManager();
                await channelManager.disconnectChannel(
                    userId,
                    account.channelType,
                    account.channelId
                );
            } catch (error) {
                console.error(`[BackgroundService] Error disconnecting ${key}:`, error);
            }
        }

        // Update state
        const state = this.runtimeStates.get(key);
        if (state) {
            state.running = false;
            state.connected = false;
            state.lastStopAt = Date.now();
            this.runtimeStates.set(key, state);
        }

        console.log(`[BackgroundService] Stopped channel ${key}`);
    }

    /**
     * Start all active channels for a user
     */
    async startUserChannels(userId: string): Promise<ChannelRuntimeState[]> {
        const accounts = await db
            .select()
            .from(channelAccounts)
            .where(and(eq(channelAccounts.userId, userId), eq(channelAccounts.isActive, true)));

        await Promise.all(accounts.map((a) => this.startChannel(userId, a.id)));

        return this.getUserChannels(userId);
    }

    /**
     * Stop all channels for a user (but don't delete state)
     * Note: This is called on user sign out, but channels can be restarted
     */
    async stopUserChannels(userId: string): Promise<void> {
        const states = this.getUserChannels(userId);
        await Promise.all(
            states.map((s) => this.stopChannel(s.userId, s.channelAccountId))
        );
    }

    /**
     * Start all active channels from database
     * Called on server startup
     */
    async startAllChannels(): Promise<void> {
        if (this.started) {
            console.log("[BackgroundService] Already started");
            return;
        }

        console.log("[BackgroundService] Starting all active channels...");

        const activeAccounts = await db
            .select()
            .from(channelAccounts)
            .where(eq(channelAccounts.isActive, true));

        console.log(`[BackgroundService] Found ${activeAccounts.length} active channel(s)`);

        // Group by user and start
        const byUser = new Map<string, typeof activeAccounts>();
        for (const account of activeAccounts) {
            const existing = byUser.get(account.userId) || [];
            existing.push(account);
            byUser.set(account.userId, existing);
        }

        // Start channels for each user
        for (const [userId, accounts] of byUser) {
            for (const account of accounts) {
                await this.startChannel(userId, account.id);
            }
        }

        this.started = true;
        console.log("[BackgroundService] Startup complete");
    }

    /**
     * Shutdown all channels
     */
    async shutdown(): Promise<void> {
        console.log("[BackgroundService] Shutting down...");

        // Abort all
        for (const abort of this.abortControllers.values()) {
            abort.abort();
        }
        this.abortControllers.clear();

        // Disconnect all via channel manager
        const channelManager = getChannelManager();
        await channelManager.shutdown();

        // Update all states
        for (const [key, state] of this.runtimeStates) {
            state.running = false;
            state.connected = false;
            state.lastStopAt = Date.now();
            this.runtimeStates.set(key, state);
        }

        this.started = false;
        console.log("[BackgroundService] Shutdown complete");
    }

    /**
     * Check if service is running
     */
    isRunning(): boolean {
        return this.started;
    }
}

// ============================================================================
// Export singleton
// ============================================================================

export const backgroundService = ChannelBackgroundService.getInstance();

/**
 * Get the background service instance
 */
export function getBackgroundService(): ChannelBackgroundService {
    return ChannelBackgroundService.getInstance();
}
