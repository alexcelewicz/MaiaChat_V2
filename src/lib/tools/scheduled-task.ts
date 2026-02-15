/**
 * Scheduled Task Tool
 *
 * AI tool for managing scheduled tasks (cron jobs).
 * Supports: list, create, update, delete, toggle, run actions.
 *
 * Allows the AI to create and manage scheduled tasks on behalf of the user.
 */

import { z } from "zod";
import type { Tool, ToolResult, ToolContext } from "./types";
import { db } from "@/lib/db";
import { scheduledTasks, channelAccounts, agents } from "@/lib/db/schema";
import { eq, and, desc, isNull, gte } from "drizzle-orm";
import { computeNextRunAt } from "@/lib/scheduler/schedule";
import { runIsolatedAgent } from "@/lib/scheduler/isolated-agent";
import { resolveUserTimezone } from "@/lib/scheduler/timezone";
import { ensureSchedulerStarted } from "@/lib/scheduler/boot";

// ============================================================================
// Schema
// ============================================================================

const scheduledTaskSchema = z.object({
    action: z.enum(["list", "create", "update", "delete", "toggle", "run"]).describe(
        "The action to perform: list (show tasks), create (new task), update (modify), delete (remove), toggle (enable/disable), run (execute now)"
    ),
    taskId: z.string().uuid().optional().describe(
        "The task ID (required for update, delete, toggle, run actions)"
    ),
    name: z.string().optional().describe(
        "Task name (required for create, optional for update)"
    ),
    prompt: z.string().optional().describe(
        "The prompt/instructions for the AI to execute (required for create, optional for update)"
    ),
    schedule: z.string().optional().describe(
        `The cron expression for scheduling. Examples:
- "0 8 * * *" = Every day at 8:00 AM
- "0 9 * * 1-5" = Weekdays at 9:00 AM
- "*/30 * * * *" = Every 30 minutes
- "0 0 1 * *" = First day of each month at midnight`
    ),
    timezone: z.string().optional().describe(
        "Timezone for the schedule (e.g., 'America/New_York', 'Europe/London'). Defaults to UTC."
    ),
    channelType: z.string().optional().describe(
        "Channel to deliver results to: 'telegram', 'discord', 'slack'. If not specified, results are stored but not delivered."
    ),
    modelId: z.string().optional().describe(
        "Model ID to use (e.g., 'gpt-4o', 'claude-sonnet-4-20250514'). Uses default if not specified."
    ),
    executionMode: z.enum(["model", "agent"]).optional().describe(
        "How the task should run: model (direct model ID) or agent (preconfigured agent profile)."
    ),
    agentId: z.string().uuid().optional().describe(
        "Agent ID to use when executionMode is 'agent'."
    ),
    enabled: z.boolean().optional().describe(
        "Whether the task is enabled (for toggle action, or to set on create/update)"
    ),
});

type ScheduledTaskParams = z.infer<typeof scheduledTaskSchema>;

