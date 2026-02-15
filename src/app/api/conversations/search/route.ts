import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { eq, and, isNull, ilike, or, desc } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { z } from "zod";

const searchQuerySchema = z.object({
    q: z.string().min(1).max(200),
    limit: z.coerce.number().min(1).max(50).optional().default(20),
});

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
        const queryResult = searchQuerySchema.safeParse({
            q: searchParams.get("q") || "",
            limit: searchParams.get("limit") || undefined,
        });

        if (!queryResult.success) {
            return NextResponse.json(
                { error: "Invalid query parameters", code: "INVALID_QUERY" },
                { status: 400 }
            );
        }

        const { q, limit } = queryResult.data;
        const searchPattern = `%${q}%`;

        // Search in conversation titles
        const titleMatches = await db.query.conversations.findMany({
            where: and(
                eq(conversations.userId, userId),
                isNull(conversations.deletedAt),
                ilike(conversations.title, searchPattern)
            ),
            orderBy: [desc(conversations.updatedAt)],
            limit,
            columns: {
                id: true,
                title: true,
                isFavorite: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Search in message content (get conversation IDs)
        const messageMatches = await db
            .select({
                conversationId: messages.conversationId,
                content: messages.content,
                createdAt: messages.createdAt,
            })
            .from(messages)
            .innerJoin(conversations, eq(messages.conversationId, conversations.id))
            .where(
                and(
                    eq(conversations.userId, userId),
                    isNull(conversations.deletedAt),
                    ilike(messages.content, searchPattern)
                )
            )
            .orderBy(desc(messages.createdAt))
            .limit(limit);

        // Get unique conversation IDs from message matches
        const messageConvIds = [...new Set(messageMatches.map(m => m.conversationId))];
        
        // Fetch those conversations
        let contentMatchConversations: typeof titleMatches = [];
        if (messageConvIds.length > 0) {
            contentMatchConversations = await db.query.conversations.findMany({
                where: and(
                    eq(conversations.userId, userId),
                    isNull(conversations.deletedAt),
                    // Filter to only IDs from message matches
                    or(...messageConvIds.map(id => eq(conversations.id, id)))
                ),
                columns: {
                    id: true,
                    title: true,
                    isFavorite: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        }

        // Create a map of conversation to matching snippets
        const snippetMap = new Map<string, string>();
        for (const match of messageMatches) {
            if (!snippetMap.has(match.conversationId)) {
                // Create snippet around the match
                const lowerContent = match.content.toLowerCase();
                const lowerQuery = q.toLowerCase();
                const matchIndex = lowerContent.indexOf(lowerQuery);
                
                if (matchIndex !== -1) {
                    const start = Math.max(0, matchIndex - 40);
                    const end = Math.min(match.content.length, matchIndex + q.length + 40);
                    let snippet = match.content.slice(start, end);
                    
                    if (start > 0) snippet = "..." + snippet;
                    if (end < match.content.length) snippet = snippet + "...";
                    
                    snippetMap.set(match.conversationId, snippet);
                }
            }
        }

        // Combine results, prioritizing title matches
        const titleMatchIds = new Set(titleMatches.map(c => c.id));
        const combinedResults = [
            ...titleMatches.map(c => ({
                ...c,
                matchType: "title" as const,
                snippet: null as string | null,
            })),
            ...contentMatchConversations
                .filter(c => !titleMatchIds.has(c.id))
                .map(c => ({
                    ...c,
                    matchType: "content" as const,
                    snippet: snippetMap.get(c.id) || null,
                })),
        ].slice(0, limit);

        return NextResponse.json({
            success: true,
            results: combinedResults,
            query: q,
        });
    } catch (error) {
        console.error("Search conversations error:", error);
        return NextResponse.json(
            { error: "Failed to search conversations", code: "SEARCH_FAILED" },
            { status: 500 }
        );
    }
}
