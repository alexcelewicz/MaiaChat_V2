/**
 * Gemini File Search Stores API Service
 *
 * Wraps the Google Gemini File Search Stores API (v1beta) for persistent
 * document storage and retrieval. Unlike the File API (48-hour expiry),
 * File Search Stores provide permanent storage with built-in retrieval.
 *
 * Reference: gemini-file-search-rag-working-example/services/api.ts
 */

import { db } from "@/lib/db";
import { adminSettings } from "@/lib/db/schema";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta";

// Default model for file search retrieval (can be overridden by admin settings)
// Using Gemini 3 Flash for best performance - fast, affordable, 1M context window
const DEFAULT_RETRIEVAL_MODEL = "gemini-3-flash-preview";

/**
 * Get the configured Gemini model for file search retrieval
 */
export async function getConfiguredRetrievalModel(): Promise<string> {
    try {
        const settings = await db.query.adminSettings.findFirst();
        return settings?.geminiRetrievalModel || DEFAULT_RETRIEVAL_MODEL;
    } catch (error) {
        console.error("[gemini-stores] Failed to get retrieval model from settings:", error);
        return DEFAULT_RETRIEVAL_MODEL;
    }
}

// ============================================================================
// Types
// ============================================================================

export interface FileSearchStore {
    name: string; // Resource name, e.g. "fileSearchStores/abc123"
    displayName?: string;
    createTime?: string;
    updateTime?: string;
    activeDocumentsCount?: string;
    pendingDocumentsCount?: string;
    failedDocumentsCount?: string;
    sizeBytes?: string;
}

export interface StoreDocument {
    name: string;
    displayName?: string;
    customMetadata?: Array<{
        key: string;
        stringValue?: string;
        stringListValue?: { values: string[] };
        numericValue?: number;
    }>;
    updateTime?: string;
    createTime?: string;
    state?: "STATE_UNSPECIFIED" | "STATE_PENDING" | "STATE_ACTIVE" | "STATE_FAILED";
    sizeBytes?: string;
    mimeType?: string;
    error?: { code: number; message: string };
}

interface Operation {
    name: string;
    metadata?: unknown;
    done: boolean;
    error?: { code: number; message: string };
    response?: unknown;
}

interface ListFileSearchStoresResponse {
    fileSearchStores?: FileSearchStore[];
    nextPageToken?: string;
}

interface ListDocumentsResponse {
    documents?: StoreDocument[];
    nextPageToken?: string;
}

// ============================================================================
// Helper
// ============================================================================

function headers(apiKey: string): Record<string, string> {
    return {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
    };
}

async function assertOk(res: Response, label: string) {
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${label} failed (${res.status}): ${body}`);
    }
}

// ============================================================================
// Store CRUD
// ============================================================================

/**
 * Create a new File Search Store
 */
export async function createGeminiStore(
    displayName: string,
    apiKey: string
): Promise<FileSearchStore> {
    const res = await fetch(`${BASE_URL}/fileSearchStores`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({ displayName }),
    });
    await assertOk(res, "createGeminiStore");
    return res.json();
}

/**
 * Delete a File Search Store (force delete includes all documents)
 */
export async function deleteGeminiStore(
    storeName: string,
    apiKey: string
): Promise<void> {
    const res = await fetch(`${BASE_URL}/${storeName}?force=true`, {
        method: "DELETE",
        headers: headers(apiKey),
    });
    await assertOk(res, "deleteGeminiStore");
}

/**
 * Get a File Search Store's details
 */
export async function getGeminiStore(
    storeName: string,
    apiKey: string
): Promise<FileSearchStore> {
    const res = await fetch(`${BASE_URL}/${storeName}`, {
        method: "GET",
        headers: headers(apiKey),
    });
    await assertOk(res, "getGeminiStore");
    return res.json();
}

/**
 * List all File Search Stores for the API key
 */
export async function listGeminiStores(
    apiKey: string,
    pageToken?: string
): Promise<ListFileSearchStoresResponse> {
    const params = new URLSearchParams();
    if (pageToken) params.set("pageToken", pageToken);
    const qs = params.toString();
    const res = await fetch(`${BASE_URL}/fileSearchStores${qs ? `?${qs}` : ""}`, {
        method: "GET",
        headers: headers(apiKey),
    });
    await assertOk(res, "listGeminiStores");
    return res.json();
}

// ============================================================================
// Document Operations
// ============================================================================

/**
 * Upload a document to a File Search Store using multipart upload.
 * Returns the operation name; polls until done.
 */
export async function uploadDocumentToStore(
    storeName: string,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    apiKey: string
): Promise<StoreDocument | null> {
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const metadata = JSON.stringify({
        displayName: fileName,
        mimeType: mimeType || "application/octet-stream",
    });

    // Build multipart body
    const parts: Buffer[] = [];
    parts.push(Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`));
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const res = await fetch(
        `${UPLOAD_URL}/${storeName}:uploadToFileSearchStore?uploadType=multipart`,
        {
            method: "POST",
            headers: {
                "x-goog-api-key": apiKey,
                "Content-Type": `multipart/related; boundary=${boundary}`,
                "Content-Length": body.length.toString(),
            },
            body,
        }
    );
    await assertOk(res, "uploadDocumentToStore");

    const operation: Operation = await res.json();

    // Poll until operation is done
    const result = await pollOperation(operation.name, apiKey);
    if (result.error) {
        throw new Error(`Upload operation failed: ${result.error.message}`);
    }

    // The response field of the completed operation contains the document
    return (result.response as StoreDocument) || null;
}

