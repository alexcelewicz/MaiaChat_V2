import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { z } from "zod";

const listQuerySchema = z.object({
    status: z.enum(["uploaded", "processing", "processed", "failed"]).optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
    offset: z.coerce.number().min(0).default(0),
});

// GET /api/documents - List user's documents
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
        const queryResult = listQuerySchema.safeParse({
            status: searchParams.get("status") || undefined,
            limit: searchParams.get("limit") || 50,
            offset: searchParams.get("offset") || 0,
        });

        if (!queryResult.success) {
            return NextResponse.json(
                { error: "Invalid query parameters", code: "INVALID_QUERY" },
                { status: 400 }
            );
        }

        const { status, limit, offset } = queryResult.data;

        // Build query conditions
        const conditions = [
            eq(documents.userId, userId),
            isNull(documents.deletedAt),
        ];

        if (status) {
            conditions.push(eq(documents.status, status));
        }

        // Fetch documents
        const userDocuments = await db.query.documents.findMany({
            where: and(...conditions),
            orderBy: [desc(documents.createdAt)],
            limit,
            offset,
        });

        // Get total count
        const totalResult = await db
            .select({ count: documents.id })
            .from(documents)
            .where(and(...conditions));

        return NextResponse.json({
            success: true,
            documents: userDocuments.map(doc => ({
                id: doc.id,
                filename: doc.filename,
                mimeType: doc.mimeType,
                size: doc.size,
                status: doc.status,
                chunkCount: doc.chunkCount,
                metadata: doc.metadata,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
            })),
            pagination: {
                total: totalResult.length,
                limit,
                offset,
            },
        });
    } catch (error) {
        console.error("List documents error:", error);
        // Return empty array instead of error for better UX
        return NextResponse.json({
            success: true,
            documents: [],
            pagination: {
                total: 0,
                limit: 50,
                offset: 0,
            },
        });
    }
}
