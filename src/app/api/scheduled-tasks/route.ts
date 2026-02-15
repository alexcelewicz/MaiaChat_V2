/**
 * Scheduled Tasks API
 *
 * GET /api/scheduled-tasks - List scheduled tasks
 * POST /api/scheduled-tasks - Create a scheduled task
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { agents, channelAccounts, scheduledTasks } from "@/lib/db/schema";
import { and, desc, eq, isNull, gte } from "drizzle-orm";
import { computeNextRunAt } from "@/lib/scheduler/schedule";
import { resolveUserTimezone } from "@/lib/scheduler/timezone";
import { ensureSchedulerStarted } from "@/lib/scheduler/boot";
import "@/lib/channels";

function resolveExecutionMode(
    payload: unknown,
    fallbackModelId: string | null
): { executionMode: "model" | "agent"; agentId: string | null; modelId: string | null } {
    const data = (payload || {}) as Record<string, unknown>;
    const mode = data.executionMode === "agent" ? "agent" : "model";
    const agentId = mode === "agent" && typeof data.agentId === "string" ? data.agentId : null;
    return {
        executionMode: mode,
        agentId,
        modelId: mode === "agent" ? null : fallbackModelId,
    };
}

export async function GET() {
    try {
        ensureSchedulerStarted("scheduled_tasks_api_get");
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const tasks = await db.select()
            .from(scheduledTasks)
            .where(eq(scheduledTasks.userId, userId))
            .orderBy(desc(scheduledTasks.createdAt));

        const enrichedTasks = tasks.map((task) => {
            const execution = resolveExecutionMode(task.payload, task.modelId ?? null);
            return {
                ...task,
                executionMode: execution.executionMode,
                agentId: execution.agentId,
                modelId: execution.modelId,
            };
        });

        return NextResponse.json({ tasks: enrichedTasks });
    } catch (error) {
        console.error("[API] List scheduled tasks error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        ensureSchedulerStarted("scheduled_tasks_api_post");
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const payload = await request.json();

        const name = typeof payload.name === "string" ? payload.name.trim() : "";
        const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
        const cron = typeof payload.cron === "string" ? payload.cron.trim() : "";
        const timezone = typeof payload.timezone === "string" ? payload.timezone.trim() : undefined;
        const channelAccountId = typeof payload.channelAccountId === "string" ? payload.channelAccountId : null;
        const modelId = typeof payload.modelId === "string" && payload.modelId.trim() ? payload.modelId.trim() : null;
        const executionMode = payload.executionMode === "agent" ? "agent" : "model";
        const agentId = typeof payload.agentId === "string" && payload.agentId.trim()
            ? payload.agentId.trim()
            : null;
        const isEnabled = payload.isEnabled !== false;

        if (!name || !prompt || !cron) {
            return NextResponse.json(
                { error: "Missing required fields: name, prompt, cron" },
                { status: 400 }
            );
        }

        if (executionMode === "agent" && !agentId) {
            return NextResponse.json(
                { error: "agentId is required when executionMode is 'agent'" },
                { status: 400 }
            );
        }

        // Validate channel account if provided
        if (channelAccountId) {
            const [account] = await db.select()
                .from(channelAccounts)
                .where(and(
                    eq(channelAccounts.id, channelAccountId),
                    eq(channelAccounts.userId, userId)
                ));

            if (!account) {
                return NextResponse.json({ error: "Channel account not found" }, { status: 404 });
            }
        }

        if (executionMode === "agent" && agentId) {
            const [agent] = await db.select()
                .from(agents)
                .where(and(
                    eq(agents.id, agentId),
                    eq(agents.userId, userId)
                ))
                .limit(1);
            if (!agent) {
                return NextResponse.json({ error: "Agent not found" }, { status: 404 });
            }
        }

        const resolvedTimezone = await resolveUserTimezone(userId, timezone || null);
        const nextRunAt = computeNextRunAt(cron, resolvedTimezone);
        if (!nextRunAt) {
            return NextResponse.json(
                { error: "Invalid cron expression" },
                { status: 400 }
            );
        }

        const dedupeWindowMs = 2 * 60 * 1000;
        const dedupeCutoff = new Date(Date.now() - dedupeWindowMs);
        const dedupeFilters = [
            eq(scheduledTasks.userId, userId),
            eq(scheduledTasks.name, name),
            eq(scheduledTasks.prompt, prompt),
            eq(scheduledTasks.cron, cron),
            eq(scheduledTasks.timezone, resolvedTimezone),
            gte(scheduledTasks.createdAt, dedupeCutoff),
        ];

        if (channelAccountId) {
            dedupeFilters.push(eq(scheduledTasks.channelAccountId, channelAccountId));
        } else {
            dedupeFilters.push(isNull(scheduledTasks.channelAccountId));
        }

        if (executionMode === "model" && modelId) {
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
            const recentExecution = resolveExecutionMode(recentMatch.payload, recentMatch.modelId ?? null);
            const matchesExecution =
                recentExecution.executionMode === executionMode &&
                (executionMode === "model" || recentExecution.agentId === agentId);
            if (!matchesExecution) {
                // Same task signature but different execution target; allow creating a distinct task.
            } else {
                return NextResponse.json({ task: recentMatch, deduped: true }, { status: 200 });
            }
        }

        const [task] = await db.insert(scheduledTasks)
            .values({
                userId,
                channelAccountId,
                name,
                prompt,
                cron,
                timezone: resolvedTimezone,
                modelId: executionMode === "model" ? modelId : null,
                isEnabled,
                nextRunAt,
                schedule: {
                    kind: "cron",
                    expr: cron,
                    tz: resolvedTimezone,
                },
                payload: {
                    kind: "agentTurn",
                    message: prompt,
                    deliver: true,
                    executionMode,
                    agentId,
                },
            })
            .returning();

        return NextResponse.json({ task }, { status: 201 });
    } catch (error) {
        console.error("[API] Create scheduled task error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
