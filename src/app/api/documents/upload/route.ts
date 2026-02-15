import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, chunks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { uploadFile, generateDocumentKey } from "@/lib/storage/s3";
import { processDocument, validateFileSize, validateFileType, getFileType } from "@/lib/documents/processors";
import { chunkDocument } from "@/lib/documents/chunking";
import { v4 as uuidv4 } from "uuid";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// POST /api/documents/upload - Upload a document
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
        const rateLimitResult = await checkRateLimit(rateLimitId, "upload", {
            windowSeconds: 60,
            limit: 10, // 10 uploads per minute
        });

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, { windowSeconds: 60, limit: 10 });
        }

        // Parse multipart form data
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const processImmediately = formData.get("processImmediately") !== "false";
        const chunkingStrategy = (formData.get("chunkingStrategy") as string) || "recursive";

        if (!file) {
            return NextResponse.json(
                { error: "No file provided", code: "NO_FILE" },
                { status: 400 }
            );
        }

        // Validate file type
        if (!validateFileType(file.name, file.type)) {
            return NextResponse.json(
                { error: "Unsupported file type", code: "INVALID_FILE_TYPE" },
                { status: 400 }
            );
        }

        // Validate file size
        if (!validateFileSize(file.size, MAX_FILE_SIZE)) {
            return NextResponse.json(
                { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`, code: "FILE_TOO_LARGE" },
                { status: 400 }
            );
        }

        // Generate document ID and storage key
        const documentId = uuidv4();
        const storageKey = generateDocumentKey(userId, file.name, documentId);
        const fileType = getFileType(file.name, file.type);

        // Read file into buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to S3
        await uploadFile(storageKey, buffer, {
            contentType: file.type,
            metadata: {
                userId,
                documentId,
                originalFilename: file.name,
            },
        });

        // Create document record
        const [newDocument] = await db
            .insert(documents)
            .values({
                id: documentId,
                userId,
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                storageKey,
                status: processImmediately ? "processing" : "uploaded",
                metadata: {
                    fileType,
                    chunkingStrategy,
                },
            })
            .returning();

        if (!newDocument) {
            return NextResponse.json(
                { error: "Failed to create document record", code: "CREATE_FAILED" },
                { status: 500 }
            );
        }

        // Process document if requested
        if (processImmediately) {
            try {
                // Process the document
                const processed = await processDocument(buffer, file.name, file.type);

                // Chunk the document
                const documentChunks = chunkDocument(processed.text, chunkingStrategy as "fixed" | "semantic" | "recursive");

                // Save chunks to database
                if (documentChunks.length > 0) {
                    await db.insert(chunks).values(
                        documentChunks.map((chunk, index) => ({
                            id: uuidv4(),
                            documentId,
                            content: chunk.content,
                            index,
                            startOffset: chunk.startOffset,
                            endOffset: chunk.endOffset,
                            metadata: {
                                ...chunk.metadata,
                                characterCount: chunk.content.length,
                                wordCount: chunk.content.split(/\s+/).filter(w => w.length > 0).length,
                            },
                        }))
                    );
                }

                // Update document status
                await db
                    .update(documents)
                    .set({
                        status: "processed",
                        processedText: processed.text,
                        chunkCount: documentChunks.length,
                        metadata: {
                            ...(newDocument.metadata as Record<string, unknown>),
                            ...processed.metadata,
                            processedAt: new Date().toISOString(),
                        },
                        updatedAt: new Date(),
                    })
                    .where(eq(documents.id, documentId));

                return NextResponse.json({
                    success: true,
                    document: {
                        id: documentId,
                        filename: file.name,
                        size: file.size,
                        status: "processed",
                        chunkCount: documentChunks.length,
                        metadata: processed.metadata,
                    },
                });
            } catch (processError) {
                // Update document status to failed
                await db
                    .update(documents)
                    .set({
                        status: "failed",
                        metadata: {
                            ...(newDocument.metadata as Record<string, unknown>),
                            error: processError instanceof Error ? processError.message : "Processing failed",
                        },
                        updatedAt: new Date(),
                    })
                    .where(eq(documents.id, documentId));

                console.error("Document processing error:", processError);

                return NextResponse.json({
                    success: true,
                    document: {
                        id: documentId,
                        filename: file.name,
                        size: file.size,
                        status: "failed",
                        error: processError instanceof Error ? processError.message : "Processing failed",
                    },
                });
            }
        }

        return NextResponse.json({
            success: true,
            document: {
                id: documentId,
                filename: file.name,
                size: file.size,
                status: "uploaded",
            },
        });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json(
            { error: "Failed to upload document", code: "UPLOAD_FAILED" },
            { status: 500 }
        );
    }
}
