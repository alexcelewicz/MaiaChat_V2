import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { randomBytes } from "crypto";

interface RouteContext {
    params: Promise<{ id: string }>;
}

// Generate a secure random token
function generateShareToken(): string {
    return randomBytes(16).toString("hex");
}

// POST /api/conversations/[id]/share - Generate a share link
export async function POST(request: Request, context: RouteContext) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const { id } = await context.params;

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", RATE_LIMITS.api);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.api);
        }

        // Verify ownership
        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, id),
                eq(conversations.userId, userId),
                isNull(conversations.deletedAt)
            ),
        });

        if (!conversation) {
            return NextResponse.json(
                { error: "Conversation not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        // Generate new share token if doesn't exist
        let shareToken = conversation.shareToken;
        if (!shareToken) {
            shareToken = generateShareToken();
            await db
                .update(conversations)
                .set({ shareToken, updatedAt: new Date() })
                .where(eq(conversations.id, id));
        }

        return NextResponse.json({
            success: true,
            shareToken,
            shareUrl: `/shared/${shareToken}`,
        });
    } catch (error) {
        console.error("Share conversation error:", error);
        return NextResponse.json(
            { error: "Failed to share conversation", code: "SHARE_FAILED" },
            { status: 500 }
        );
    }
}

// DELETE /api/conversations/[id]/share - Revoke share link
export async function DELETE(request: Request, context: RouteContext) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const { id } = await context.params;

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", RATE_LIMITS.api);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.api);
        }

        // Verify ownership
        const existing = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, id),
                eq(conversations.userId, userId)
            ),
            columns: { id: true },
        });

        if (!existing) {
            return NextResponse.json(
                { error: "Conversation not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        // Revoke share token
        await db
            .update(conversations)
            .set({ shareToken: null, updatedAt: new Date() })
            .where(eq(conversations.id, id));

        return NextResponse.json({
            success: true,
            message: "Share link revoked",
        });
    } catch (error) {
        console.error("Revoke share error:", error);
        return NextResponse.json(
            { error: "Failed to revoke share link", code: "REVOKE_FAILED" },
            { status: 500 }
        );
    }
}
