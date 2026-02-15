import { db } from "@/lib/db";
import { messages, conversations } from "@/lib/db/schema";
import { getSessionUserId } from "@/lib/auth/session";
import { eq, and, desc, asc } from "drizzle-orm";
import { z } from "zod";
import { NextRequest } from "next/server";

// Validation schemas
const getMessagesSchema = z.object({
    conversationId: z.string().uuid(),
    limit: z.coerce.number().int().positive().max(100).optional().default(50),
    order: z.enum(["asc", "desc"]).optional().default("asc"),
});

const createMessageSchema = z.object({
    conversationId: z.string().uuid(),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string().min(1),
    metadata: z.record(z.string(), z.any()).optional(),
    tokenCount: z.number().int().positive().optional(),
});

// GET /api/messages?conversationId=xxx - Load messages for a conversation
export async function GET(req: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const params = {
            conversationId: searchParams.get("conversationId"),
            limit: searchParams.get("limit"),
            order: searchParams.get("order"),
        };

        const parseResult = getMessagesSchema.safeParse(params);
        if (!parseResult.success) {
            return Response.json(
                { error: "Validation failed", details: parseResult.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { conversationId, limit, order } = parseResult.data;

        // Verify conversation ownership
        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, conversationId),
                eq(conversations.userId, userId)
            ),
        });

        if (!conversation) {
            return Response.json({ error: "Conversation not found" }, { status: 404 });
        }

        // Fetch messages
        const messageList = await db
            .select({
                id: messages.id,
                role: messages.role,
                content: messages.content,
                metadata: messages.metadata,
                tokenCount: messages.tokenCount,
                createdAt: messages.createdAt,
            })
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .orderBy(order === "desc" ? desc(messages.createdAt) : asc(messages.createdAt))
            .limit(limit);

        return Response.json({ messages: messageList });
    } catch (error) {
        console.error("Get messages error:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST /api/messages - Create a new message
export async function POST(req: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const parseResult = createMessageSchema.safeParse(body);

        if (!parseResult.success) {
            return Response.json(
                { error: "Validation failed", details: parseResult.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { conversationId, role, content, metadata, tokenCount } = parseResult.data;

        // Verify conversation ownership
        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, conversationId),
                eq(conversations.userId, userId)
            ),
        });

        if (!conversation) {
            return Response.json({ error: "Conversation not found" }, { status: 404 });
        }

        // Create the message
        const [newMessage] = await db
            .insert(messages)
            .values({
                conversationId,
                role,
                content,
                metadata: metadata || {},
                tokenCount,
            })
            .returning();

        return Response.json({ message: newMessage }, { status: 201 });
    } catch (error) {
        console.error("Create message error:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
