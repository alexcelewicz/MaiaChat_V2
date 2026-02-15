import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { hybridSearch, semanticSearch, textSearch, SearchOptions } from "@/lib/rag/search";
import { z } from "zod";

const searchSchema = z.object({
    query: z.string().min(1).max(1000),
    method: z.enum(["semantic", "text", "hybrid"]).default("hybrid"),
    topK: z.number().min(1).max(20).default(5),
    threshold: z.number().min(0).max(1).default(0.7),
    documentIds: z.array(z.string().uuid()).optional(),
});

// POST /api/rag/search - Search documents
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

        const body = await request.json();
        const validationResult = searchSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json(
                { error: "Invalid request", details: validationResult.error.issues },
                { status: 400 }
            );
        }

        const { query, method, topK, threshold, documentIds } = validationResult.data;

        const searchOptions: SearchOptions = {
            topK,
            threshold,
            documentIds,
            userId,
        };

        let results;
        switch (method) {
            case "semantic":
                results = await semanticSearch(query, searchOptions);
                break;
            case "text":
                results = await textSearch(query, searchOptions);
                break;
            case "hybrid":
            default:
                results = await hybridSearch(query, searchOptions);
                break;
        }

        return NextResponse.json({
            success: true,
            results,
            meta: {
                query,
                method,
                topK,
                threshold,
                resultCount: results.length,
            },
        });
    } catch (error) {
        console.error("RAG search error:", error);
        return NextResponse.json(
            { error: "Search failed", code: "SEARCH_FAILED" },
            { status: 500 }
        );
    }
}
