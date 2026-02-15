import { db } from "@/lib/db";
import { messages, conversations } from "@/lib/db/schema";
import { getSessionUserId } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

interface RouteParams {
    params: Promise<{ id: string }>;
}

const updateMessageSchema = z.object({
    content: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

// GET /api/messages/[id] - Get a specific message
export async function GET(req: Request, { params }: RouteParams) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Get the message with conversation ownership check
        const message = await db.query.messages.findFirst({
            where: eq(messages.id, id),
            with: {
                // This requires relations to be defined in schema
            },
        });

        if (!message) {
            return Response.json({ error: "Message not found" }, { status: 404 });
        }

        // Verify conversation ownership
        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, message.conversationId),
                eq(conversations.userId, userId)
            ),
        });

        if (!conversation) {
            return Response.json({ error: "Message not found" }, { status: 404 });
        }

        return Response.json({ message });
    } catch (error) {
        console.error("Get message error:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

// PATCH /api/messages/[id] - Update a message
export async function PATCH(req: Request, { params }: RouteParams) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();

        const parseResult = updateMessageSchema.safeParse(body);
        if (!parseResult.success) {
            return Response.json(
                { error: "Validation failed", details: parseResult.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        // Get the message first
        const existingMessage = await db.query.messages.findFirst({
            where: eq(messages.id, id),
        });

        if (!existingMessage) {
            return Response.json({ error: "Message not found" }, { status: 404 });
        }

        // Verify conversation ownership
        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, existingMessage.conversationId),
                eq(conversations.userId, userId)
            ),
        });

        if (!conversation) {
            return Response.json({ error: "Message not found" }, { status: 404 });
        }

        // Only allow editing user messages
        if (existingMessage.role !== "user") {
            return Response.json(
                { error: "Only user messages can be edited" },
                { status: 403 }
            );
        }

        const { content, metadata } = parseResult.data;

        // Build update object
        const updateData: Record<string, unknown> = {};
        if (content !== undefined) updateData.content = content;
        if (metadata !== undefined) {
            // Merge with existing metadata, adding edit history
            const existingMetadata = (existingMessage.metadata as Record<string, unknown>) || {};
            const editHistory = (existingMetadata.editHistory as unknown[]) || [];
            editHistory.push({
                content: existingMessage.content,
                editedAt: new Date().toISOString(),
            });
            updateData.metadata = {
                ...existingMetadata,
                ...metadata,
                editHistory,
                lastEditedAt: new Date().toISOString(),
            };
        }

        if (Object.keys(updateData).length === 0) {
            return Response.json({ error: "No valid fields to update" }, { status: 400 });
        }

        const [updatedMessage] = await db
            .update(messages)
            .set(updateData)
            .where(eq(messages.id, id))
            .returning();

        return Response.json({ message: updatedMessage });
    } catch (error) {
        console.error("Update message error:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

// DELETE /api/messages/[id] - Delete a message
export async function DELETE(req: Request, { params }: RouteParams) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Get the message first
        const existingMessage = await db.query.messages.findFirst({
            where: eq(messages.id, id),
        });

        if (!existingMessage) {
            return Response.json({ error: "Message not found" }, { status: 404 });
        }

        // Verify conversation ownership
        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, existingMessage.conversationId),
                eq(conversations.userId, userId)
            ),
        });

        if (!conversation) {
            return Response.json({ error: "Message not found" }, { status: 404 });
        }

        // Delete the message
        await db.delete(messages).where(eq(messages.id, id));

        return Response.json({ success: true });
    } catch (error) {
        console.error("Delete message error:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
