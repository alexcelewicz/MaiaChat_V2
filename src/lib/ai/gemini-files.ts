/**
 * Gemini File Search Integration
 * Uses Google's File API for document-based RAG
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// FileState enum - defined locally as it's not exported in newer SDK versions
enum FileState {
    STATE_UNSPECIFIED = "STATE_UNSPECIFIED",
    PROCESSING = "PROCESSING",
    ACTIVE = "ACTIVE",
    FAILED = "FAILED",
}
import { db } from "@/lib/db";
import { documents, users } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { downloadFile } from "@/lib/storage/s3";

// ============================================================================
// Types
// ============================================================================

export interface GeminiFile {
    name: string;
    displayName: string;
    mimeType: string;
    sizeBytes: string;
    createTime: string;
    updateTime: string;
    expirationTime: string;
    sha256Hash: string;
    uri: string;
    state: FileState;
}

export interface UploadedFile {
    fileId: string;
    documentId: string;
    name: string;
    uri: string;
    mimeType: string;
    expirationTime: Date;
}

// ============================================================================
// Client Management
// ============================================================================

function getGeminiClient(apiKey?: string): GoogleGenerativeAI {
    const key = apiKey || process.env.GOOGLE_API_KEY;
    if (!key) {
        throw new Error("Google API key not configured");
    }
    return new GoogleGenerativeAI(key);
}

// ============================================================================
// File Upload
// ============================================================================

/**
 * Upload a document to Gemini File API
 */
export async function uploadDocumentToGemini(
    documentId: string,
    userId: string,
    apiKey?: string
): Promise<UploadedFile> {
    // Get document from database
    const document = await db.query.documents.findFirst({
        where: and(
            eq(documents.id, documentId),
            eq(documents.userId, userId),
            isNull(documents.deletedAt)
        ),
    });

    if (!document) {
        throw new Error("Document not found");
    }

    // Download file from S3
    const fileBuffer = await downloadFile(document.storageKey);

    const genAI = getGeminiClient(apiKey);
    const fileManager = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    // Convert buffer to blob for upload - use Uint8Array for compatibility
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: document.mimeType });

    // Upload to Gemini
    const uploadResult = await genAI.getGenerativeModel({ model: "gemini-1.5-pro" })
        // @ts-expect-error - File upload is available but types may not be up to date
        .uploadFile({
            file: blob,
            mimeType: document.mimeType,
            displayName: document.filename,
        });

    // Wait for file to be processed
    let file = uploadResult.file;
    while (file.state === FileState.PROCESSING) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        // @ts-expect-error - getFile is available
        file = await genAI.getFile(file.name);
    }

    if (file.state === FileState.FAILED) {
        throw new Error("File processing failed");
    }

    // Store file reference in document metadata
    const metadata = (document.metadata as Record<string, unknown>) || {};
    await db
        .update(documents)
        .set({
            metadata: {
                ...metadata,
                geminiFile: {
                    name: file.name,
                    uri: file.uri,
                    expirationTime: file.expirationTime,
                },
            },
            updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

    return {
        fileId: file.name,
        documentId,
        name: file.displayName || document.filename,
        uri: file.uri,
        mimeType: document.mimeType,
        expirationTime: new Date(file.expirationTime),
    };
}

/**
 * Alternative upload using fetch API for broader compatibility
 */
export async function uploadDocumentToGeminiViaFetch(
    documentId: string,
    userId: string,
    apiKey?: string
): Promise<UploadedFile> {
    const key = apiKey || process.env.GOOGLE_API_KEY;
    if (!key) {
        throw new Error("Google API key not configured");
    }

    // Get document from database
    const document = await db.query.documents.findFirst({
        where: and(
            eq(documents.id, documentId),
            eq(documents.userId, userId),
            isNull(documents.deletedAt)
        ),
    });

    if (!document) {
        throw new Error("Document not found");
    }

    // Download file from S3
    const fileBuffer = await downloadFile(document.storageKey);

    // Step 1: Start resumable upload
    const startResponse = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`,
        {
            method: "POST",
            headers: {
                "X-Goog-Upload-Protocol": "resumable",
                "X-Goog-Upload-Command": "start",
                "X-Goog-Upload-Header-Content-Length": String(fileBuffer.length),
                "X-Goog-Upload-Header-Content-Type": document.mimeType,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                file: {
                    display_name: document.filename,
                },
            }),
        }
    );

    if (!startResponse.ok) {
        const error = await startResponse.text();
        throw new Error(`Failed to start upload: ${error}`);
    }

    const uploadUrl = startResponse.headers.get("X-Goog-Upload-URL");
    if (!uploadUrl) {
        throw new Error("No upload URL returned");
    }

    // Step 2: Upload the file content
    const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
            "Content-Length": String(fileBuffer.length),
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize",
        },
        body: new Uint8Array(fileBuffer),
    });

    if (!uploadResponse.ok) {
        const error = await uploadResponse.text();
        throw new Error(`Failed to upload file: ${error}`);
    }

    const fileInfo = await uploadResponse.json();

    // Step 3: Wait for processing
    let file = fileInfo.file;
    while (file.state === "PROCESSING") {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${key}`
        );
        
        if (!statusResponse.ok) {
            throw new Error("Failed to check file status");
        }
        
        file = await statusResponse.json();
    }

    if (file.state === "FAILED") {
        throw new Error("File processing failed");
    }

    // Store file reference in document metadata
    const metadata = (document.metadata as Record<string, unknown>) || {};
    await db
        .update(documents)
        .set({
            metadata: {
                ...metadata,
                geminiFile: {
                    name: file.name,
                    uri: file.uri,
                    expirationTime: file.expirationTime,
                },
            },
            updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

    return {
        fileId: file.name,
        documentId,
        name: file.displayName || document.filename,
        uri: file.uri,
        mimeType: document.mimeType,
        expirationTime: new Date(file.expirationTime),
    };
}

// ============================================================================
// File Management
// ============================================================================

/**
 * List all Gemini files for a user
 */
export async function listGeminiFiles(
    userId: string,
    apiKey?: string
): Promise<GeminiFile[]> {
    const key = apiKey || process.env.GOOGLE_API_KEY;
    if (!key) {
        throw new Error("Google API key not configured");
    }

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/files?key=${key}`
    );

    if (!response.ok) {
        throw new Error("Failed to list files");
    }

    const data = await response.json();
    return data.files || [];
}

/**
 * Delete a file from Gemini
 */
export async function deleteGeminiFile(
    fileName: string,
    apiKey?: string
): Promise<void> {
    const key = apiKey || process.env.GOOGLE_API_KEY;
    if (!key) {
        throw new Error("Google API key not configured");
    }

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${key}`,
        { method: "DELETE" }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to delete file: ${error}`);
    }
}

/**
 * Get Gemini file status
 */
export async function getGeminiFileStatus(
    fileName: string,
    apiKey?: string
): Promise<GeminiFile> {
    const key = apiKey || process.env.GOOGLE_API_KEY;
    if (!key) {
        throw new Error("Google API key not configured");
    }

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${key}`
    );

    if (!response.ok) {
        throw new Error("Failed to get file status");
    }

    return response.json();
}

