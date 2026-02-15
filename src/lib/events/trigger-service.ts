/**
 * Event Trigger Service
 *
 * Routes external events to appropriate handlers:
 * - Webhooks
 * - File watches (future)
 * - Email (future)
 *
 * Includes rate limiting and execution logging.
 */

import { db } from "@/lib/db";
import { eventTriggers, eventTriggerLogs } from "@/lib/db/schema";
import type { EventTriggerSourceConfig, EventTriggerActionConfig } from "@/lib/db/schema";
import { eq, and, sql, gt } from "drizzle-orm";
import { emitTriggerEvent } from "@/lib/background/events";
import { getAdminSettings } from "@/lib/admin/settings";
import { runIsolatedAgent } from "@/lib/scheduler/isolated-agent";

// ============================================================================
// Types
// ============================================================================

export interface TriggerEvent {
    sourceType: "webhook" | "file_watch" | "email" | "schedule";
    payload: Record<string, unknown>;
    metadata?: {
        path?: string;
        method?: string;
        headers?: Record<string, string>;
        ip?: string;
    };
}

export interface TriggerResult {
    success: boolean;
    status: "success" | "error" | "skipped" | "rate_limited";
    output?: string;
    error?: string;
    durationMs: number;
}

// ============================================================================
// Trigger Service
// ============================================================================

class TriggerService {
    private static instance: TriggerService | null = null;
    private running = false;
    private triggerCounts: Map<string, { hour: number; lastReset: number }> = new Map();
    private hourlyResetInterval: ReturnType<typeof setInterval> | null = null;

    private constructor() {}

    static getInstance(): TriggerService {
        if (!TriggerService.instance) {
            TriggerService.instance = new TriggerService();
        }
        return TriggerService.instance;
    }

    /**
     * Start the trigger service
     */
    async start(): Promise<void> {
        if (this.running) {
            console.log("[TriggerService] Already running");
            return;
        }

        const settings = await getAdminSettings();
        if (!settings.eventTriggersEnabled) {
            console.log("[TriggerService] Event triggers disabled in settings");
            return;
        }

        console.log("[TriggerService] Starting trigger service...");
        this.running = true;

        // Reset rate limit counters every hour
        this.hourlyResetInterval = setInterval(() => {
            this.resetHourlyCounters();
        }, 3600000); // 1 hour

        console.log("[TriggerService] Started");
    }

    /**
     * Stop the trigger service
     */
    async stop(): Promise<void> {
        if (!this.running) {
            console.log("[TriggerService] Already stopped");
            return;
        }

        console.log("[TriggerService] Stopping...");
        this.running = false;
        this.triggerCounts.clear();
        if (this.hourlyResetInterval) {
            clearInterval(this.hourlyResetInterval);
            this.hourlyResetInterval = null;
        }
        console.log("[TriggerService] Stopped");
    }

