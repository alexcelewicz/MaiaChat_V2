import { db } from "@/lib/db";
import { scheduledTasks } from "@/lib/db/schema";
import type { CronJobState } from "@/lib/db/schema";
import { and, eq, lte, sql, isNull, lt, or } from "drizzle-orm";
import { computeNextRunAt } from "./schedule";
import { runIsolatedAgent } from "./isolated-agent";
import crypto from "crypto";
import os from "os";

type ScheduledTask = typeof scheduledTasks.$inferSelect;

function shouldRequireToolCallForTask(prompt: string): boolean {
    const normalized = prompt.toLowerCase();
    // Require tools when the task clearly depends on fresh external data.
    return /\b(weather|forecast|temperature|rain|wind|news|headline|latest|stock|price|exchange rate|today|current)\b/.test(normalized);
}

function resolveTaskExecution(
    payload: unknown,
    modelId: string | null
): { executionMode: "model" | "agent"; agentId?: string; modelId?: string } {
    const data = (payload || {}) as Record<string, unknown>;
    const executionMode = data.executionMode === "agent" ? "agent" : "model";
    const agentId = executionMode === "agent" && typeof data.agentId === "string"
        ? data.agentId
        : undefined;
    return {
        executionMode,
        agentId,
        modelId: executionMode === "model" ? modelId ?? undefined : undefined,
    };
}

class ScheduledTaskRunner {
    private static instance: ScheduledTaskRunner | null = null;
    private timer: NodeJS.Timeout | null = null;
    private running = false;
    private tickInProgress = false;
    private readonly pollIntervalMs = 30_000;
    private readonly lockTtlMs = 5 * 60 * 1000;
    private readonly lockOwner = `${process.pid}-${os.hostname()}-${crypto.randomUUID()}`;

    private constructor() {}

    static getInstance(): ScheduledTaskRunner {
        if (!ScheduledTaskRunner.instance) {
            ScheduledTaskRunner.instance = new ScheduledTaskRunner();
        }
        return ScheduledTaskRunner.instance;
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.timer = setInterval(() => {
            void this.tick();
        }, this.pollIntervalMs);
        void this.tick();
        console.log("[Scheduler] Started scheduled task runner");
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.running = false;
        console.log("[Scheduler] Stopped scheduled task runner");
    }

    isRunning(): boolean {
        return this.running;
    }

    private async tick(): Promise<void> {
        if (this.tickInProgress) return;
        this.tickInProgress = true;

        try {
            const now = new Date();
            const dueTasks = await db.select()
                .from(scheduledTasks)
                .where(and(
                    eq(scheduledTasks.isEnabled, true),
                    lte(scheduledTasks.nextRunAt, now),
                    or(
                        isNull(scheduledTasks.lockExpiresAt),
                        lt(scheduledTasks.lockExpiresAt, now)
                    )
                ));

            if (dueTasks.length === 0) return;

            for (const task of dueTasks) {
                const claimedTask = await this.claimTask(task, now);
                if (!claimedTask) continue;
                await this.runTask(claimedTask, now);
            }
        } catch (error) {
            console.error("[Scheduler] Tick error:", error);
        } finally {
            this.tickInProgress = false;
        }
    }

    private async claimTask(task: ScheduledTask, runAt: Date): Promise<ScheduledTask | null> {
        const lockExpiresAt = new Date(runAt.getTime() + this.lockTtlMs);

        const [claimed] = await db
            .update(scheduledTasks)
            .set({
                lockOwner: this.lockOwner,
                lockExpiresAt,
                runningAt: runAt,
                updatedAt: new Date(),
            })
            .where(and(
                eq(scheduledTasks.id, task.id),
                eq(scheduledTasks.isEnabled, true),
                lte(scheduledTasks.nextRunAt, runAt),
                or(
                    isNull(scheduledTasks.lockExpiresAt),
                    lt(scheduledTasks.lockExpiresAt, runAt)
                )
            ))
            .returning();

        return claimed ?? null;
    }

    private async runTask(task: ScheduledTask, runAt: Date): Promise<void> {
        const nextRunAt = computeNextRunAt(task.cron, task.timezone || undefined, new Date(runAt.getTime() + 1000));
        let lastError: string | null = null;
        let lastOutput: string | null = null;
        let runStatus: {
            taskExecutionStatus: "success" | "failed";
            primaryDeliveryStatus: "delivered" | "failed" | "not_requested";
            failureNotificationStatus: "sent" | "failed" | "skipped";
            deliveredTo: string | null;
        } = {
            taskExecutionStatus: "failed",
            primaryDeliveryStatus: task.channelAccountId ? "failed" : "not_requested",
            failureNotificationStatus: "skipped",
            deliveredTo: null,
        };

        try {
            console.log(`[Scheduler] Running task: ${task.name} (${task.id})`);
            const execution = resolveTaskExecution(task.payload, task.modelId ?? null);

            // Use isolated agent runner which handles delivery correctly
            const result = await runIsolatedAgent({
                userId: task.userId,
                taskId: task.id,
                taskName: task.name,
                message: task.prompt,
                channelAccountId: task.channelAccountId ?? undefined,
                sessionTarget: "isolated",
                includeRecentMessages: 0,
                deliver: !!task.channelAccountId, // Only deliver if channel is configured
                timeout: 180000, // 3 minutes - enough for web searches
                modelId: execution.modelId,
                agentId: execution.agentId,
                requireToolCall: shouldRequireToolCallForTask(task.prompt),
            });

            if (!result.success) {
                lastError = result.error || "Scheduled task failed";
            } else {
                lastOutput = result.output?.substring(0, 4000) ?? null;
                console.log(`[Scheduler] Task completed: ${task.name}, delivered to: ${result.deliveredTo || "none"}`);
            }

            runStatus = {
                taskExecutionStatus: result.taskExecutionStatus,
                primaryDeliveryStatus: result.primaryDeliveryStatus,
                failureNotificationStatus: result.failureNotificationStatus,
                deliveredTo: result.deliveredTo ?? null,
            };
        } catch (error) {
            lastError = error instanceof Error ? error.message : "Scheduled task failed";
            console.error("[Scheduler] Task run error:", error);
        }

        const currentState = (task.state ?? {}) as CronJobState;
        const currentCustomData = (currentState.customData ?? {}) as Record<string, unknown>;
        const nextState: CronJobState = {
            ...currentState,
            lastOutput: lastOutput ?? undefined,
            customData: {
                ...currentCustomData,
                ...runStatus,
                lastRunAt: runAt.toISOString(),
            },
        };

        await db.update(scheduledTasks)
            .set({
                lastRunAt: runAt,
                nextRunAt: nextRunAt || null,
                lastError,
                lastOutput,
                runCount: sql`run_count + 1`,
                isEnabled: nextRunAt ? task.isEnabled : false,
                lockOwner: null,
                lockExpiresAt: null,
                runningAt: null,
                state: nextState,
                updatedAt: new Date(),
            })
            .where(eq(scheduledTasks.id, task.id));
    }
}

export const scheduledTaskRunner = ScheduledTaskRunner.getInstance();

export function startScheduledTaskRunner(): void {
    scheduledTaskRunner.start();
}

export function stopScheduledTaskRunner(): void {
    scheduledTaskRunner.stop();
}
