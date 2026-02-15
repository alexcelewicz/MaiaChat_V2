/**
 * Scheduled Task Management API
 *
 * PATCH /api/scheduled-tasks/[id] - Update a scheduled task
 * POST /api/scheduled-tasks/[id] - Run a scheduled task manually
 * DELETE /api/scheduled-tasks/[id] - Delete a scheduled task
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { agents, scheduledTasks } from "@/lib/db/schema";
import type { CronJobState } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import "@/lib/channels";
import { runIsolatedAgent } from "@/lib/scheduler/isolated-agent";
import { computeNextRunAt } from "@/lib/scheduler/schedule";
import { resolveUserTimezone } from "@/lib/scheduler/timezone";
import { ensureSchedulerStarted } from "@/lib/scheduler/boot";

function shouldRequireToolCallForTask(prompt: string): boolean {
    const normalized = prompt.toLowerCase();
    return /\b(weather|forecast|temperature|rain|wind|news|headline|latest|stock|price|exchange rate|today|current)\b/.test(normalized);
}

function resolveTaskExecution(
    payload: unknown,
    modelId: string | null
): { executionMode: "model" | "agent"; agentId: string | null; modelId: string | null } {
    const data = (payload || {}) as Record<string, unknown>;
    const executionMode = data.executionMode === "agent" ? "agent" : "model";
    const agentId = executionMode === "agent" && typeof data.agentId === "string" ? data.agentId : null;
    return {
        executionMode,
        agentId,
        modelId: executionMode === "agent" ? null : modelId,
    };
}

/**
 * Update a scheduled task
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        ensureSchedulerStarted("scheduled_tasks_api_patch");
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();

        // Get existing task to ensure it belongs to user
        const [existing] = await db
            .select()
            .from(scheduledTasks)
            .where(and(eq(scheduledTasks.id, id), eq(scheduledTasks.userId, userId)))
            .limit(1);

        if (!existing) {
            return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }

        // Build update object
        const updates: Record<string, unknown> = {
            updatedAt: new Date(),
        };
        const currentPayload = (existing.payload || {}) as Record<string, unknown>;
        let nextExecutionMode: "model" | "agent" =
            currentPayload.executionMode === "agent" ? "agent" : "model";
        let nextAgentId: string | null =
            typeof currentPayload.agentId === "string" ? currentPayload.agentId : null;

        if (body.name !== undefined) updates.name = body.name;
        if (body.prompt !== undefined) updates.prompt = body.prompt;
        if (body.cron !== undefined) {
            updates.cron = body.cron;
            // Recompute next run time when cron changes
            const tz = await resolveUserTimezone(userId, body.timezone || existing.timezone || null);
            const nextRunAt = computeNextRunAt(body.cron, tz);
            updates.nextRunAt = nextRunAt;
            updates.schedule = {
                kind: "cron",
                expr: body.cron,
                tz,
            };
        }
        if (body.timezone !== undefined) {
            updates.timezone = await resolveUserTimezone(userId, body.timezone || null);
            // Recompute next run time when timezone changes
            const cron = body.cron || existing.cron;
            const tz = await resolveUserTimezone(userId, body.timezone || existing.timezone || null);
            const nextRunAt = computeNextRunAt(cron, tz);
            updates.nextRunAt = nextRunAt;
            updates.schedule = {
                kind: "cron",
                expr: cron,
                tz,
            };
        }
        if (body.channelAccountId !== undefined) updates.channelAccountId = body.channelAccountId;
        if (body.executionMode === "agent" || body.executionMode === "model") {
            nextExecutionMode = body.executionMode;
        }
        if (body.agentId !== undefined) {
            nextAgentId = typeof body.agentId === "string" && body.agentId.trim()
                ? body.agentId.trim()
                : null;
        }
        if (nextExecutionMode === "agent") {
            if (!nextAgentId) {
                return NextResponse.json(
                    { error: "agentId is required when executionMode is 'agent'" },
                    { status: 400 }
                );
            }
            const [agent] = await db
                .select()
                .from(agents)
                .where(and(eq(agents.id, nextAgentId), eq(agents.userId, userId)))
                .limit(1);
            if (!agent) {
                return NextResponse.json({ error: "Agent not found" }, { status: 404 });
            }
            updates.modelId = null;
        } else if (body.modelId !== undefined) {
            updates.modelId = body.modelId;
        }
        if (body.isEnabled !== undefined) updates.isEnabled = body.isEnabled;
        if (body.isEnabled === false) {
            updates.nextRunAt = null;
        }
        if (body.isEnabled === true && (!existing.nextRunAt || existing.nextRunAt < new Date())) {
            const cron = body.cron || existing.cron;
            const tz = await resolveUserTimezone(userId, body.timezone || existing.timezone || null);
            const nextRunAt = computeNextRunAt(cron, tz);
            updates.nextRunAt = nextRunAt;
            updates.schedule = {
                kind: "cron",
                expr: cron,
                tz,
            };
        }
        if (body.prompt !== undefined) {
            updates.payload = {
                kind: "agentTurn",
                message: body.prompt,
                deliver: true,
                executionMode: nextExecutionMode,
                agentId: nextExecutionMode === "agent" ? nextAgentId : null,
            };
        } else if (
            body.executionMode !== undefined ||
            body.agentId !== undefined ||
            body.modelId !== undefined
        ) {
            updates.payload = {
                ...currentPayload,
                kind: "agentTurn",
                message: typeof currentPayload.message === "string" ? currentPayload.message : existing.prompt,
                deliver: true,
                executionMode: nextExecutionMode,
                agentId: nextExecutionMode === "agent" ? nextAgentId : null,
            };
        }

        const [updated] = await db
            .update(scheduledTasks)
            .set(updates)
            .where(eq(scheduledTasks.id, id))
            .returning();

        return NextResponse.json({ success: true, task: updated });
    } catch (error) {
        console.error("[API] Update scheduled task error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

/**
 * Run a scheduled task manually
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        ensureSchedulerStarted("scheduled_tasks_api_run");
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Get task
        const [task] = await db
            .select()
            .from(scheduledTasks)
            .where(and(eq(scheduledTasks.id, id), eq(scheduledTasks.userId, userId)))
            .limit(1);

        if (!task) {
            return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }

        // Run the task using isolated agent
        const execution = resolveTaskExecution(task.payload, task.modelId ?? null);
        const result = await runIsolatedAgent({
            userId,
            taskId: task.id,
            taskName: task.name,
            message: task.prompt,
            channelAccountId: task.channelAccountId ?? undefined,
            sessionTarget: "isolated",
            includeRecentMessages: 0,
            deliver: !!task.channelAccountId,
            timeout: 60000,
            modelId: execution.executionMode === "model" ? execution.modelId ?? undefined : undefined,
            agentId: execution.executionMode === "agent" ? execution.agentId ?? undefined : undefined,
            requireToolCall: shouldRequireToolCallForTask(task.prompt),
        });

        // Update task stats
        const currentState = (task.state ?? {}) as CronJobState;
        const currentCustomData = (currentState.customData ?? {}) as Record<string, unknown>;
        const nextState: CronJobState = {
            ...currentState,
            lastOutput: result.output?.substring(0, 4000),
            customData: {
                ...currentCustomData,
                taskExecutionStatus: result.taskExecutionStatus,
                primaryDeliveryStatus: result.primaryDeliveryStatus,
                failureNotificationStatus: result.failureNotificationStatus,
                deliveredTo: result.deliveredTo ?? null,
                lastRunAt: new Date().toISOString(),
            },
        };

        await db
            .update(scheduledTasks)
            .set({
                lastRunAt: new Date(),
                runCount: (task.runCount ?? 0) + 1,
                lastError: result.success ? null : result.error,
                lastOutput: result.output?.substring(0, 4000),
                state: nextState,
                updatedAt: new Date(),
            })
            .where(eq(scheduledTasks.id, id));

        return NextResponse.json({
            success: result.success,
            output: result.output,
            error: result.error,
            deliveredTo: result.deliveredTo,
            taskExecutionStatus: result.taskExecutionStatus,
            primaryDeliveryStatus: result.primaryDeliveryStatus,
            failureNotificationStatus: result.failureNotificationStatus,
        });
    } catch (error) {
        console.error("[API] Run scheduled task error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        ensureSchedulerStarted("scheduled_tasks_api_delete");
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        const deleted = await db.delete(scheduledTasks)
            .where(and(
                eq(scheduledTasks.id, id),
                eq(scheduledTasks.userId, userId)
            ))
            .returning();

        if (!deleted.length) {
            return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[API] Delete scheduled task error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