    /**
     * Fire a trigger by ID
     */
    async fireTrigger(triggerId: string, event: TriggerEvent): Promise<TriggerResult> {
        const startTime = Date.now();

        try {
            // Get trigger details
            const [trigger] = await db
                .select()
                .from(eventTriggers)
                .where(eq(eventTriggers.id, triggerId))
                .limit(1);

            if (!trigger) {
                return {
                    success: false,
                    status: "error",
                    error: "Trigger not found",
                    durationMs: Date.now() - startTime,
                };
            }

            if (!trigger.isEnabled) {
                return {
                    success: false,
                    status: "skipped",
                    error: "Trigger is disabled",
                    durationMs: Date.now() - startTime,
                };
            }

            // Check rate limiting
            const rateLimitResult = this.checkRateLimit(triggerId, trigger.maxTriggersPerHour ?? 60);
            if (!rateLimitResult.allowed) {
                await this.logTriggerExecution(triggerId, event.payload, "rate_limited", null, "Rate limit exceeded");
                return {
                    success: false,
                    status: "rate_limited",
                    error: `Rate limit exceeded (${rateLimitResult.current}/${rateLimitResult.max} per hour)`,
                    durationMs: Date.now() - startTime,
                };
            }

            // Check cooldown
            if (trigger.cooldownSeconds && trigger.cooldownSeconds > 0 && trigger.lastTriggeredAt) {
                const cooldownMs = trigger.cooldownSeconds * 1000;
                const timeSinceLastTrigger = Date.now() - trigger.lastTriggeredAt.getTime();
                if (timeSinceLastTrigger < cooldownMs) {
                    await this.logTriggerExecution(triggerId, event.payload, "skipped", null, "Cooldown period active");
                    return {
                        success: false,
                        status: "skipped",
                        error: `Cooldown active (${Math.ceil((cooldownMs - timeSinceLastTrigger) / 1000)}s remaining)`,
                        durationMs: Date.now() - startTime,
                    };
                }
            }

            // Emit trigger fired event
            emitTriggerEvent("trigger:fired", "main", {
                triggerId,
                triggerName: trigger.name,
                userId: trigger.userId,
                sourceType: trigger.sourceType,
                status: "fired",
            });

            // Execute action
            const result = await this.executeAction(trigger, event);

            // Update trigger stats
            await db
                .update(eventTriggers)
                .set({
                    lastTriggeredAt: new Date(),
                    triggerCount: sql`trigger_count + 1`,
                    updatedAt: new Date(),
                })
                .where(eq(eventTriggers.id, triggerId));

            // Log execution
            await this.logTriggerExecution(
                triggerId,
                event.payload,
                result.success ? "success" : "error",
                result.output,
                result.error,
                result.durationMs
            );

            // Emit completion event
            emitTriggerEvent("trigger:completed", "main", {
                triggerId,
                triggerName: trigger.name,
                userId: trigger.userId,
                sourceType: trigger.sourceType,
                status: result.success ? "completed" : "failed",
                error: result.error,
                durationMs: result.durationMs,
            });

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            const durationMs = Date.now() - startTime;

            await this.logTriggerExecution(triggerId, event.payload, "error", null, errorMessage, durationMs);

            return {
                success: false,
                status: "error",
                error: errorMessage,
                durationMs,
            };
        }
    }

    /**
     * Find and fire triggers matching an event
     */
    async fireMatchingTriggers(event: TriggerEvent): Promise<TriggerResult[]> {
        const results: TriggerResult[] = [];

        // Find matching triggers
        const triggers = await db
            .select()
            .from(eventTriggers)
            .where(and(eq(eventTriggers.sourceType, event.sourceType), eq(eventTriggers.isEnabled, true)));

        for (const trigger of triggers) {
            // Check if trigger matches event
            if (this.matchesTrigger(trigger, event)) {
                const result = await this.fireTrigger(trigger.id, event);
                results.push(result);
            }
        }

        return results;
    }

    /**
     * Check if trigger matches event
     */
    private matchesTrigger(
        trigger: typeof eventTriggers.$inferSelect,
        event: TriggerEvent
    ): boolean {
        const sourceConfig = trigger.sourceConfig as EventTriggerSourceConfig | null;

        switch (event.sourceType) {
            case "webhook":
                // Match by webhook path
                if (sourceConfig?.webhookPath) {
                    const eventPath = event.metadata?.path || "";
                    return eventPath === sourceConfig.webhookPath || eventPath.endsWith(sourceConfig.webhookPath);
                }
                return true;

            case "file_watch":
                // Match by watch path
                if (sourceConfig?.watchPath) {
                    const filePath = (event.payload.path as string) || "";
                    return filePath.startsWith(sourceConfig.watchPath);
                }
                return true;

            case "email":
                // Match by email filter
                if (sourceConfig?.emailFilter) {
                    const from = (event.payload.from as string) || "";
                    const subject = (event.payload.subject as string) || "";

                    if (sourceConfig.emailFilter.from && !from.includes(sourceConfig.emailFilter.from)) {
                        return false;
                    }
                    if (sourceConfig.emailFilter.subject && !subject.includes(sourceConfig.emailFilter.subject)) {
                        return false;
                    }
                }
                return true;

            default:
                return true;
        }
    }

