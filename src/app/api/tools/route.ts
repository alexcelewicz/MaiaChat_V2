import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { getAllTools, getTool, executeTool, type ToolId, type ToolCall } from "@/lib/tools";
import { z } from "zod";

// GET /api/tools - List all available tools
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

        const tools = getAllTools().map(tool => ({
            id: tool.id,
            name: tool.name,
            description: tool.description,
            category: tool.category,
            icon: tool.icon,
        }));

        return NextResponse.json({
            success: true,
            tools,
        });
    } catch (error) {
        console.error("List tools error:", error);
        return NextResponse.json(
            { error: "Failed to list tools", code: "LIST_FAILED" },
            { status: 500 }
        );
    }
}

const executeSchema = z.object({
    toolId: z.string(),
    params: z.record(z.string(), z.unknown()),
});

// POST /api/tools - Execute a tool
export async function POST(request: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", {
            windowSeconds: 60,
            limit: 30, // 30 tool executions per minute
        });

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, { windowSeconds: 60, limit: 30 });
        }

        const body = await request.json();
        const validation = executeSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: "Invalid request", details: validation.error.issues },
                { status: 400 }
            );
        }

        const { toolId, params } = validation.data;

        // Verify tool exists
        const tool = getTool(toolId as ToolId);
        if (!tool) {
            return NextResponse.json(
                { error: "Tool not found", code: "TOOL_NOT_FOUND" },
                { status: 404 }
            );
        }

        // Execute the tool
        const result = await executeTool(
            { toolId: toolId as ToolId, params },
            { userId }
        );

        return NextResponse.json({
            success: true,
            result,
        });
    } catch (error) {
        console.error("Tool execution error:", error);
        return NextResponse.json(
            { error: "Tool execution failed", code: "EXECUTION_FAILED" },
            { status: 500 }
        );
    }
}
