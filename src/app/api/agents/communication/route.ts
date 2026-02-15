import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { z } from "zod";
import {
    listAgentSessions,
    sendAgentMessage,
} from "@/lib/agents/agent-communication";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const sendMessageSchema = z.object({
    fromAgentId: z.string().min(1),
    toConversationId: z.string().uuid(),
    content: z.string().min(1).max(10000),
});

// GET /api/agents/communication - List all active agent sessions
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

        const sessions = await listAgentSessions(userId);

        return NextResponse.json({ sessions });
    } catch (error) {
        console.error("List agent sessions error:", error);
        return NextResponse.json(
            { error: "Failed to list agent sessions", code: "LIST_FAILED" },
            { status: 500 }
        );
    }
}

// POST /api/agents/communication - Send a message from one agent to another's conversation
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
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", RATE_LIMITS.api);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.api);
        }

        const body = await request.json();
        const parseResult = sendMessageSchema.safeParse(body);

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

        const { fromAgentId, toConversationId, content } = parseResult.data;

        // Look up the agent to get its name and verify ownership
        const agent = await db.query.agents.findFirst({
            where: and(
                eq(agents.id, fromAgentId),
                eq(agents.userId, userId)
            ),
        });

        if (!agent) {
            return NextResponse.json(
                { error: "Agent not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        const result = await sendAgentMessage(
            userId,
            toConversationId,
            content,
            agent.name
        );

        return NextResponse.json({
            success: true,
            messageId: result.messageId,
        });
    } catch (error) {
        console.error("Send agent message error:", error);
        const message =
            error instanceof Error ? error.message : "Failed to send agent message";
        return NextResponse.json(
            { error: message, code: "SEND_FAILED" },
            { status: 500 }
        );
    }
}