/**
 * Delete a document from a store
 */
export async function deleteStoreDocument(
    documentName: string,
    apiKey: string
): Promise<void> {
    const res = await fetch(`${BASE_URL}/${documentName}`, {
        method: "DELETE",
        headers: headers(apiKey),
    });
    await assertOk(res, "deleteStoreDocument");
}

/**
 * List documents in a File Search Store
 */
export async function listStoreDocuments(
    storeName: string,
    apiKey: string,
    pageToken?: string
): Promise<ListDocumentsResponse> {
    const params = new URLSearchParams();
    if (pageToken) params.set("pageToken", pageToken);
    const qs = params.toString();
    const res = await fetch(`${BASE_URL}/${storeName}/documents${qs ? `?${qs}` : ""}`, {
        method: "GET",
        headers: headers(apiKey),
    });
    await assertOk(res, "listStoreDocuments");
    return res.json();
}

// ============================================================================
// Operation Polling
// ============================================================================

async function getOperation(name: string, apiKey: string): Promise<Operation> {
    const res = await fetch(`${BASE_URL}/${name}`, {
        method: "GET",
        headers: headers(apiKey),
    });
    await assertOk(res, "getOperation");
    return res.json();
}

async function pollOperation(
    operationName: string,
    apiKey: string,
    maxWaitMs = 120_000,
    intervalMs = 1_000
): Promise<Operation> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const op = await getOperation(operationName, apiKey);
        if (op.done) return op;
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Operation ${operationName} timed out after ${maxWaitMs}ms`);
}

// ============================================================================
// File Search (Retrieval)
// ============================================================================

/**
 * Generate content using the fileSearch tool with File Search Stores.
 * This uses the @google/genai SDK for native fileSearch tool support.
 *
 * @param query - The search query
 * @param storeNames - Array of Gemini store resource names (e.g., "fileSearchStores/abc123")
 * @param apiKey - Google API key
 * @param model - Optional model override (defaults to configured retrieval model)
 */
export async function searchWithStores(
    query: string,
    storeNames: string[],
    apiKey: string,
    model?: string
): Promise<string> {
    try {
        // Use provided model or get from admin settings
        const effectiveModel = model || await getConfiguredRetrievalModel();

        console.log(`[gemini-stores] searchWithStores called with:`, {
            queryLength: query.length,
            storeCount: storeNames.length,
            storeNames: storeNames.slice(0, 3), // Log first 3 stores
            model: effectiveModel,
        });

        if (!storeNames || storeNames.length === 0) {
            console.warn("[gemini-stores] No stores provided for search");
            return "";
        }

        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });

        const response = await ai.models.generateContent({
            model: effectiveModel,
            contents: [{ role: "user", parts: [{ text: query }] }],
            config: {
                tools: [
                    {
                        fileSearch: {
                            fileSearchStoreNames: storeNames,
                        },
                    },
                ],
            },
        });

        // Extract text from the response
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parts = response?.candidates?.[0]?.content?.parts as any[] | undefined;
        const text = parts
            ?.filter((p) => typeof p?.text === "string")
            .map((p) => p.text as string)
            .join("\n");

        console.log(`[gemini-stores] searchWithStores returned ${text?.length || 0} chars`);
        return text || "";
    } catch (error) {
        console.error("[gemini-stores] searchWithStores error:", error);
        throw error;
    }
}
