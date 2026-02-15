/**
 * Autonomous Task API
 *
 * POST - Start a new autonomous task with streaming progress
 * GET - List user's autonomous tasks or get task status
 * DELETE - Abort a running task
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { autonomousTasks } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { runAutonomousLoop, abortTask, isTaskRunning } from "@/lib/autonomous/loop";
import type { AutonomousStreamEvent } from "@/lib/autonomous/types";

// Request validation schema
const startTaskSchema = z.object({
    prompt: z.string().min(1).max(50000),
    modelId: z.string().min(1),
    conversationId: z.string().uuid().optional(),
    maxSteps: z.number().min(1).max(200).default(50),
    timeoutMs: z.number().min(10000).max(600000).default(300000), // 10s to 10min
    config: z.object({
        toolsEnabled: z.boolean().optional(),
        enabledTools: z.array(z.string()).optional(),
        ragEnabled: z.boolean().optional(),
        memoryEnabled: z.boolean().optional(),
        agentId: z.string().uuid().optional(),
        agentSystemPrompt: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
    }).optional(),
});

/**
 * POST /api/task/autonomous
 * Start a new autonomous task with NDJSON streaming progress
 */
export async function POST(request: Request) {
    try {
        // Authentication
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        // Rate limiting
        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "chat", RATE_LIMITS.chat);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.chat);
        }

        // Parse and validate request
        const body = await request.json();
        const parseResult = startTaskSchema.safeParse(body);

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

        const { prompt, modelId, conversationId, maxSteps, timeoutMs, config = {} } = parseResult.data;

        // Get user API keys
        const apiKeys = await getUserApiKeys(userId);

        // Check if required API key is available
        // (The loop will handle specific provider checks)
        const hasAnyKey = Object.values(apiKeys).some((key) => !!key);
        if (!hasAnyKey) {
            return NextResponse.json(
                { error: "No API keys configured. Please add your API keys in Settings.", code: "API_KEY_MISSING" },
                { status: 400 }
            );
        }

        // Create streaming response
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const onEvent = (event: AutonomousStreamEvent) => {
                    try {
                        const line = JSON.stringify(event) + "\n";
                        controller.enqueue(encoder.encode(line));
                    } catch {
                        // Stream may have been closed
                    }
                };

                try {
                    await runAutonomousLoop({
                        userId,
                        conversationId,
                        prompt,
                        modelId,
                        maxSteps,
                        timeoutMs,
                        config,
                        apiKeys,
                        onEvent,
                    });
                } catch (error) {
                    // Emit error event
                    const errorEvent: AutonomousStreamEvent = {
                        type: "error",
                        taskKey: "unknown",
                        timestamp: new Date().toISOString(),
                        data: {
                            error: error instanceof Error ? error.message : "Unknown error",
                        },
                    };
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify(errorEvent) + "\n"));
                    } catch {
                        // Stream may have been closed
                    }
                } finally {
                    try {
                        controller.close();
                    } catch {
                        // Stream may already be closed
                    }
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Transfer-Encoding": "chunked",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    } catch (error) {
        console.error("Autonomous task error:", error);
        return NextResponse.json(
            { error: "Failed to start autonomous task", code: "START_FAILED" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/task/autonomous
 * List user's autonomous tasks or get specific task status
 *
 * Query params:
 * - taskKey: Get specific task status
 * - limit: Number of tasks to return (default 20)
 * - status: Filter by status
 */
export async function GET(request: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", RATE_LIMITS.api);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.api);
        }

        const { searchParams } = new URL(request.url);
        const taskKey = searchParams.get("taskKey");
        const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
        const statusFilter = searchParams.get("status");

        if (taskKey) {
            // Get specific task
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

            return NextResponse.json({
                success: true,
                task: {
                    ...task,
                    isRunning: isTaskRunning(taskKey),
                },
            });
        }

        // List tasks
        const whereConditions = [eq(autonomousTasks.userId, userId)];
        if (statusFilter && ['pending', 'running', 'paused', 'completed', 'failed', 'aborted'].includes(statusFilter)) {
            whereConditions.push(eq(autonomousTasks.status, statusFilter as 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted'));
        }

        const tasks = await db.query.autonomousTasks.findMany({
            where: and(...whereConditions),
            orderBy: [desc(autonomousTasks.createdAt)],
            limit,
        });

        return NextResponse.json({
            success: true,
            tasks: tasks.map((task) => ({
                ...task,
                isRunning: isTaskRunning(task.taskKey),
            })),
        });
    } catch (error) {
        console.error("Get autonomous tasks error:", error);
        return NextResponse.json(
            { error: "Failed to get tasks", code: "GET_FAILED" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/task/autonomous
 * Abort a running task
 *
 * Query params:
 * - taskKey: Task key to abort (required)
 */
export async function DELETE(request: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const taskKey = searchParams.get("taskKey");

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

        // Attempt to abort
        const aborted = abortTask(taskKey);

        if (aborted) {
            return NextResponse.json({
                success: true,
                message: "Task aborted",
            });
        }

        // Task not running, but update status if it's still pending/running in DB
        if (task.status === "pending" || task.status === "running") {
            await db
                .update(autonomousTasks)
                .set({
                    status: "aborted",
                    completedAt: new Date(),
                })
                .where(eq(autonomousTasks.id, task.id));

            return NextResponse.json({
                success: true,
                message: "Task marked as aborted",
            });
        }

        return NextResponse.json({
            success: false,
            message: "Task is not running",
            status: task.status,
        });
    } catch (error) {
        console.error("Abort autonomous task error:", error);
        return NextResponse.json(
            { error: "Failed to abort task", code: "ABORT_FAILED" },
            { status: 500 }
        );
    }
}