    /**
     * Execute trigger action
     */
    private async executeAction(
        trigger: typeof eventTriggers.$inferSelect,
        event: TriggerEvent
    ): Promise<TriggerResult> {
        const startTime = Date.now();
        const actionConfig = trigger.actionConfig as EventTriggerActionConfig | null;

        try {
            switch (trigger.actionType) {
                case "agent_turn":
                    return await this.executeAgentTurnAction(trigger, event, actionConfig);

                case "notify":
                    return await this.executeNotifyAction(trigger, event, actionConfig);

                case "skill":
                    return await this.executeSkillAction(trigger, event, actionConfig);

                default:
                    return {
                        success: false,
                        status: "error",
                        error: `Unknown action type: ${trigger.actionType}`,
                        durationMs: Date.now() - startTime,
                    };
            }
        } catch (error) {
            return {
                success: false,
                status: "error",
                error: error instanceof Error ? error.message : "Action execution failed",
                durationMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Execute agent turn action
     */
    private async executeAgentTurnAction(
        trigger: typeof eventTriggers.$inferSelect,
        event: TriggerEvent,
        config: EventTriggerActionConfig | null
    ): Promise<TriggerResult> {
        const startTime = Date.now();

        // Build message with event payload
        let message = config?.message || "Process this event: {{payload}}";
        message = message.replace("{{payload}}", JSON.stringify(event.payload, null, 2));

        // Run isolated agent
        const result = await runIsolatedAgent({
            userId: trigger.userId,
            taskId: trigger.id,
            taskName: trigger.name,
            message,
            sessionTarget: "isolated",
            includeRecentMessages: 0,
            deliver: Boolean(config?.channel || config?.targetId),
            channel: config?.channel,
            to: config?.targetId,
        });

        return {
            success: result.success,
            status: result.success ? "success" : "error",
            output: result.output,
            error: result.error,
            durationMs: Date.now() - startTime,
        };
    }

    /**
     * Execute notify action
     */
    private async executeNotifyAction(
        trigger: typeof eventTriggers.$inferSelect,
        event: TriggerEvent,
        config: EventTriggerActionConfig | null
    ): Promise<TriggerResult> {
        if (config?.notifyMethod === "email") {
            return this.executeEmailNotifyAction(trigger, event, config);
        }
        return this.executeChannelNotifyAction(trigger, event, config);
    }

    /**
     * Send notification via email (Gmail)
     */
    private async executeEmailNotifyAction(
        trigger: typeof eventTriggers.$inferSelect,
        event: TriggerEvent,
        config: EventTriggerActionConfig | null
    ): Promise<TriggerResult> {
        const startTime = Date.now();

        if (!config?.emailTo) {
            return {
                success: false,
                status: "error",
                error: "No email recipient configured",
                durationMs: Date.now() - startTime,
            };
        }

        // Build subject and body with {{payload}} replacement
        const payloadStr = JSON.stringify(event.payload, null, 2);
        let subject = config.emailSubject || `Trigger "${trigger.name}" fired`;
        subject = subject.replace("{{payload}}", JSON.stringify(event.payload));

        let body = config.message || `Event trigger "${trigger.name}" fired.\n\nPayload:\n{{payload}}`;
        body = body.replace("{{payload}}", payloadStr);

        try {
            const { sendEmail } = await import("@/lib/integrations/google/gmail");

            const recipients = config.emailTo.split(",").map((e) => e.trim()).filter(Boolean);
            const result = await sendEmail(trigger.userId, {
                to: recipients,
                subject,
                body,
            });

            if (!result) {
                return {
                    success: false,
                    status: "error",
                    error: "Failed to send email — Gmail may not be connected. Connect Google account in Settings.",
                    durationMs: Date.now() - startTime,
                };
            }

            return {
                success: true,
                status: "success",
                output: `Email sent to ${config.emailTo}`,
                durationMs: Date.now() - startTime,
            };
        } catch (error) {
            return {
                success: false,
                status: "error",
                error: error instanceof Error ? error.message : "Failed to send email notification",
                durationMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Send notification via channel connector (Telegram, Discord, Slack, etc.)
     */
    private async executeChannelNotifyAction(
        trigger: typeof eventTriggers.$inferSelect,
        event: TriggerEvent,
        config: EventTriggerActionConfig | null
    ): Promise<TriggerResult> {
        const startTime = Date.now();

        if (!config?.channel && !config?.targetId) {
            return {
                success: false,
                status: "error",
                error: "No notification target configured",
                durationMs: Date.now() - startTime,
            };
        }

        // Build notification message
        let message = config.message || `Trigger "${trigger.name}" fired`;
        message = message.replace("{{payload}}", JSON.stringify(event.payload, null, 2));

        try {
            const { getChannelManager } = await import("@/lib/channels/manager");
            const { channelAccounts } = await import("@/lib/db/schema");
            const channelManager = getChannelManager();

            // Find channel account
            let channelAccount = null;
            if (config.channel) {
                [channelAccount] = await db
                    .select()
                    .from(channelAccounts)
                    .where(
                        and(
                            eq(channelAccounts.userId, trigger.userId),
                            eq(channelAccounts.channelType, config.channel),
                            eq(channelAccounts.isActive, true)
                        )
                    )
                    .limit(1);
            }

            if (!channelAccount) {
                return {
                    success: false,
                    status: "error",
                    error: `No active channel account found for ${config.channel}`,
                    durationMs: Date.now() - startTime,
                };
            }

            // Send notification
            await channelManager.sendMessage(
                trigger.userId,
                channelAccount.channelType,
                channelAccount.channelId,
                message,
                { threadId: config.targetId }
            );

            return {
                success: true,
                status: "success",
                output: `Notification sent to ${channelAccount.channelType}`,
                durationMs: Date.now() - startTime,
            };
        } catch (error) {
            return {
                success: false,
                status: "error",
                error: error instanceof Error ? error.message : "Failed to send notification",
                durationMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Execute skill action
     */
    private async executeSkillAction(
        trigger: typeof eventTriggers.$inferSelect,
        event: TriggerEvent,
        config: EventTriggerActionConfig | null
    ): Promise<TriggerResult> {
        const startTime = Date.now();

        if (!config?.skillSlug) {
            return {
                success: false,
                status: "error",
                error: "No skill configured",
                durationMs: Date.now() - startTime,
            };
        }

        try {
            const { pluginRegistry, initializePlugins, pluginExecutor } = await import("@/lib/plugins");
            await initializePlugins();

            const plugin = pluginRegistry.get(config.skillSlug);
            if (!plugin) {
                return {
                    success: false,
                    status: "error",
                    error: `Skill not found: ${config.skillSlug}`,
                    durationMs: Date.now() - startTime,
                };
            }

            // Execute the first tool in the skill
            const tools = plugin.manifest.tools || [];
            if (tools.length === 0) {
                return {
                    success: false,
                    status: "error",
                    error: `Skill has no tools: ${config.skillSlug}`,
                    durationMs: Date.now() - startTime,
                };
            }

            const result = await pluginExecutor.execute(
                config.skillSlug,
                tools[0].name,
                event.payload,
                {
                    userId: trigger.userId,
                    config: {},
                }
            );

            return {
                success: result.success,
                status: result.success ? "success" : "error",
                output: typeof result.data === "string" ? result.data : JSON.stringify(result.data),
                error: result.error,
                durationMs: Date.now() - startTime,
            };
        } catch (error) {
            return {
                success: false,
                status: "error",
                error: error instanceof Error ? error.message : "Skill execution failed",
                durationMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Check rate limit
     */
    private checkRateLimit(triggerId: string, maxPerHour: number): { allowed: boolean; current: number; max: number } {
        const now = Date.now();
        const hourMs = 3600000;

        let counter = this.triggerCounts.get(triggerId);
        if (!counter || now - counter.lastReset > hourMs) {
            counter = { hour: 0, lastReset: now };
            this.triggerCounts.set(triggerId, counter);
        }

        if (counter.hour >= maxPerHour) {
            return { allowed: false, current: counter.hour, max: maxPerHour };
        }

        counter.hour++;
        return { allowed: true, current: counter.hour, max: maxPerHour };
    }

    /**
     * Reset hourly rate limit counters
     */
    private resetHourlyCounters(): void {
        const now = Date.now();
        const hourMs = 3600000;

        for (const [triggerId, counter] of this.triggerCounts) {
            if (now - counter.lastReset > hourMs) {
                counter.hour = 0;
                counter.lastReset = now;
            }
        }
    }

    /**
     * Log trigger execution
     */
    private async logTriggerExecution(
        triggerId: string,
        payload: Record<string, unknown>,
        status: "success" | "error" | "skipped" | "rate_limited",
        output: string | null | undefined,
        error: string | null | undefined,
        durationMs?: number
    ): Promise<void> {
        await db.insert(eventTriggerLogs).values({
            triggerId,
            eventPayload: payload,
            status,
            output: output ?? null,
            error: error ?? null,
            durationMs: durationMs ?? null,
        });
    }

    /**
     * Check if service is running
     */
    isRunning(): boolean {
        return this.running;
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const triggerService = TriggerService.getInstance();

// ============================================================================
// Convenience Functions
// ============================================================================

export async function startTriggerService(): Promise<void> {
    await triggerService.start();
}

export async function stopTriggerService(): Promise<void> {
    await triggerService.stop();
}

export async function fireTrigger(triggerId: string, event: TriggerEvent): Promise<TriggerResult> {
    return triggerService.fireTrigger(triggerId, event);
}

export async function fireMatchingTriggers(event: TriggerEvent): Promise<TriggerResult[]> {
    return triggerService.fireMatchingTriggers(event);
}
