import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import { db } from "@/lib/db";
import { geminiStores, geminiStoreDocuments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { deleteStoreDocument } from "@/lib/ai/gemini-stores";

type RouteContext = { params: Promise<{ storeId: string; docId: string }> };

/**
 * DELETE /api/gemini/stores/[storeId]/documents/[docId] — Remove document from store
 *
 * Handles two cases:
 *  1. docId is a local document UUID → find junction record, delete from Gemini + DB
 *  2. docId is a Gemini resource name (URL-encoded) → delete directly from Gemini API
 */
export async function DELETE(req: Request, context: RouteContext) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { storeId, docId } = await context.params;

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

        const apiKeys = await getUserApiKeys(userId);
        const googleKey = apiKeys.google;

        // Check if docId looks like a Gemini resource name (contains "/")
        const isGeminiResourceName = docId.includes("/");

        if (isGeminiResourceName) {
            // Case 2: Gemini-only document — delete directly from Gemini API
            if (googleKey) {
                await deleteStoreDocument(docId, googleKey);
            }

            // Also clean up any matching local junction record if one exists
            const localDoc = await db.query.geminiStoreDocuments.findFirst({
                where: and(
                    eq(geminiStoreDocuments.storeId, storeId),
                    eq(geminiStoreDocuments.geminiDocumentName, docId)
                ),
            });
            if (localDoc) {
                await db.delete(geminiStoreDocuments).where(eq(geminiStoreDocuments.id, localDoc.id));
            }
        } else {
            // Case 1: Local document ID — find junction record
            const storeDoc = await db.query.geminiStoreDocuments.findFirst({
                where: and(
                    eq(geminiStoreDocuments.storeId, storeId),
                    eq(geminiStoreDocuments.documentId, docId)
                ),
            });

            if (!storeDoc) {
                return NextResponse.json({ error: "Document not in store" }, { status: 404 });
            }

            // Delete from Gemini API if we have the resource name
            if (storeDoc.geminiDocumentName && googleKey) {
                try {
                    await deleteStoreDocument(storeDoc.geminiDocumentName, googleKey);
                } catch (err) {
                    console.error("Gemini doc delete failed (continuing DB cleanup):", err);
                }
            }

            // Delete junction record
            await db.delete(geminiStoreDocuments).where(eq(geminiStoreDocuments.id, storeDoc.id));
        }

        // Update store document count
        await db
            .update(geminiStores)
            .set({
                documentCount: Math.max((store.documentCount || 1) - 1, 0),
                updatedAt: new Date(),
            })
            .where(eq(geminiStores.id, storeId));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("DELETE /api/gemini/stores/[storeId]/documents/[docId] error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