// ============================================================================
// File Search (Retriever)
// ============================================================================

interface GeminiFileReference {
    uri: string;
    mimeType: string;
}

async function resolveGeminiFileReferences(
    fileIds: string[],
    apiKey: string
): Promise<GeminiFileReference[]> {
    const uniqueIds = Array.from(new Set(fileIds.filter(Boolean)));
    const references: GeminiFileReference[] = [];

    for (const fileId of uniqueIds) {
        if (fileId.includes("://")) {
            references.push({
                uri: fileId,
                mimeType: "application/octet-stream",
            });
            continue;
        }

        try {
            const file = await getGeminiFileStatus(fileId, apiKey);
            if (file.state !== FileState.ACTIVE) {
                continue;
            }

            references.push({
                uri: file.uri,
                mimeType: file.mimeType || "application/octet-stream",
            });
        } catch (error) {
            console.warn(`[Gemini] Failed to resolve file ${fileId}:`, error);
        }
    }

    return references;
}

/**
 * Search Gemini files and return relevant context
 * Can be used as retriever for any model
 */
export async function searchGeminiFiles(
    query: string,
    fileIds: string[],
    apiKeys?: Record<string, string>
): Promise<string> {
    const key = apiKeys?.google || process.env.GOOGLE_API_KEY;
    if (!key) {
        throw new Error("Google API key not configured");
    }

    if (!fileIds.length) {
        return "No Gemini files configured.";
    }

    const fileReferences = await resolveGeminiFileReferences(fileIds, key);
    if (fileReferences.length === 0) {
        return "No active Gemini files available.";
    }

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Based on the following query, extract and summarize the most relevant information from the uploaded files.

Query: ${query}

Provide a concise summary of relevant information. If nothing is relevant, say "No relevant information found."`;

    const parts = [
        ...fileReferences.map((file) => ({
            fileData: {
                mimeType: file.mimeType,
                fileUri: file.uri,
            },
        })),
        { text: prompt },
    ];

    const result = await model.generateContent({
        contents: [{ role: "user", parts }],
    });

    return result.response.text();
}

// ============================================================================
// Chat with Files
// ============================================================================

/**
 * Generate content with file context using Gemini
 */
export async function generateWithFiles(
    prompt: string,
    fileUris: string[],
    options: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        apiKey?: string;
    } = {}
): Promise<string> {
    const {
        model = "gemini-1.5-pro",
        temperature = 0.7,
        maxTokens = 4096,
        apiKey,
    } = options;

    const genAI = getGeminiClient(apiKey);
    const geminiModel = genAI.getGenerativeModel({ model });

    // Build parts with file references
    const parts = [
        // Add file references
        ...fileUris.map(uri => ({
            fileData: {
                mimeType: "application/pdf", // Will be overridden by actual file type
                fileUri: uri,
            },
        })),
        // Add the prompt
        { text: prompt },
    ];

    const result = await geminiModel.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
        },
    });

    const response = result.response;
    return response.text();
}

/**
 * Get file URIs from document IDs
 */
export async function getFileUrisFromDocuments(
    documentIds: string[],
    userId: string
): Promise<{ documentId: string; uri: string }[]> {
    const results: { documentId: string; uri: string }[] = [];

    for (const documentId of documentIds) {
        const document = await db.query.documents.findFirst({
            where: and(
                eq(documents.id, documentId),
                eq(documents.userId, userId),
                isNull(documents.deletedAt)
            ),
        });

        if (document) {
            const metadata = document.metadata as Record<string, unknown>;
            const geminiFile = metadata?.geminiFile as { uri?: string } | undefined;
            
            if (geminiFile?.uri) {
                results.push({
                    documentId,
                    uri: geminiFile.uri,
                });
            }
        }
    }

    return results;
}
