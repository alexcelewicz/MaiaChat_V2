import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import {
    uploadDocumentToGeminiViaFetch,
    getGeminiFileStatus,
    deleteGeminiFile,
} from "@/lib/ai/gemini-files";

// GET /api/documents/[id]/gemini - Get Gemini file status
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
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", {
            windowSeconds: 60,
            limit: 60,
        });

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, { windowSeconds: 60, limit: 60 });
        }

        const { id } = await params;

        // Get document
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

        // Check if document has Gemini file
        const metadata = document.metadata as Record<string, unknown>;
        const geminiFile = metadata?.geminiFile as { name?: string; uri?: string; expirationTime?: string } | undefined;

        if (!geminiFile?.name) {
            return NextResponse.json({
                success: true,
                hasGeminiFile: false,
            });
        }

        // Get file status from Gemini
        try {
            const fileStatus = await getGeminiFileStatus(geminiFile.name);
            
            return NextResponse.json({
                success: true,
                hasGeminiFile: true,
                geminiFile: {
                    name: fileStatus.name,
                    uri: fileStatus.uri,
                    state: fileStatus.state,
                    expirationTime: fileStatus.expirationTime,
                },
            });
        } catch {
            // File might have expired or been deleted
            return NextResponse.json({
                success: true,
                hasGeminiFile: false,
                message: "Gemini file expired or deleted",
            });
        }
    } catch (error) {
        console.error("Get Gemini file status error:", error);
        return NextResponse.json(
            { error: "Failed to get Gemini file status", code: "STATUS_FAILED" },
            { status: 500 }
        );
    }
}

// POST /api/documents/[id]/gemini - Upload document to Gemini
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
            limit: 10, // Limited due to file upload cost
        });

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, { windowSeconds: 60, limit: 10 });
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
                { error: "Document must be processed first", code: "NOT_PROCESSED" },
                { status: 400 }
            );
        }

        // Upload to Gemini
        const result = await uploadDocumentToGeminiViaFetch(id, userId);

        return NextResponse.json({
            success: true,
            geminiFile: {
                fileId: result.fileId,
                uri: result.uri,
                expirationTime: result.expirationTime,
            },
        });
    } catch (error) {
        console.error("Upload to Gemini error:", error);
        return NextResponse.json(
            { error: "Failed to upload to Gemini", code: "UPLOAD_FAILED" },
            { status: 500 }
        );
    }
}

// DELETE /api/documents/[id]/gemini - Delete Gemini file
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
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", {
            windowSeconds: 60,
            limit: 30,
        });

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, { windowSeconds: 60, limit: 30 });
        }

        const { id } = await params;

        // Get document
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

        // Check if document has Gemini file
        const metadata = document.metadata as Record<string, unknown>;
        const geminiFile = metadata?.geminiFile as { name?: string } | undefined;

        if (!geminiFile?.name) {
            return NextResponse.json(
                { error: "No Gemini file associated", code: "NO_FILE" },
                { status: 400 }
            );
        }

        // Delete from Gemini
        try {
            await deleteGeminiFile(geminiFile.name);
        } catch {
            // File might already be deleted, continue anyway
        }

        // Remove from document metadata
        const { geminiFile: _, ...restMetadata } = metadata;
        await db
            .update(documents)
            .set({
                metadata: restMetadata,
                updatedAt: new Date(),
            })
            .where(eq(documents.id, id));

        return NextResponse.json({
            success: true,
            message: "Gemini file deleted",
        });
    } catch (error) {
        console.error("Delete Gemini file error:", error);
        return NextResponse.json(
            { error: "Failed to delete Gemini file", code: "DELETE_FAILED" },
            { status: 500 }
        );
    }
}
