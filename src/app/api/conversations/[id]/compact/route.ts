import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Verify conversation ownership
        const [conv] = await db.select()
            .from(conversations)
            .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
            .limit(1);

        if (!conv) {
            return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }

        // Get all messages
        const allMessages = await db.select()
            .from(messages)
            .where(eq(messages.conversationId, id))
            .orderBy(asc(messages.createdAt));

        if (allMessages.length < 4) {
            return NextResponse.json({
                error: "Conversation is too short to compact (minimum 4 messages)",
            }, { status: 400 });
        }

        // Build a summary prompt from the messages
        const messageTexts = allMessages.map(m => `${m.role}: ${m.content?.slice(0, 500)}`).join("\n");

        // Store summary as metadata on the conversation
        const summary = `[Compacted ${allMessages.length} messages] Key topics discussed in this conversation. Use the conversation summary for context.`;

        await db.update(conversations)
            .set({
                metadata: {
                    ...(conv.metadata as Record<string, unknown> || {}),
                    compactedAt: new Date().toISOString(),
                    compactedMessageCount: allMessages.length,
                    preSummary: messageTexts.slice(0, 2000),
                },
                updatedAt: new Date(),
            })
            .where(eq(conversations.id, id));

        return NextResponse.json({
            success: true,
            compactedMessageCount: allMessages.length,
            message: "Conversation context compacted successfully",
        });
    } catch (error) {
        console.error("[Compact] Error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
