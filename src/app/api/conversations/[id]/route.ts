import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conversations, messages, scheduledTasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { updateConversationSchema, parseRequestBody } from "@/types/api";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import { summarizeConversation } from "@/lib/memory/summarizer";
import { appendToWorkingMemory, type MemoryEntry } from "@/lib/memory/local-memory";
import { saveConversationMemory } from "@/lib/memory/memory-store";

interface RouteContext {
    params: Promise<{ id: string }>;
}

// GET /api/conversations/[id] - Get single conversation with messages
export async function GET(request: Request, context: RouteContext) {
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

        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, id),
                eq(conversations.userId, userId)
            ),
            with: {
                messages: {
                    orderBy: (messages, { asc }) => [asc(messages.createdAt)],
                },
            },
        });

        if (!conversation) {
            return NextResponse.json(
                { error: "Conversation not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            conversation,
        });
    } catch (error) {
        console.error("Get conversation error:", error);
        return NextResponse.json(
            { error: "Failed to get conversation", code: "FETCH_FAILED" },
            { status: 500 }
        );
    }
}

// PATCH /api/conversations/[id] - Update conversation
export async function PATCH(request: Request, context: RouteContext) {
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

        const { data, error } = await parseRequestBody(request, updateConversationSchema);
        if (error) {
            return NextResponse.json(error, { status: 400 });
        }

        const updateData: Record<string, unknown> = {
            updatedAt: new Date(),
        };

        if (data.title !== undefined) updateData.title = data.title;
        if (data.isFavorite !== undefined) updateData.isFavorite = data.isFavorite;
        if (data.folderId !== undefined) updateData.folderId = data.folderId;

        const [updated] = await db
            .update(conversations)
            .set(updateData)
            .where(eq(conversations.id, id))
            .returning();

        return NextResponse.json({
            success: true,
            conversation: updated,
        });
    } catch (error) {
        console.error("Update conversation error:", error);
        return NextResponse.json(
            { error: "Failed to update conversation", code: "UPDATE_FAILED" },
            { status: 500 }
        );
    }
}

// DELETE /api/conversations/[id] - Soft delete conversation
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

        // Verify ownership and get conversation details
        const existing = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, id),
                eq(conversations.userId, userId)
            ),
        });

        if (!existing) {
            return NextResponse.json(
                { error: "Conversation not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        // PRESERVE KNOWLEDGE: Save to memory before deletion
        // This ensures conversation knowledge is not lost when user deletes chat
        try {
            const msgs = await db.query.messages.findMany({
                where: eq(messages.conversationId, id),
                orderBy: (m, { asc }) => [asc(m.createdAt)],
            });

            // Only save if there are enough messages to be meaningful
            if (msgs.length >= 2) {
                const apiKeys = await getUserApiKeys(userId);
                const formattedMessages = msgs.map((m) => ({
                    role: m.role as "user" | "assistant" | "system",
                    content: m.content || "",
                }));

                const result = await summarizeConversation(formattedMessages, apiKeys as Record<string, string>, {
                    conversationId: id,
                    title: existing.title || undefined,
                });

                // Save to local memory
                const localEntry: MemoryEntry = {
                    conversationId: id,
                    title: existing.title || `Conversation ${id.slice(0, 8)}`,
                    timestamp: new Date().toISOString(),
                    summary: result.summary,
                    topics: result.topics,
                    keyFacts: result.keyFacts,
                };
                await appendToWorkingMemory(userId, localEntry);
                console.log(`[Conversations] Preserved memory before deletion: ${id.slice(0, 8)} (${msgs.length} messages)`);

                // Also save to Gemini if available
                const googleKey = (apiKeys as Record<string, string>).google;
                if (googleKey) {
                    await saveConversationMemory(
                        userId,
                        googleKey,
                        id,
                        result.markdown,
                        existing.title || `Conversation ${id.slice(0, 8)}`
                    );
                }
            }
        } catch (memErr) {
            // Don't block deletion if memory save fails
            console.error("[Conversations] Memory preservation failed:", memErr);
        }

        // Check for hard delete query param
        const { searchParams } = new URL(request.url);
        const hardDelete = searchParams.get("hard") === "true";

        if (hardDelete) {
            // Hard delete - cascade will handle messages
            await db.delete(conversations).where(eq(conversations.id, id));
        } else {
            // Soft delete
            await db
                .update(conversations)
                .set({ deletedAt: new Date() })
                .where(eq(conversations.id, id));
        }

        // Disable linked scheduled task to prevent zombie conversation recreation
        const metadata = existing.metadata as { scheduledTaskId?: string } | null;
        if (metadata?.scheduledTaskId) {
            try {
                await db.update(scheduledTasks)
                    .set({ isEnabled: false, updatedAt: new Date() })
                    .where(and(
                        eq(scheduledTasks.id, metadata.scheduledTaskId),
                        eq(scheduledTasks.userId, userId)
                    ));
                console.log(`[Conversations] Disabled linked scheduled task: ${metadata.scheduledTaskId}`);
            } catch (schedErr) {
                // Don't block deletion if scheduled task disable fails
                console.error("[Conversations] Failed to disable linked scheduled task:", schedErr);
            }
        }

        return NextResponse.json({
            success: true,
            deleted: id,
        });
    } catch (error) {
        console.error("Delete conversation error:", error);
        return NextResponse.json(
            { error: "Failed to delete conversation", code: "DELETE_FAILED" },
            { status: 500 }
        );
    }
}
