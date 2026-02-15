/**
 * Enhanced Cron Service
 *
 * Timer-based execution using croner library.
 * Supports:
 * - One-shot (at specific time)
 * - Interval (every N milliseconds)
 * - Cron expression (with timezone)
 *
 * Replaces polling-based approach with proper timer scheduling.
 */

import { Cron } from "croner";
import { db } from "@/lib/db";
import { scheduledTasks, channelAccounts } from "@/lib/db/schema";
import type { CronSchedule, CronPayload, CronJobState } from "@/lib/db/schema";
import { eq, and, sql, isNotNull } from "drizzle-orm";
import { emitTaskEvent } from "@/lib/background/events";
import { heartbeatManager } from "@/lib/background/heartbeat";
import type {
    CronJobHandle,
    CronServiceStats,
    TaskRunContext,
    TaskRunResult,
    PayloadContext,
    PayloadResult,
    ParsedSchedule,
    ScheduleValidation,
} from "./types";

// ============================================================================
// Constants
// ============================================================================

const MAIN_AGENT_KEY = "main";
const DEFAULT_TIMEOUT_MS = 180000; // 3 minutes - enough for web searches
const MAX_CONCURRENT_TASKS = 10;
const ONE_SHOT_STALENESS_MS = 3600000; // 1 hour - skip one-shot tasks older than this

// ============================================================================
// Cron Service
// ============================================================================

class CronService {
    private static instance: CronService | null = null;
    private jobs: Map<string, Cron> = new Map();
    private timeouts: Map<string, NodeJS.Timeout> = new Map();
    private running = false;
    private stats: CronServiceStats = {
        activeJobs: 0,
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        lastRunAt: null,
    };
    private runningTasks: Set<string> = new Set();

    private constructor() {}

    static getInstance(): CronService {
        if (!CronService.instance) {
            CronService.instance = new CronService();
        }
        return CronService.instance;
    }

    /**
     * Start the cron service
     */
    async start(): Promise<void> {
        if (this.running) {
            console.log("[CronService] Already running");
            return;
        }

        console.log("[CronService] Starting cron service...");
        this.running = true;

        // Load all enabled tasks and schedule them
        await this.loadAndScheduleTasks();

        console.log(`[CronService] Started with ${this.jobs.size} active jobs`);
    }

    /**
     * Stop the cron service
     */
    async stop(): Promise<void> {
        if (!this.running) {
            console.log("[CronService] Already stopped");
            return;
        }

        console.log("[CronService] Stopping cron service...");

        // Stop all cron jobs
        for (const [taskId, job] of this.jobs) {
            job.stop();
        }
        this.jobs.clear();

        // Clear all timeouts
        for (const [taskId, timeout] of this.timeouts) {
            clearTimeout(timeout);
        }
        this.timeouts.clear();

        this.running = false;
        console.log("[CronService] Stopped");
    }

    /**
     * Load all enabled tasks and schedule them
     */
    private async loadAndScheduleTasks(): Promise<void> {
        const tasks = await db
            .select()
            .from(scheduledTasks)
            .where(eq(scheduledTasks.isEnabled, true));

        let skippedStale = 0;
        for (const task of tasks) {
            const scheduled = await this.scheduleTask(task.id, task.userId);
            if (!scheduled) skippedStale++;
        }

        if (skippedStale > 0) {
            console.warn(`[CronService] Skipped ${skippedStale} stale/invalid task(s) on startup`);
        }
    }

