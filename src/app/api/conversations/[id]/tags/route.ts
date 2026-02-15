import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conversations, conversationTags } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerSession } from "@/lib/auth/session";
import { addTagSchema, parseRequestBody } from "@/types/api";
import { withRateLimit } from "@/lib/middleware/rate-limit";

interface RouteContext {
    params: Promise<{ id: string }>;
}

// GET /api/conversations/[id]/tags - Get all tags for a conversation
async function handleGet(request: NextRequest, context: RouteContext) {
    const session = await getServerSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: conversationId } = await context.params;

    // Verify conversation belongs to user
    const conversation = await db.query.conversations.findFirst({
        where: and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, session.user.id)
        ),
    });

    if (!conversation) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const tags = await db.query.conversationTags.findMany({
        where: eq(conversationTags.conversationId, conversationId),
        orderBy: (tags, { asc }) => [asc(tags.tag)],
    });

    return NextResponse.json({ tags });
}

// POST /api/conversations/[id]/tags - Add a tag to a conversation
async function handlePost(request: NextRequest, context: RouteContext) {
    const session = await getServerSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: conversationId } = await context.params;

    // Verify conversation belongs to user
    const conversation = await db.query.conversations.findFirst({
        where: and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, session.user.id)
        ),
    });

    if (!conversation) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const { data, error } = await parseRequestBody(request, addTagSchema);
    if (error) {
        return NextResponse.json(error, { status: 400 });
    }

    const normalizedTag = data.tag.toLowerCase().trim();

    // Check if tag already exists for this conversation
    const existingTag = await db.query.conversationTags.findFirst({
        where: and(
            eq(conversationTags.conversationId, conversationId),
            eq(conversationTags.tag, normalizedTag)
        ),
    });

    if (existingTag) {
        return NextResponse.json({ error: "Tag already exists" }, { status: 409 });
    }

    const [newTag] = await db.insert(conversationTags).values({
        conversationId,
        tag: normalizedTag,
    }).returning();

    return NextResponse.json({ tag: newTag }, { status: 201 });
}

// DELETE /api/conversations/[id]/tags?tag=xxx - Remove a tag from a conversation
async function handleDelete(request: NextRequest, context: RouteContext) {
    const session = await getServerSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: conversationId } = await context.params;
    const { searchParams } = new URL(request.url);
    const tagName = searchParams.get("tag");

    if (!tagName) {
        return NextResponse.json({ error: "Tag name is required" }, { status: 400 });
    }

    // Verify conversation belongs to user
    const conversation = await db.query.conversations.findFirst({
        where: and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, session.user.id)
        ),
    });

    if (!conversation) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const normalizedTag = tagName.toLowerCase().trim();

    const deleted = await db.delete(conversationTags)
        .where(and(
            eq(conversationTags.conversationId, conversationId),
            eq(conversationTags.tag, normalizedTag)
        ))
        .returning();

    if (deleted.length === 0) {
        return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
}

export const GET = withRateLimit(handleGet);
export const POST = withRateLimit(handlePost);
export const DELETE = withRateLimit(handleDelete);
