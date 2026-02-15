import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, chunks, embeddings } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { deleteFile } from "@/lib/storage/s3";

// GET /api/documents/[id] - Get a single document
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

        // Get chunks count
        const documentChunks = await db.query.chunks.findMany({
            where: eq(chunks.documentId, id),
            columns: {
                id: true,
                index: true,
            },
        });

        return NextResponse.json({
            success: true,
            document: {
                id: document.id,
                filename: document.filename,
                mimeType: document.mimeType,
                size: document.size,
                status: document.status,
                chunkCount: documentChunks.length,
                metadata: document.metadata,
                createdAt: document.createdAt,
                updatedAt: document.updatedAt,
            },
        });
    } catch (error) {
        console.error("Get document error:", error);
        return NextResponse.json(
            { error: "Failed to get document", code: "GET_FAILED" },
            { status: 500 }
        );
    }
}

// DELETE /api/documents/[id] - Delete a document
export async function DELETE(
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

        // Get all chunks for this document
        const documentChunks = await db.query.chunks.findMany({
            where: eq(chunks.documentId, id),
            columns: { id: true },
        });

        // Delete embeddings for all chunks
        for (const chunk of documentChunks) {
            await db.delete(embeddings).where(eq(embeddings.chunkId, chunk.id));
        }

        // Delete chunks
        await db.delete(chunks).where(eq(chunks.documentId, id));

        // Soft delete the document
        await db
            .update(documents)
            .set({ deletedAt: new Date() })
            .where(eq(documents.id, id));

        // Delete from S3 (optional - could keep for recovery)
        try {
            if (document.storageKey) {
                await deleteFile(document.storageKey);
            }
        } catch (s3Error) {
            console.error("Failed to delete from S3:", s3Error);
            // Don't fail the request if S3 deletion fails
        }

        return NextResponse.json({
            success: true,
            message: "Document deleted",
        });
    } catch (error) {
        console.error("Delete document error:", error);
        return NextResponse.json(
            { error: "Failed to delete document", code: "DELETE_FAILED" },
            { status: 500 }
        );
    }
}