    /**
     * Schedule a single task
     */
    async scheduleTask(taskId: string, userId: string): Promise<boolean> {
        // Stop existing job if any
        this.unscheduleTask(taskId);

        // Get task from database
        const [task] = await db
            .select()
            .from(scheduledTasks)
            .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.userId, userId)))
            .limit(1);

        if (!task || !task.isEnabled) {
            return false;
        }

        // Determine schedule type
        const schedule = task.schedule || this.buildScheduleFromLegacy(task.cron, task.timezone);
        if (!schedule) {
            console.error(`[CronService] Invalid schedule for task ${taskId}`);
            return false;
        }

        try {
            switch (schedule.kind) {
                case "at":
                    return this.scheduleOneShotTask(taskId, userId, schedule.atMs, task);
                case "every":
                    return this.scheduleIntervalTask(taskId, userId, schedule.everyMs, task);
                case "cron":
                    return this.scheduleCronTask(taskId, userId, schedule.expr, schedule.tz, task);
                default:
                    console.error(`[CronService] Unknown schedule kind for task ${taskId}`);
                    return false;
            }
        } catch (error) {
            console.error(`[CronService] Failed to schedule task ${taskId}:`, error);
            return false;
        }
    }

    /**
     * Schedule a one-shot task (runs once at specific time)
     */
    private scheduleOneShotTask(
        taskId: string,
        userId: string,
        atMs: number,
        task: typeof scheduledTasks.$inferSelect
    ): boolean {
        const now = Date.now();
        const delay = atMs - now;

        if (delay <= 0) {
            const overdueMs = now - atMs;
            if (overdueMs > ONE_SHOT_STALENESS_MS) {
                // Task is too old (e.g. server was down) — skip and disable instead of
                // firing a stale action that's no longer relevant
                console.warn(`[CronService] One-shot task ${taskId} is ${Math.round(overdueMs / 60000)}min past due, skipping and disabling`);
                void db
                    .update(scheduledTasks)
                    .set({ isEnabled: false, lastError: "Skipped: past due by more than 1 hour", updatedAt: new Date() })
                    .where(eq(scheduledTasks.id, taskId));
                return false;
            }
            // Recently past due — run immediately
            console.log(`[CronService] One-shot task ${taskId} is ${Math.round(overdueMs / 1000)}s past due, running immediately`);
            void this.runTask({ taskId, userId, channelAccountId: task.channelAccountId ?? undefined, runAt: new Date(), isManualRun: false });
            return true;
        }

        const timeout = setTimeout(async () => {
            this.timeouts.delete(taskId);
            await this.runTask({ taskId, userId, channelAccountId: task.channelAccountId ?? undefined, runAt: new Date(), isManualRun: false });

            // Disable task after one-shot execution
            await db
                .update(scheduledTasks)
                .set({ isEnabled: false, updatedAt: new Date() })
                .where(eq(scheduledTasks.id, taskId));
        }, delay);

        this.timeouts.set(taskId, timeout);
        this.stats.activeJobs++;

        // Update nextRunAt
        void db
            .update(scheduledTasks)
            .set({ nextRunAt: new Date(atMs), updatedAt: new Date() })
            .where(eq(scheduledTasks.id, taskId));

        console.log(`[CronService] Scheduled one-shot task ${taskId} for ${new Date(atMs).toISOString()}`);
        return true;
    }

    /**
     * Schedule an interval task (runs every N milliseconds)
     */
    private scheduleIntervalTask(
        taskId: string,
        userId: string,
        everyMs: number,
        task: typeof scheduledTasks.$inferSelect
    ): boolean {
        // Use setTimeout for first run, then setInterval
        const runAndReschedule = async () => {
            await this.runTask({ taskId, userId, channelAccountId: task.channelAccountId ?? undefined, runAt: new Date(), isManualRun: false });

            // Schedule next run
            const timeout = setTimeout(runAndReschedule, everyMs);
            this.timeouts.set(taskId, timeout);

            // Update nextRunAt
            await db
                .update(scheduledTasks)
                .set({ nextRunAt: new Date(Date.now() + everyMs), updatedAt: new Date() })
                .where(eq(scheduledTasks.id, taskId));
        };

        const timeout = setTimeout(runAndReschedule, everyMs);
        this.timeouts.set(taskId, timeout);
        this.stats.activeJobs++;

        // Update nextRunAt
        void db
            .update(scheduledTasks)
            .set({ nextRunAt: new Date(Date.now() + everyMs), updatedAt: new Date() })
            .where(eq(scheduledTasks.id, taskId));

        console.log(`[CronService] Scheduled interval task ${taskId} every ${everyMs}ms`);
        return true;
    }

    /**
     * Schedule a cron task
     */
    private scheduleCronTask(
        taskId: string,
        userId: string,
        expr: string,
        tz: string | undefined,
        task: typeof scheduledTasks.$inferSelect
    ): boolean {
        try {
            const job = new Cron(
                expr,
                {
                    timezone: tz,
                    paused: false,
                    catch: (error) => {
                        console.error(`[CronService] Cron job error for ${taskId}:`, error);
                    },
                },
                async () => {
                    await this.runTask({ taskId, userId, channelAccountId: task.channelAccountId ?? undefined, runAt: new Date(), isManualRun: false });

                    // Update nextRunAt
                    const nextRun = job.nextRun();
                    if (nextRun) {
                        await db
                            .update(scheduledTasks)
                            .set({ nextRunAt: nextRun, updatedAt: new Date() })
                            .where(eq(scheduledTasks.id, taskId));
                    }
                }
            );

            this.jobs.set(taskId, job);
            this.stats.activeJobs++;

            // Update nextRunAt
            const nextRun = job.nextRun();
            if (nextRun) {
                void db
                    .update(scheduledTasks)
                    .set({ nextRunAt: nextRun, updatedAt: new Date() })
                    .where(eq(scheduledTasks.id, taskId));
            }

            console.log(`[CronService] Scheduled cron task ${taskId} with expression "${expr}"${tz ? ` (${tz})` : ""}`);
            return true;
        } catch (error) {
            console.error(`[CronService] Invalid cron expression for task ${taskId}:`, error);

            // Disable task with error
            void db
                .update(scheduledTasks)
                .set({
                    isEnabled: false,
                    lastError: `Invalid cron expression: ${error instanceof Error ? error.message : "Unknown error"}`,
                    updatedAt: new Date(),
                })
                .where(eq(scheduledTasks.id, taskId));

            return false;
        }
    }

    /**
     * Unschedule a task
     */
    unscheduleTask(taskId: string): void {
        const job = this.jobs.get(taskId);
        if (job) {
            job.stop();
            this.jobs.delete(taskId);
            this.stats.activeJobs--;
        }

        const timeout = this.timeouts.get(taskId);
        if (timeout) {
            clearTimeout(timeout);
            this.timeouts.delete(taskId);
            this.stats.activeJobs--;
        }
    }

    /**
     * Run a task
     */
    async runTask(context: TaskRunContext): Promise<TaskRunResult> {
        const { taskId, userId, channelAccountId, runAt, isManualRun } = context;
        const startTime = Date.now();

        // Prevent concurrent runs of the same task
        if (this.runningTasks.has(taskId)) {
            console.log(`[CronService] Task ${taskId} is already running, skipping`);
            return {
                success: false,
                error: "Task is already running",
                nextRunAt: null,
                durationMs: 0,
            };
        }

        // Check concurrent task limit
        if (this.runningTasks.size >= MAX_CONCURRENT_TASKS) {
            console.log(`[CronService] Max concurrent tasks reached, delaying ${taskId}`);
            return {
                success: false,
                error: "Max concurrent tasks reached",
                nextRunAt: null,
                durationMs: 0,
            };
        }

        this.runningTasks.add(taskId);
        this.stats.totalRuns++;
        this.stats.lastRunAt = new Date();

        // Emit task started event
        emitTaskEvent("task:started", MAIN_AGENT_KEY, {
            taskId,
            taskName: "",
            userId,
            channelAccountId,
            status: "started",
        });

        try {
            // Get task details
            const [task] = await db
                .select()
                .from(scheduledTasks)
                .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.userId, userId)))
                .limit(1);

            if (!task) {
                throw new Error("Task not found");
            }

            // Determine payload
            const payload = task.payload || this.buildPayloadFromLegacy(task.prompt);

            // Execute payload
            const payloadContext: PayloadContext = {
                userId,
                taskId,
                taskName: task.name,
                channelAccountId: task.channelAccountId ?? undefined,
                sessionTarget: (task.sessionTarget as "main" | "isolated") || "isolated",
                includeRecentMessages: task.includeRecentMessages ?? 0,
                isolation: task.isolation as { maxTokens?: number; timeout?: number } | undefined,
            };

            const payloadResult = await this.executePayload(payload, payloadContext);

            // Calculate next run
            const schedule = task.schedule || this.buildScheduleFromLegacy(task.cron, task.timezone);
            let nextRunAt: Date | null = null;
            if (schedule?.kind === "cron") {
                const job = this.jobs.get(taskId);
                nextRunAt = job?.nextRun() ?? null;
            } else if (schedule?.kind === "every") {
                nextRunAt = new Date(Date.now() + schedule.everyMs);
            }

            // Update task state
            const consecutiveFailures = payloadResult.success ? 0 : ((task.state as CronJobState)?.consecutiveFailures ?? 0) + 1;
            const state: CronJobState = {
                lastOutput: payloadResult.output?.substring(0, 10000),
                lastDurationMs: payloadResult.durationMs,
                consecutiveFailures,
            };

            // Auto-disable after 3 consecutive failures to prevent runaway loops
            const MAX_CONSECUTIVE_FAILURES = 3;
            const shouldAutoDisable = consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;

            await db
                .update(scheduledTasks)
                .set({
                    lastRunAt: runAt,
                    nextRunAt: shouldAutoDisable ? null : nextRunAt,
                    lastError: payloadResult.success ? null : payloadResult.error,
                    lastOutput: payloadResult.output?.substring(0, 10000),
                    runCount: sql`run_count + 1`,
                    state,
                    ...(shouldAutoDisable ? { isEnabled: false } : {}),
                    updatedAt: new Date(),
                })
                .where(eq(scheduledTasks.id, taskId));

            if (shouldAutoDisable) {
                console.warn(`[CronService] Auto-disabled task "${task.name}" (${taskId}) after ${consecutiveFailures} consecutive failures. Last error: ${payloadResult.error}`);
                this.unscheduleTask(taskId);
            }

            // Update daemon stats
            await heartbeatManager.incrementTaskCount(MAIN_AGENT_KEY);

            const durationMs = Date.now() - startTime;

            if (payloadResult.success) {
                this.stats.successfulRuns++;
                emitTaskEvent("task:completed", MAIN_AGENT_KEY, {
                    taskId,
                    taskName: task.name,
                    userId,
                    channelAccountId: task.channelAccountId ?? undefined,
                    status: "completed",
                    output: payloadResult.output?.substring(0, 500),
                    durationMs,
                });
            } else {
                this.stats.failedRuns++;
                emitTaskEvent("task:failed", MAIN_AGENT_KEY, {
                    taskId,
                    taskName: task.name,
                    userId,
                    channelAccountId: task.channelAccountId ?? undefined,
                    status: "failed",
                    error: payloadResult.error,
                    durationMs,
                });
            }

            return {
                success: payloadResult.success,
                output: payloadResult.output,
                error: payloadResult.error,
                nextRunAt,
                durationMs,
                payloadResult,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            const durationMs = Date.now() - startTime;

            this.stats.failedRuns++;

            // Update task with error
            await db
                .update(scheduledTasks)
                .set({
                    lastRunAt: runAt,
                    lastError: errorMessage,
                    runCount: sql`run_count + 1`,
                    updatedAt: new Date(),
                })
                .where(eq(scheduledTasks.id, taskId));

            emitTaskEvent("task:failed", MAIN_AGENT_KEY, {
                taskId,
                taskName: "",
                userId,
                channelAccountId,
                status: "failed",
                error: errorMessage,
                durationMs,
            });

            return {
                success: false,
                error: errorMessage,
                nextRunAt: null,
                durationMs,
            };
        } finally {
            this.runningTasks.delete(taskId);
        }
    }

    /**
     * Execute a payload
     */
    private async executePayload(payload: CronPayload, context: PayloadContext): Promise<PayloadResult> {
        const startTime = Date.now();

        try {
            switch (payload.kind) {
                case "systemEvent":
                    return await this.executeSystemEvent(payload.text, context);
                case "agentTurn":
                    return await this.executeAgentTurn(payload, context);
                default:
                    return {
                        success: false,
                        error: `Unknown payload kind: ${(payload as { kind: string }).kind}`,
                        durationMs: Date.now() - startTime,
                    };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Payload execution failed",
                durationMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Execute a system event payload
     */
    private async executeSystemEvent(text: string, context: PayloadContext): Promise<PayloadResult> {
        const startTime = Date.now();

        // System events are injected into the session as system messages
        // For now, just log them - in the future, this could trigger specific behaviors
        console.log(`[CronService] System event for ${context.taskName}: ${text}`);

        return {
            success: true,
            output: `System event: ${text}`,
            durationMs: Date.now() - startTime,
        };
    }

    /**
     * Execute an agent turn payload
     */
    private async executeAgentTurn(
        payload: { kind: "agentTurn"; message: string; deliver?: boolean; channel?: string; to?: string },
        context: PayloadContext
    ): Promise<PayloadResult> {
        const startTime = Date.now();

        try {
            // Import isolated agent runner
            const { runIsolatedAgent } = await import("./isolated-agent");

            const result = await runIsolatedAgent({
                userId: context.userId,
                taskId: context.taskId,
                taskName: context.taskName,
                message: payload.message,
                channelAccountId: context.channelAccountId,
                sessionTarget: context.sessionTarget,
                includeRecentMessages: context.includeRecentMessages,
                deliver: payload.deliver ?? true,
                channel: payload.channel,
                to: payload.to,
                timeout: context.isolation?.timeout ?? DEFAULT_TIMEOUT_MS,
                maxTokens: context.isolation?.maxTokens,
            });

            return {
                success: result.success,
                output: result.output,
                error: result.error,
                durationMs: Date.now() - startTime,
                tokensUsed: result.tokensUsed,
                deliveredTo: result.deliveredTo,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Agent turn failed",
                durationMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Build schedule from legacy format
     */
    private buildScheduleFromLegacy(cron: string, timezone?: string | null): CronSchedule | null {
        if (!cron) return null;
        return {
            kind: "cron",
            expr: cron,
            tz: timezone ?? undefined,
        };
    }

    /**
     * Build payload from legacy format
     */
    private buildPayloadFromLegacy(prompt: string): CronPayload {
        return {
            kind: "agentTurn",
            message: prompt,
            deliver: true,
        };
    }

    /**
     * Run a task manually (outside of schedule)
     */
    async runTaskNow(taskId: string, userId: string): Promise<TaskRunResult> {
        return this.runTask({
            taskId,
            userId,
            runAt: new Date(),
            isManualRun: true,
        });
    }

    /**
     * Get service statistics
     */
    getStats(): CronServiceStats {
        return { ...this.stats };
    }

    /**
     * Check if service is running
     */
    isRunning(): boolean {
        return this.running;
    }

    /**
     * Validate a schedule
     */
    validateSchedule(schedule: CronSchedule): ScheduleValidation {
        try {
            switch (schedule.kind) {
                case "at":
                    if (typeof schedule.atMs !== "number" || schedule.atMs < 0) {
                        return { valid: false, error: "Invalid timestamp" };
                    }
                    return { valid: true, nextRun: new Date(schedule.atMs) };

                case "every":
                    if (typeof schedule.everyMs !== "number" || schedule.everyMs < 1000) {
                        return { valid: false, error: "Interval must be at least 1 second" };
                    }
                    return { valid: true, nextRun: new Date(Date.now() + schedule.everyMs) };

                case "cron":
                    const job = new Cron(schedule.expr, { timezone: schedule.tz, paused: true });
                    const nextRun = job.nextRun();
                    job.stop();
                    return { valid: true, nextRun: nextRun ?? undefined };

                default:
                    return { valid: false, error: "Unknown schedule kind" };
            }
        } catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : "Invalid schedule",
            };
        }
    }

    /**
     * Parse schedule to human-readable format
     */
    parseSchedule(schedule: CronSchedule): ParsedSchedule {
        switch (schedule.kind) {
            case "at":
                return {
                    kind: "at",
                    nextRunAt: new Date(schedule.atMs),
                    isOneShot: true,
                    humanReadable: `Once at ${new Date(schedule.atMs).toLocaleString()}`,
                };

            case "every":
                const seconds = Math.floor(schedule.everyMs / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                let readable: string;
                if (hours > 0) {
                    readable = `Every ${hours} hour${hours > 1 ? "s" : ""}`;
                } else if (minutes > 0) {
                    readable = `Every ${minutes} minute${minutes > 1 ? "s" : ""}`;
                } else {
                    readable = `Every ${seconds} second${seconds > 1 ? "s" : ""}`;
                }
                return {
                    kind: "every",
                    nextRunAt: new Date(Date.now() + schedule.everyMs),
                    isOneShot: false,
                    humanReadable: readable,
                };

            case "cron":
                try {
                    const job = new Cron(schedule.expr, { timezone: schedule.tz, paused: true });
                    const nextRun = job.nextRun();
                    job.stop();
                    return {
                        kind: "cron",
                        nextRunAt: nextRun,
                        isOneShot: false,
                        humanReadable: `Cron: ${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ""}`,
                    };
                } catch {
                    return {
                        kind: "cron",
                        nextRunAt: null,
                        isOneShot: false,
                        humanReadable: `Invalid cron: ${schedule.expr}`,
                    };
                }
        }
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const cronService = CronService.getInstance();

// ============================================================================
// Convenience Functions
// ============================================================================

export async function startCronService(): Promise<void> {
    await cronService.start();
}

export async function stopCronService(): Promise<void> {
    await cronService.stop();
}

export async function scheduleTask(taskId: string, userId: string): Promise<boolean> {
    return cronService.scheduleTask(taskId, userId);
}

export function unscheduleTask(taskId: string): void {
    cronService.unscheduleTask(taskId);
}

export async function runTaskNow(taskId: string, userId: string): Promise<TaskRunResult> {
    return cronService.runTaskNow(taskId, userId);
}

export function getCronServiceStats(): CronServiceStats {
    return cronService.getStats();
}

export function validateSchedule(schedule: CronSchedule): ScheduleValidation {
    return cronService.validateSchedule(schedule);
}

export function parseSchedule(schedule: CronSchedule): ParsedSchedule {
    return cronService.parseSchedule(schedule);
}
