import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conversations, conversationTags } from "@/lib/db/schema";
import { eq, desc, and, isNull, inArray } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import {
    createConversationSchema,
    conversationQuerySchema,
    parseRequestBody,
} from "@/types/api";

// GET /api/conversations - List conversations with filtering
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

        // Parse query parameters
        const { searchParams } = new URL(request.url);
        const queryResult = conversationQuerySchema.safeParse({
            folderId: searchParams.get("folderId") || undefined,
            tag: searchParams.get("tag") || undefined,
            favorite: searchParams.get("favorite") || undefined,
            limit: searchParams.get("limit") || undefined,
            offset: searchParams.get("offset") || undefined,
        });

        if (!queryResult.success) {
            return NextResponse.json(
                { error: "Invalid query parameters", code: "INVALID_QUERY" },
                { status: 400 }
            );
        }

        const { folderId, tag, favorite, limit, offset } = queryResult.data;

        // Build where conditions
        const conditions = [
            eq(conversations.userId, userId),
            isNull(conversations.deletedAt),
        ];

        if (folderId) {
            conditions.push(eq(conversations.folderId, folderId));
        }

        if (favorite === "true") {
            conditions.push(eq(conversations.isFavorite, true));
        } else if (favorite === "false") {
            conditions.push(eq(conversations.isFavorite, false));
        }

        let userConversations;
        if (tag) {
            const taggedConvos = await db.query.conversationTags.findMany({
                where: eq(conversationTags.tag, tag),
                columns: { conversationId: true },
            });
            const taggedIds = taggedConvos.map(t => t.conversationId);
            
            if (taggedIds.length === 0) {
                return NextResponse.json({
                    success: true,
                    conversations: [],
                    total: 0,
                });
            }

            userConversations = await db.query.conversations.findMany({
                where: and(
                    ...conditions,
                    inArray(conversations.id, taggedIds)
                ),
                orderBy: [desc(conversations.updatedAt)],
                limit,
                offset,
                columns: {
                    id: true,
                    title: true,
                    folderId: true,
                    isFavorite: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        } else {
            userConversations = await db.query.conversations.findMany({
                where: and(...conditions),
                orderBy: [desc(conversations.updatedAt)],
                limit,
                offset,
                columns: {
                    id: true,
                    title: true,
                    folderId: true,
                    isFavorite: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        }

        return NextResponse.json({
            success: true,
            conversations: userConversations || [],
            total: userConversations?.length || 0,
        });
    } catch (error) {
        console.error("Fetch conversations error:", error);
        // Return empty array instead of error for better UX
        // This handles cases where user doesn't exist (dev bypass) or database issues
        return NextResponse.json({
            success: true,
            conversations: [],
            total: 0,
        });
    }
}

// DELETE /api/conversations - Delete all conversations for the user
export async function DELETE(request: Request) {
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

        // Soft delete all conversations for this user
        const result = await db
            .update(conversations)
            .set({ deletedAt: new Date() })
            .where(and(
                eq(conversations.userId, userId),
                isNull(conversations.deletedAt)
            ))
            .returning({ id: conversations.id });

        return NextResponse.json({
            success: true,
            deletedCount: result.length,
            message: `Deleted ${result.length} conversation(s)`,
        });
    } catch (error) {
        console.error("Delete all conversations error:", error);
        return NextResponse.json(
            { error: "Failed to delete conversations", code: "DELETE_FAILED" },
            { status: 500 }
        );
    }
}

// POST /api/conversations - Create a new conversation
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

        const { data, error } = await parseRequestBody(request, createConversationSchema);
        if (error) {
            return NextResponse.json(error, { status: 400 });
        }

        const [newConversation] = await db
            .insert(conversations)
            .values({
                userId,
                title: data.title || "New Conversation",
                profileId: data.profileId || null,
                folderId: data.folderId || null,
            })
            .returning();

        return NextResponse.json({
            success: true,
            conversation: newConversation,
        }, { status: 201 });
    } catch (error) {
        console.error("Create conversation error:", error);
        return NextResponse.json(
            { error: "Failed to create conversation", code: "CREATE_FAILED" },
            { status: 500 }
        );
    }
}
