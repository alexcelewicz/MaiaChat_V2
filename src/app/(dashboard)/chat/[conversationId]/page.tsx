export const dynamic = 'force-dynamic';

import { db } from "@/lib/db";
import { messages as messagesTable, conversations } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { redirect, notFound } from "next/navigation";
import { type UIMessage } from "@ai-sdk/react";
import { getCurrentUser } from "@/lib/auth/session";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
    try {
        // Get user from Better Auth session
        const user = await getCurrentUser();

        if (!user) {
            console.log("[ConversationPage] No user session, redirecting to login");
            redirect("/login");
        }

        const userId = user.id;

        const { conversationId } = await params;
        console.log("[ConversationPage] Loading conversation:", conversationId, "for user:", userId);

        // Fetch Conversation - verify it belongs to the current user
        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, conversationId),
                eq(conversations.userId, userId)
            )
        });

        if (!conversation) {
            console.log("[ConversationPage] Conversation not found:", conversationId);
            notFound();
        }

        // Fetch Messages
        const dbMessages = await db.query.messages.findMany({
            where: eq(messagesTable.conversationId, conversationId),
            orderBy: [asc(messagesTable.createdAt)],
        });

        console.log("[ConversationPage] Loaded", dbMessages.length, "messages");

        // Map to AI SDK UIMessage type
        // Note: We omit createdAt as Date objects aren't directly serializable
        // between server and client components. The ChatInterface doesn't require it.
        const initialMessages: UIMessage[] = dbMessages.map(msg => {
            const parts: UIMessage["parts"] = [];
            if (msg.content && msg.content !== "(image)") {
                parts.push({ type: "text" as const, text: msg.content });
            }
            // Restore image parts from stored S3 keys in metadata
            const metadata = msg.metadata as Record<string, unknown> | null;
            const imageKeys = metadata?.imageKeys as Array<{
                s3Key: string;
                mediaType: string;
                filename?: string;
            }> | undefined;
            if (imageKeys?.length) {
                for (const img of imageKeys) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    parts.push({
                        type: "file" as const,
                        mediaType: img.mediaType,
                        url: `/api/chat/images?key=${encodeURIComponent(img.s3Key)}`,
                        filename: img.filename,
                    } as any);
                }
            }
            if (parts.length === 0) {
                parts.push({ type: "text" as const, text: msg.content || "" });
            }
            return {
                id: msg.id,
                role: msg.role as "user" | "assistant",
                parts,
            };
        });

        // Key prop forces remount when navigating between conversations
        // This ensures useChat hook reinitializes with correct messages
        return <ChatInterface key={conversationId} id={conversationId} initialMessages={initialMessages} />;
    } catch (error) {
        console.error("[ConversationPage] Error:", error);
        throw error;
    }
}
