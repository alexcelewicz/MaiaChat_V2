import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import { db } from "@/lib/db";
import { geminiStores, geminiStoreDocuments, documents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { uploadDocumentToStore, listStoreDocuments } from "@/lib/ai/gemini-stores";
import { downloadFile } from "@/lib/storage/s3";
import { checkRateLimit, RATE_LIMITS, getRateLimitIdentifier, rateLimitExceededResponse } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ storeId: string }> };

/**
 * GET /api/gemini/stores/[storeId]/documents — List documents in store
 *
 * Fetches documents directly from the Gemini API so that documents
 * uploaded outside MaiaChat (on other domains / apps) are visible too.
 * Local junction records are merged in for richer metadata when available.
 */
export async function GET(req: Request, context: RouteContext) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { storeId } = await context.params;

        // Verify ownership
        const store = await db.query.geminiStores.findFirst({
            where: and(
                eq(geminiStores.id, storeId),
                eq(geminiStores.userId, userId)
            ),
        });

        if (!store) {
            return NextResponse.json({ error: "Store not found" }, { status: 404 });
        }

        // Get local junction records (documents uploaded via MaiaChat)
        const localDocs = await db.query.geminiStoreDocuments.findMany({
            where: eq(geminiStoreDocuments.storeId, storeId),
            with: {
                document: true,
            },
        });

        // Build a set of known Gemini document names from local DB
        const localByGeminiName = new Map(
            localDocs
                .filter((d) => d.geminiDocumentName)
                .map((d) => [d.geminiDocumentName!, d])
        );

        // Fetch documents from the Gemini API for this store
        const apiKeys = await getUserApiKeys(userId);
        const googleKey = apiKeys.google;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let geminiApiDocs: any[] = [];
        if (googleKey) {
            try {
                const apiResponse = await listStoreDocuments(store.geminiStoreName, googleKey);
                geminiApiDocs = apiResponse.documents || [];
            } catch (err) {
                console.error("Failed to fetch documents from Gemini API:", err);
                // Fall through — return local docs only
            }
        }

        // Merge: local docs + Gemini-only docs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mergedDocs: any[] = [];

        // Add local docs first (they have richer metadata)
        for (const localDoc of localDocs) {
            mergedDocs.push(localDoc);
        }

        // Add Gemini-only docs (not tracked locally)
        for (const apiDoc of geminiApiDocs) {
            if (!localByGeminiName.has(apiDoc.name)) {
                mergedDocs.push({
                    id: apiDoc.name, // Use Gemini resource name as ID
                    storeId,
                    documentId: null,
                    geminiDocumentName: apiDoc.name,
                    geminiState: apiDoc.state === "STATE_ACTIVE" ? "active"
                        : apiDoc.state === "STATE_PENDING" ? "pending"
                        : apiDoc.state === "STATE_FAILED" ? "failed"
                        : "active",
                    uploadedAt: apiDoc.createTime || new Date().toISOString(),
                    document: null,
                    // Extra fields from the Gemini API for display
                    geminiDisplayName: apiDoc.displayName || apiDoc.name.split("/").pop(),
                    geminiMimeType: apiDoc.mimeType || null,
                    geminiSizeBytes: apiDoc.sizeBytes ? parseInt(apiDoc.sizeBytes, 10) : null,
                    isGeminiOnly: true,
                });
            }
        }

        return NextResponse.json({ documents: mergedDocs });
    } catch (error) {
        console.error("GET /api/gemini/stores/[storeId]/documents error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * POST /api/gemini/stores/[storeId]/documents — Add document to store
 * Body: { documentId: string } — takes an existing document ID
 *
 * Downloads the file from S3 and uploads it to the Gemini store.
 */
export async function POST(req: Request, context: RouteContext) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Rate limit
        const rateLimitId = getRateLimitIdentifier(req, userId);
        const rl = await checkRateLimit(rateLimitId, "gemini-store-upload", RATE_LIMITS.api);
        if (!rl.success) {
            return rateLimitExceededResponse(rl, RATE_LIMITS.api);
        }

        const { storeId } = await context.params;
        const body = await req.json();
        const { documentId } = body;

        if (!documentId) {
            return NextResponse.json({ error: "documentId is required" }, { status: 400 });
        }

        // Verify store ownership
        const store = await db.query.geminiStores.findFirst({
            where: and(
                eq(geminiStores.id, storeId),
                eq(geminiStores.userId, userId)
            ),
        });

        if (!store) {
            return NextResponse.json({ error: "Store not found" }, { status: 404 });
        }

        // Verify document ownership
        const document = await db.query.documents.findFirst({
            where: and(
                eq(documents.id, documentId),
                eq(documents.userId, userId)
            ),
        });

        if (!document) {
            return NextResponse.json({ error: "Document not found" }, { status: 404 });
        }

        // Check if already in store
        const existing = await db.query.geminiStoreDocuments.findFirst({
            where: and(
                eq(geminiStoreDocuments.storeId, storeId),
                eq(geminiStoreDocuments.documentId, documentId)
            ),
        });

        if (existing) {
            return NextResponse.json({ error: "Document already in store" }, { status: 409 });
        }

        // Get Google API key
        const apiKeys = await getUserApiKeys(userId);
        const googleKey = apiKeys.google;
        if (!googleKey) {
            return NextResponse.json(
                { error: "No Google API key configured. Add one in Settings." },
                { status: 400 }
            );
        }

        // Download file from S3
        const fileBuffer = await downloadFile(document.storageKey);

        // Upload to Gemini store
        const geminiDoc = await uploadDocumentToStore(
            store.geminiStoreName,
            fileBuffer,
            document.filename,
            document.mimeType,
            googleKey
        );

        // Create junction record
        const [storeDoc] = await db
            .insert(geminiStoreDocuments)
            .values({
                storeId,
                documentId,
                geminiDocumentName: geminiDoc?.name || null,
                geminiState: geminiDoc ? "active" : "pending",
            })
            .returning();

        // Update store document count
        await db
            .update(geminiStores)
            .set({
                documentCount: (store.documentCount || 0) + 1,
                updatedAt: new Date(),
            })
            .where(eq(geminiStores.id, storeId));

        return NextResponse.json({ storeDocument: storeDoc }, { status: 201 });
    } catch (error) {
        console.error("POST /api/gemini/stores/[storeId]/documents error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}
