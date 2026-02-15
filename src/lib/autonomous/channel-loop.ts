/**
 * Channel Autonomous Loop
 *
 * Provides channel-specific wrapper for autonomous mode with:
 * - Throttled progress updates (every N steps or N seconds)
 * - Message delivery to channel instead of stream
 * - Channel task tracking
 */

import { v4 as uuidv4 } from "uuid";
import {
    runAutonomousLoop,
    steerTask,
    abortTask,
    isTaskRunning,
    CHANNEL_ACTIVE_TASKS,
} from "./loop";
import { getChannelManager } from "@/lib/channels/manager";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import { db } from "@/lib/db";
import { channelAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { AutonomousStreamEvent } from "./types";

// ============================================================================
// Channel Task Tracking
// ============================================================================

/**
 * Get the active task for a channel account
 * Returns null if no active task or task has completed
 */
export function getActiveTaskForChannel(channelAccountId: string): string | null {
    const taskKey = CHANNEL_ACTIVE_TASKS.get(channelAccountId);
    if (taskKey && isTaskRunning(taskKey)) {
        return taskKey;
    }
    // Clean up stale entry
    if (taskKey) {
        CHANNEL_ACTIVE_TASKS.delete(channelAccountId);
    }
    return null;
}

// ============================================================================
// Channel Task Options
// ============================================================================

export interface ChannelAutonomousTaskOptions {
    userId: string;
    channelAccountId: string;
    channelId: string;
    channelThreadId?: string;
    prompt: string;
    modelId: string;
    maxSteps: number;
    timeoutMs: number;
    config: {
        toolsEnabled?: boolean;
        enabledTools?: string[];
        ragEnabled?: boolean;
        memoryEnabled?: boolean;
        agentId?: string;
        agentSystemPrompt?: string;
        temperature?: number;
    };
}

// ============================================================================
// Message Truncation for Platform Limits
// ============================================================================

const PLATFORM_LIMITS: Record<string, number> = {
    telegram: 4096,
    discord: 2000,
    slack: 40000,
    default: 4000,
};

function truncateForPlatform(message: string, channelType: string): string {
    const limit = PLATFORM_LIMITS[channelType] || PLATFORM_LIMITS.default;
    if (message.length <= limit) {
        return message;
    }
    return message.slice(0, limit - 50) + "\n\n...(truncated)";
}

// ============================================================================
// Start Channel Autonomous Task
// ============================================================================

/**
 * Start an autonomous task for a channel
 * Returns the task key immediately, task runs in background
 */
export async function startChannelAutonomousTask(
    options: ChannelAutonomousTaskOptions
): Promise<string> {
    // Check if already has active task
    const existing = getActiveTaskForChannel(options.channelAccountId);
    if (existing) {
        throw new Error("Already has an active autonomous task. Use /abort first.");
    }

    // Get channel account info for message delivery
    const [channelAccount] = await db
        .select()
        .from(channelAccounts)
        .where(eq(channelAccounts.id, options.channelAccountId))
        .limit(1);

    if (!channelAccount) {
        throw new Error("Channel account not found");
    }

    const channelType = channelAccount.channelType;

    // Get API keys for user
    const apiKeys = await getUserApiKeys(options.userId);

    // Generate task key early so we can return it
    const taskKey = uuidv4();

    // Throttling state for progress updates
    let lastProgressSent = 0;
    let lastProgressTime = Date.now();
    const PROGRESS_STEP_INTERVAL = 3;
    const PROGRESS_TIME_INTERVAL = 10000; // 10 seconds

    /**
     * Send a message to the channel
     */
    const sendToChannel = async (message: string) => {
        try {
            const truncated = truncateForPlatform(message, channelType);
            const manager = getChannelManager();
            await manager.sendMessage(
                options.userId,
                channelType,
                options.channelId,
                truncated,
                { threadId: options.channelThreadId }
            );
        } catch (error) {
            console.error("[ChannelAutonomous] Failed to send message:", error);
        }
    };

    /**
     * Event handler for autonomous loop events
     * Throttles progress updates and formats messages for channel
     */
    const onEvent = async (event: AutonomousStreamEvent) => {
        const now = Date.now();

        switch (event.type) {
            case "init":
                // Already sent acknowledgment in command handler
                break;

            case "progress": {
                // Throttle progress updates
                const currentStep = event.data?.totalSteps || 0;
                const stepsSinceLast = currentStep - lastProgressSent;
                const timeSinceLast = now - lastProgressTime;

                if (
                    stepsSinceLast >= PROGRESS_STEP_INTERVAL ||
                    timeSinceLast >= PROGRESS_TIME_INTERVAL
                ) {
                    lastProgressSent = currentStep;
                    lastProgressTime = now;
                    await sendToChannel(
                        `Step ${currentStep}/${options.maxSteps}: ${event.data?.summary || "Processing..."}`
                    );
                }
                break;
            }

            case "tool_call":
                // Optionally notify on tool calls (can be noisy, so we skip by default)
                // await sendToChannel(`Using: ${event.data?.toolName}`);
                break;

            case "steer_received":
                await sendToChannel("Steering received - adjusting approach");
                break;

            case "complete": {
                const finalOutput = event.data?.finalOutput || "Task completed.";
                const stats = `(${event.data?.totalSteps} steps, ${event.data?.totalToolCalls} tool calls)`;
                await sendToChannel(`**Task Complete** ${stats}\n\n${finalOutput}`);
                break;
            }

            case "error":
                await sendToChannel(`**Task Error**: ${event.data?.error}`);
                break;

            case "aborted":
                await sendToChannel("**Task Aborted**");
                break;

            case "timeout":
                await sendToChannel(
                    `**Task Timed Out** after ${Math.round(options.timeoutMs / 60000)} minutes`
                );
                break;

            // Ignored events (streaming not applicable for channels)
            case "step_start":
            case "text_delta":
            case "text_complete":
            case "tool_result":
                break;
        }
    };

    // Spawn background task (don't await!)
    // The task will run asynchronously and send updates to the channel
    runAutonomousLoop({
        userId: options.userId,
        prompt: options.prompt,
        modelId: options.modelId,
        maxSteps: options.maxSteps,
        timeoutMs: options.timeoutMs,
        config: options.config,
        apiKeys: apiKeys as Record<string, string>,
        onEvent,
        taskKey,
        channelAccountId: options.channelAccountId,
        channelId: options.channelId,
        channelThreadId: options.channelThreadId,
    }).catch((error) => {
        console.error("[ChannelAutonomous] Task failed:", error);
        sendToChannel(`**Task Failed**: ${error instanceof Error ? error.message : "Unknown error"}`);
    });

    return taskKey;
}

// Re-export for commands.ts
export { steerTask, abortTask, isTaskRunning };
