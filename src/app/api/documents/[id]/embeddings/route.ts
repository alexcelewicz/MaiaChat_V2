import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { storeChunkEmbeddings, getDocumentEmbeddingStats } from "@/lib/rag/storage";
import { getUserApiKey } from "@/lib/ai/get-user-keys";

// GET /api/documents/[id]/embeddings - Get embedding status
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id } = await params;

        // Verify document ownership
        const document = await db.query.documents.findFirst({
            where: and(
                eq(documents.id, id),
                eq(documents.userId, userId),
                isNull(documents.deletedAt)
            ),
        });

        if (!document) {
            return NextResponse.json(
                { error: "Document not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        const stats = await getDocumentEmbeddingStats(id);

        return NextResponse.json({
            success: true,
            ...stats,
        });
    } catch (error) {
        console.error("Get embeddings status error:", error);
        return NextResponse.json(
            { error: "Failed to get embedding status", code: "STATUS_FAILED" },
            { status: 500 }
        );
    }
}

// POST /api/documents/[id]/embeddings - Generate embeddings
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", {
            windowSeconds: 60,
            limit: 5, // 5 embedding requests per minute
        });

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, { windowSeconds: 60, limit: 5 });
        }

        const { id } = await params;

        // Verify document ownership
        const document = await db.query.documents.findFirst({
            where: and(
                eq(documents.id, id),
                eq(documents.userId, userId),
                isNull(documents.deletedAt)
            ),
        });

        if (!document) {
            return NextResponse.json(
                { error: "Document not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        if (document.status !== "processed") {
            return NextResponse.json(
                { error: "Document must be processed before generating embeddings", code: "NOT_PROCESSED" },
                { status: 400 }
            );
        }

        // Get user's OpenAI API key for embeddings
        const openaiApiKey = await getUserApiKey(userId, "openai");
        if (!openaiApiKey) {
            return NextResponse.json(
                { error: "OpenAI API key required for embeddings. Please add your API key in Settings.", code: "API_KEY_MISSING" },
                { status: 400 }
            );
        }

        const result = await storeChunkEmbeddings(id, openaiApiKey);

        return NextResponse.json({
            success: true,
            stored: result.stored,
            errors: result.errors,
        });
    } catch (error) {
        console.error("Generate embeddings error:", error);
        return NextResponse.json(
            { error: "Failed to generate embeddings", code: "EMBEDDING_FAILED" },
            { status: 500 }
        );
    }
}