function shouldRequireToolCallForTask(prompt: string): boolean {
    const normalized = prompt.toLowerCase();
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

// ============================================================================
// Helpers
// ============================================================================

function formatTaskForDisplay(task: typeof scheduledTasks.$inferSelect): string {
    const status = task.isEnabled ? "✅ Enabled" : "⏸️ Disabled";
    const nextRun = task.nextRunAt
        ? `Next: ${task.nextRunAt.toISOString()}`
        : "Not scheduled";
    const lastRun = task.lastRunAt
        ? `Last: ${task.lastRunAt.toISOString()}`
        : "Never run";
    const error = task.lastError ? `\n   ❌ Last error: ${task.lastError}` : "";

    return `• **${task.name}** (${task.id.slice(0, 8)}...)
   ${status} | Runs: ${task.runCount ?? 0}
   Schedule: \`${task.cron}\` (${task.timezone || "UTC"})
   ${nextRun} | ${lastRun}${error}`;
}

// ============================================================================
// Tool Implementation
// ============================================================================

async function executeScheduledTask(
    params: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    // Parse and validate params
    const parseResult = scheduledTaskSchema.safeParse(params);
    if (!parseResult.success) {
        return {
            success: false,
            error: `Invalid parameters: ${parseResult.error.message}`,
        };
    }

    const { action, taskId, name, prompt, schedule, timezone, channelType, modelId, executionMode, agentId, enabled } = parseResult.data;
    const userId = context?.userId;

    if (!userId) {
        return {
            success: false,
            error: "User context required for scheduled task management",
        };
    }

    ensureSchedulerStarted("scheduled_task_tool");

    try {
        switch (action) {
            // ==================================================================
            // LIST - Show all tasks
            // ==================================================================
            case "list": {
                const tasks = await db
                    .select()
                    .from(scheduledTasks)
                    .where(eq(scheduledTasks.userId, userId))
                    .orderBy(desc(scheduledTasks.createdAt));

                if (tasks.length === 0) {
                    return {
                        success: true,
                        data: {
                            message: "No scheduled tasks found. Create one with the 'create' action.",
                            tasks: [],
                        },
                    };
                }

                const formattedTasks = tasks.map(formatTaskForDisplay).join("\n\n");

                return {
                    success: true,
                    data: {
                        message: `Found ${tasks.length} scheduled task(s):\n\n${formattedTasks}`,
                        tasks: tasks.map(t => ({
                            id: t.id,
                            name: t.name,
                            cron: t.cron,
                            timezone: t.timezone,
                            isEnabled: t.isEnabled,
                            runCount: t.runCount,
                            nextRunAt: t.nextRunAt?.toISOString(),
                            lastRunAt: t.lastRunAt?.toISOString(),
                            lastError: t.lastError,
                        })),
                    },
                };
            }

            // ==================================================================
            // CREATE - Create a new task
            // ==================================================================
            case "create": {
                if (!name) {
                    return { success: false, error: "Task name is required for create action" };
                }
                if (!prompt) {
                    return { success: false, error: "Prompt is required for create action" };
                }
                if (!schedule) {
                    return { success: false, error: "Schedule (cron expression) is required for create action" };
                }

                const mode = executionMode ?? "model";
                if (mode === "agent" && !agentId) {
                    return { success: false, error: "agentId is required when executionMode is 'agent'" };
                }

                if (mode === "agent" && agentId) {
                    const [agent] = await db
                        .select()
                        .from(agents)
                        .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
                        .limit(1);
                    if (!agent) {
                        return { success: false, error: `Agent not found: ${agentId}` };
                    }
                }

                const resolvedTimezone = await resolveUserTimezone(userId, timezone || null);

                // Validate cron expression by trying to compute next run
                const nextRunAt = computeNextRunAt(schedule, resolvedTimezone);
                if (!nextRunAt) {
                    return {
                        success: false,
                        error: `Invalid cron expression: "${schedule}". Use standard cron format (minute hour day month weekday).`,
                    };
                }

                // Find channel account - auto-detect if not specified
                let channelAccountId: string | null = null;
                let deliveryChannel = channelType;

                if (channelType) {
                    // User specified a channel type
                    const [account] = await db
                        .select()
                        .from(channelAccounts)
                        .where(
                            and(
                                eq(channelAccounts.userId, userId),
                                eq(channelAccounts.channelType, channelType),
                                eq(channelAccounts.isActive, true)
                            )
                        )
                        .limit(1);

                    if (!account) {
                        return {
                            success: false,
                            error: `No active ${channelType} channel found. Please connect a ${channelType} channel first, or omit the channelType parameter.`,
                        };
                    }
                    channelAccountId = account.id;
                } else {
                    // Auto-detect: find the user's first active channel (prefer Telegram)
                    const activeChannels = await db
                        .select()
                        .from(channelAccounts)
                        .where(
                            and(
                                eq(channelAccounts.userId, userId),
                                eq(channelAccounts.isActive, true)
                            )
                        );

                    // Prefer Telegram, then Discord, then Slack, then any other
                    const preferredOrder = ["telegram", "discord", "slack"];
                    const sorted = activeChannels.sort((a, b) => {
                        const aIdx = preferredOrder.indexOf(a.channelType);
                        const bIdx = preferredOrder.indexOf(b.channelType);
                        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
                    });

                    if (sorted.length > 0) {
                        channelAccountId = sorted[0].id;
                        deliveryChannel = sorted[0].channelType;
                    }
                }

                const dedupeWindowMs = 2 * 60 * 1000;
                const dedupeCutoff = new Date(Date.now() - dedupeWindowMs);
                const dedupeFilters = [
                    eq(scheduledTasks.userId, userId),
                    eq(scheduledTasks.name, name),
                    eq(scheduledTasks.prompt, prompt),
                    eq(scheduledTasks.cron, schedule),
                    eq(scheduledTasks.timezone, resolvedTimezone),
                    gte(scheduledTasks.createdAt, dedupeCutoff),
                ];

                if (channelAccountId) {
                    dedupeFilters.push(eq(scheduledTasks.channelAccountId, channelAccountId));
                } else {
                    dedupeFilters.push(isNull(scheduledTasks.channelAccountId));
                }

                if (mode === "model" && modelId) {
                    dedupeFilters.push(eq(scheduledTasks.modelId, modelId));
                } else {
                    dedupeFilters.push(isNull(scheduledTasks.modelId));
                }

                const [recentMatch] = await db
                    .select()
                    .from(scheduledTasks)
                    .where(and(...dedupeFilters))
                    .limit(1);

                if (recentMatch) {
                    const recentExecution = resolveTaskExecution(recentMatch.payload, recentMatch.modelId ?? null);
                    const matchesExecution =
                        recentExecution.executionMode === mode &&
                        (mode === "model" || recentExecution.agentId === agentId);
                    if (!matchesExecution) {
                        // Same task signature but different execution target; continue creating.
                    } else {
                    return {
                        success: true,
                        data: {
                            message: `✅ Scheduled task "${recentMatch.name}" already exists (deduped)\n\nSchedule: \`${recentMatch.cron}\` (${recentMatch.timezone || "UTC"})\nNext run: ${recentMatch.nextRunAt?.toISOString() ?? "Unknown"}`,
                            task: {
                                id: recentMatch.id,
                                name: recentMatch.name,
                                cron: recentMatch.cron,
                                timezone: recentMatch.timezone,
                                channelType: deliveryChannel,
                                nextRunAt: recentMatch.nextRunAt?.toISOString(),
                            },
                        },
                    };
                    }
                }

                const [newTask] = await db
                    .insert(scheduledTasks)
                    .values({
                        userId,
                        name,
                        prompt,
                        cron: schedule,
                        timezone: resolvedTimezone,
                        channelAccountId,
                        modelId: mode === "model" ? modelId || null : null,
                        isEnabled: enabled !== false,
                        nextRunAt,
                        schedule: {
                            kind: "cron",
                            expr: schedule,
                            tz: resolvedTimezone,
                        },
                        payload: {
                            kind: "agentTurn",
                            message: prompt,
                            deliver: true,
                            executionMode: mode,
                            agentId: mode === "agent" ? agentId : null,
                        },
                    })
                    .returning();

                return {
                    success: true,
                    data: {
                        message: `✅ Created scheduled task "${name}"\n\nSchedule: \`${schedule}\` (${resolvedTimezone})\nNext run: ${nextRunAt.toISOString()}\nDelivery: ${deliveryChannel || "None (stored only)"}`,
                        task: {
                            id: newTask.id,
                            name: newTask.name,
                            cron: newTask.cron,
                            timezone: newTask.timezone,
                            channelType: deliveryChannel,
                            nextRunAt: newTask.nextRunAt?.toISOString(),
                        },
                    },
                };
            }

            // ==================================================================
            // UPDATE - Update an existing task
            // ==================================================================
            case "update": {
                if (!taskId) {
                    return { success: false, error: "Task ID is required for update action" };
                }

                // Verify task exists and belongs to user
                const [existingTask] = await db
                    .select()
                    .from(scheduledTasks)
                    .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.userId, userId)))
                    .limit(1);

                if (!existingTask) {
                    return { success: false, error: `Task not found: ${taskId}` };
                }

                // Build update object
                const updates: Partial<typeof scheduledTasks.$inferInsert> = {
                    updatedAt: new Date(),
                };

                if (name !== undefined) updates.name = name;
                if (prompt !== undefined) updates.prompt = prompt;
                const timezoneChanged = timezone !== undefined;
                if (timezoneChanged) updates.timezone = await resolveUserTimezone(userId, timezone || null);
                let nextExecutionMode: "model" | "agent" =
                    ((existingTask.payload as Record<string, unknown> | null)?.executionMode === "agent")
                        ? "agent"
                        : "model";
                let nextAgentId: string | undefined =
                    typeof (existingTask.payload as Record<string, unknown> | null)?.agentId === "string"
                        ? (existingTask.payload as Record<string, unknown>).agentId as string
                        : undefined;

                if (executionMode) {
                    nextExecutionMode = executionMode;
                }
                if (agentId !== undefined) {
                    nextAgentId = agentId;
                }

                if (nextExecutionMode === "agent") {
                    if (!nextAgentId) {
                        return { success: false, error: "agentId is required when executionMode is 'agent'" };
                    }
                    const [agent] = await db
                        .select()
                        .from(agents)
                        .where(and(eq(agents.id, nextAgentId), eq(agents.userId, userId)))
                        .limit(1);
                    if (!agent) {
                        return { success: false, error: `Agent not found: ${nextAgentId}` };
                    }
                    updates.modelId = null;
                } else if (modelId !== undefined) {
                    updates.modelId = modelId;
                }
                if (enabled !== undefined) updates.isEnabled = enabled;

                // Handle schedule change
                if (schedule !== undefined) {
                    const tz = await resolveUserTimezone(userId, timezone || existingTask.timezone || null);
                    const nextRunAt = computeNextRunAt(schedule, tz);
                    if (!nextRunAt) {
                        return {
                            success: false,
                            error: `Invalid cron expression: "${schedule}"`,
                        };
                    }
                    updates.cron = schedule;
                    updates.nextRunAt = nextRunAt;
                    updates.schedule = {
                        kind: "cron",
                        expr: schedule,
                        tz,
                    };
                }

                if (timezoneChanged && schedule === undefined) {
                    const tz = await resolveUserTimezone(userId, timezone || existingTask.timezone || null);
                    const nextRunAt = computeNextRunAt(existingTask.cron, tz);
                    if (nextRunAt) {
                        updates.nextRunAt = nextRunAt;
                        updates.schedule = {
                            kind: "cron",
                            expr: existingTask.cron,
                            tz,
                        };
                    }
                }

                if (prompt !== undefined) {
                    updates.payload = {
                        kind: "agentTurn",
                        message: prompt,
                        deliver: true,
                        executionMode: nextExecutionMode,
                        agentId: nextExecutionMode === "agent" ? nextAgentId ?? null : null,
                    };
                } else if (executionMode !== undefined || agentId !== undefined) {
                    const currentPayload = (existingTask.payload || {}) as Record<string, unknown>;
                    updates.payload = {
                        ...currentPayload,
                        kind: "agentTurn",
                        message: typeof currentPayload.message === "string" ? currentPayload.message : existingTask.prompt,
                        deliver: true,
                        executionMode: nextExecutionMode,
                        agentId: nextExecutionMode === "agent" ? nextAgentId ?? null : null,
                    };
                }

                if (enabled === true && (!existingTask.nextRunAt || existingTask.nextRunAt < new Date())) {
                    const tz = await resolveUserTimezone(userId, timezone || existingTask.timezone || null);
                    const cron = schedule || existingTask.cron;
                    const nextRunAt = computeNextRunAt(cron, tz);
                    if (nextRunAt) {
                        updates.nextRunAt = nextRunAt;
                        updates.schedule = {
                            kind: "cron",
                            expr: cron,
                            tz,
                        };
                    }
                }

                // Handle channel change
                if (channelType !== undefined) {
                    if (channelType === "") {
                        updates.channelAccountId = null;
                    } else {
                        const [account] = await db
                            .select()
                            .from(channelAccounts)
                            .where(
                                and(
                                    eq(channelAccounts.userId, userId),
                                    eq(channelAccounts.channelType, channelType),
                                    eq(channelAccounts.isActive, true)
                                )
                            )
                            .limit(1);

                        if (!account) {
                            return {
                                success: false,
                                error: `No active ${channelType} channel found.`,
                            };
                        }
                        updates.channelAccountId = account.id;
                    }
                }

                const [updatedTask] = await db
                    .update(scheduledTasks)
                    .set(updates)
                    .where(eq(scheduledTasks.id, taskId))
                    .returning();

                return {
                    success: true,
                    data: {
                        message: `✅ Updated task "${updatedTask.name}"`,
                        task: {
                            id: updatedTask.id,
                            name: updatedTask.name,
                            cron: updatedTask.cron,
                            timezone: updatedTask.timezone,
                            isEnabled: updatedTask.isEnabled,
                            nextRunAt: updatedTask.nextRunAt?.toISOString(),
                        },
                    },
                };
            }

            // ==================================================================
            // DELETE - Delete a task
            // ==================================================================
            case "delete": {
                if (!taskId) {
                    return { success: false, error: "Task ID is required for delete action" };
                }

                // Verify task exists and belongs to user
                const [existingTask] = await db
                    .select()
                    .from(scheduledTasks)
                    .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.userId, userId)))
                    .limit(1);

                if (!existingTask) {
                    return { success: false, error: `Task not found: ${taskId}` };
                }

                await db.delete(scheduledTasks).where(eq(scheduledTasks.id, taskId));

                return {
                    success: true,
                    data: {
                        message: `🗑️ Deleted task "${existingTask.name}"`,
                        deletedTaskId: taskId,
                    },
                };
            }

            // ==================================================================
            // TOGGLE - Enable/disable a task
            // ==================================================================
            case "toggle": {
                if (!taskId) {
                    return { success: false, error: "Task ID is required for toggle action" };
                }

                // Verify task exists and belongs to user
                const [existingTask] = await db
                    .select()
                    .from(scheduledTasks)
                    .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.userId, userId)))
                    .limit(1);

                if (!existingTask) {
                    return { success: false, error: `Task not found: ${taskId}` };
                }

                const newEnabled = enabled !== undefined ? enabled : !existingTask.isEnabled;

                // Recompute next run if enabling
                let nextRunAt = existingTask.nextRunAt;
                if (newEnabled && (!nextRunAt || nextRunAt < new Date())) {
                    const tz = await resolveUserTimezone(userId, existingTask.timezone || null);
                    nextRunAt = computeNextRunAt(existingTask.cron, tz);
                }

                const [updatedTask] = await db
                    .update(scheduledTasks)
                    .set({
                        isEnabled: newEnabled,
                        nextRunAt,
                        updatedAt: new Date(),
                    })
                    .where(eq(scheduledTasks.id, taskId))
                    .returning();

                const status = newEnabled ? "✅ Enabled" : "⏸️ Disabled";

                return {
                    success: true,
                    data: {
                        message: `${status} task "${updatedTask.name}"${newEnabled && nextRunAt ? `\nNext run: ${nextRunAt.toISOString()}` : ""}`,
                        task: {
                            id: updatedTask.id,
                            name: updatedTask.name,
                            isEnabled: updatedTask.isEnabled,
                            nextRunAt: updatedTask.nextRunAt?.toISOString(),
                        },
                    },
                };
            }

            // ==================================================================
            // RUN - Execute task immediately
            // ==================================================================
            case "run": {
                if (!taskId) {
                    return { success: false, error: "Task ID is required for run action" };
                }

                // Verify task exists and belongs to user
                const [task] = await db
                    .select()
                    .from(scheduledTasks)
                    .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.userId, userId)))
                    .limit(1);

                if (!task) {
                    return { success: false, error: `Task not found: ${taskId}` };
                }

                // Run the task using isolated agent
                const execution = resolveTaskExecution(task.payload, task.modelId ?? null);
                const result = await runIsolatedAgent({
                    userId: task.userId,
                    taskId: task.id,
                    taskName: task.name,
                    message: task.prompt,
                    channelAccountId: task.channelAccountId ?? undefined,
                    sessionTarget: "isolated",
                    includeRecentMessages: 0,
                    deliver: !!task.channelAccountId,
                    timeout: 180000, // 3 minutes - enough for web searches
                    modelId: execution.modelId,
                    agentId: execution.agentId,
                    requireToolCall: shouldRequireToolCallForTask(task.prompt),
                });

                // Update task run stats
                await db
                    .update(scheduledTasks)
                    .set({
                        lastRunAt: new Date(),
                        lastError: result.success ? null : result.error,
                        lastOutput: result.output?.substring(0, 4000) ?? null,
                        runCount: (task.runCount ?? 0) + 1,
                        updatedAt: new Date(),
                    })
                    .where(eq(scheduledTasks.id, taskId));

                if (!result.success) {
                    return {
                        success: false,
                        error: `Task execution failed: ${result.error}`,
                        data: {
                            taskId,
                            taskName: task.name,
                        },
                    };
                }

                return {
                    success: true,
                    data: {
                        message: `▶️ Executed task "${task.name}"\n\n${result.deliveredTo ? `Delivered to: ${result.deliveredTo}` : "Output stored (no delivery channel)"}`,
                        taskId,
                        taskName: task.name,
                        output: result.output?.substring(0, 500),
                        deliveredTo: result.deliveredTo,
                    },
                };
            }

            default:
                return { success: false, error: `Unknown action: ${action}` };
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            success: false,
            error: `Failed to ${action} scheduled task: ${errorMessage}`,
        };
    }
}

// ============================================================================
// Tool Definition
// ============================================================================

export const scheduledTaskTool: Tool = {
    id: "scheduled_task",
    name: "Manage Scheduled Tasks",
    description: `Create, update, delete, and manage scheduled tasks (cron jobs) that run automatically.

Use this tool when the user wants to:
- Create a recurring task (daily summary, weekly report, hourly check)
- Schedule a one-time task for the future
- List their existing scheduled tasks
- Update or delete a task
- Enable/disable a task
- Run a task immediately

Cron expression examples:
- "0 8 * * *" = Daily at 8:00 AM
- "0 9 * * 1-5" = Weekdays at 9:00 AM
- "*/30 * * * *" = Every 30 minutes
- "0 0 * * 0" = Every Sunday at midnight
- "0 12 1 * *" = First day of each month at noon

Actions:
- list: Show all scheduled tasks
- create: Create a new task (requires: name, prompt, schedule)
- update: Modify a task (requires: taskId)
- delete: Remove a task (requires: taskId)
- toggle: Enable/disable a task (requires: taskId)
- run: Execute a task immediately (requires: taskId)`,
    category: "utility",
    icon: "⏰",
    schema: scheduledTaskSchema,
    execute: executeScheduledTask,
    requiresLocalAccess: false,
};
