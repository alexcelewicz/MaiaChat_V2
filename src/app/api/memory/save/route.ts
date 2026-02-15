/**
 * Memory Save Endpoint
 *
 * POST /api/memory/save
 * Manually save a conversation as a memory.
 */

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import { summarizeConversation } from "@/lib/memory/summarizer";
import { saveConversationMemory } from "@/lib/memory/memory-store";
import { appendToWorkingMemory, type MemoryEntry } from "@/lib/memory/local-memory";
import { db } from "@/lib/db";
import { messages as messagesTable, conversations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const saveMemorySchema = z.object({
    conversationId: z.string().uuid(),
});

export async function POST(req: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { conversationId } = saveMemorySchema.parse(body);

        // Verify ownership
        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, conversationId),
                eq(conversations.userId, userId)
            ),
        });

        if (!conversation) {
            return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }

        // Get user API keys
        const apiKeys = await getUserApiKeys(userId);
        const googleKey = (apiKeys as Record<string, string>).google;

        // Fetch conversation messages
        const msgs = await db.query.messages.findMany({
            where: eq(messagesTable.conversationId, conversationId),
            orderBy: (m, { asc }) => [asc(m.createdAt)],
        });

        if (msgs.length < 2) {
            return NextResponse.json(
                { error: "Conversation too short to save as memory" },
                { status: 400 }
            );
        }

        const formattedMessages = msgs.map((m) => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content || "",
        }));

        // Summarize conversation
        const result = await summarizeConversation(formattedMessages, apiKeys, {
            conversationId,
            title: conversation.title || undefined,
            createdAt: conversation.createdAt?.toISOString(),
        });

        // Always save to local memory (works without Google API key)
        const localEntry: MemoryEntry = {
            conversationId,
            title: conversation.title || `Conversation ${conversationId.slice(0, 8)}`,
            timestamp: new Date().toISOString(),
            summary: result.summary,
            topics: result.topics,
            keyFacts: result.keyFacts,
        };
        await appendToWorkingMemory(userId, localEntry);

        // Also save to Gemini store if Google API key available
        let doc = null;
        if (googleKey) {
            doc = await saveConversationMemory(
                userId,
                googleKey,
                conversationId,
                result.markdown,
                conversation.title || `Conversation ${conversationId.slice(0, 8)}`
            );
        }

        return NextResponse.json({
            success: true,
            summary: result.summary,
            topics: result.topics,
            documentName: doc?.name,
            savedLocally: true,
            savedToGemini: !!googleKey,
        });
    } catch (error) {
        console.error("[Memory Save] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to save memory" },
            { status: 500 }
        );
    }
}
