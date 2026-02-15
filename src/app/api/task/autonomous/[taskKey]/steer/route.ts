/**
 * Autonomous Task Steer API
 *
 * POST - Queue a steering message into an active autonomous task
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { autonomousTasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import { steerTask, isTaskRunning } from "@/lib/autonomous/loop";

// Request validation schema
const steerSchema = z.object({
    message: z.string().min(1).max(10000),
});

interface RouteParams {
    params: Promise<{ taskKey: string }>;
}

/**
 * POST /api/task/autonomous/[taskKey]/steer
 * Queue a steering message into an active autonomous task
 */
export async function POST(request: Request, context: RouteParams) {
    try {
        // Authentication
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const { taskKey } = await context.params;

        if (!taskKey) {
            return NextResponse.json(
                { error: "taskKey is required", code: "MISSING_PARAM" },
                { status: 400 }
            );
        }

        // Verify task ownership
        const task = await db.query.autonomousTasks.findFirst({
            where: and(
                eq(autonomousTasks.taskKey, taskKey),
                eq(autonomousTasks.userId, userId)
            ),
        });

        if (!task) {
            return NextResponse.json(
                { error: "Task not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        // Parse request body
        const body = await request.json();
        const parseResult = steerSchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json(
                {
                    error: "Validation failed",
                    code: "VALIDATION_ERROR",
                    details: parseResult.error.flatten().fieldErrors,
                },
                { status: 400 }
            );
        }

        const { message } = parseResult.data;

        // Check if task is running
        if (!isTaskRunning(taskKey)) {
            return NextResponse.json(
                {
                    error: "Task is not running",
                    code: "TASK_NOT_RUNNING",
                    status: task.status,
                },
                { status: 400 }
            );
        }

        // Queue the steering message
        const success = steerTask(taskKey, message);

        if (!success) {
            return NextResponse.json(
                { error: "Failed to queue steering message", code: "STEER_FAILED" },
                { status: 500 }
            );
        }

        // Update queued messages in database for persistence
        const currentQueued = (task.queuedMessages as string[]) || [];
        await db
            .update(autonomousTasks)
            .set({
                queuedMessages: [...currentQueued, message],
                lastActivityAt: new Date(),
            })
            .where(eq(autonomousTasks.id, task.id));

        return NextResponse.json({
            success: true,
            message: "Steering message queued",
        });
    } catch (error) {
        console.error("Steer autonomous task error:", error);
        return NextResponse.json(
            { error: "Failed to steer task", code: "STEER_FAILED" },
            { status: 500 }
        );
    }
}
