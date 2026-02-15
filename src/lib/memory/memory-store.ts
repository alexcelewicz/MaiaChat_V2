/**
 * Memory Store Service
 *
 * Manages persistent conversation memory using existing Gemini File Search stores.
 * No new DB tables - reuses the existing `geminiStores` infrastructure.
 *
 * Memory stores are identified by display name prefix "MaiaChat Memory".
 */

import { db } from "@/lib/db";
import { geminiStores } from "@/lib/db/schema";
import { eq, and, like } from "drizzle-orm";
import {
    createGeminiStore,
    uploadDocumentToStore,
    listStoreDocuments,
    deleteStoreDocument,
    searchWithStores,
    getGeminiStore,
    deleteGeminiStore,
    type StoreDocument,
} from "@/lib/ai/gemini-stores";

const MEMORY_STORE_PREFIX = "MaiaChat Memory";

/**
 * Get or create the user's memory store
 */
export async function getOrCreateMemoryStore(
    userId: string,
    googleApiKey: string
): Promise<{ id: string; geminiStoreName: string }> {
    // Check if user already has a memory store in DB
    const existing = await db.query.geminiStores.findFirst({
        where: and(
            eq(geminiStores.userId, userId),
            like(geminiStores.displayName, `${MEMORY_STORE_PREFIX}%`)
        ),
    });

    if (existing) {
        return { id: existing.id, geminiStoreName: existing.geminiStoreName };
    }

    // Create new Gemini store
    const displayName = `${MEMORY_STORE_PREFIX} - ${userId.slice(0, 8)}`;
    const store = await createGeminiStore(displayName, googleApiKey);

    // Save to DB
    const [dbStore] = await db
        .insert(geminiStores)
        .values({
            userId,
            geminiStoreName: store.name,
            displayName,
            description: "Persistent conversation memory for MaiaChat",
            color: "#8B5CF6", // Purple for memory
            status: "active",
        })
        .returning();

    return { id: dbStore.id, geminiStoreName: dbStore.geminiStoreName };
}

/**
 * Save conversation memory to the store
 */
export async function saveConversationMemory(
    userId: string,
    googleApiKey: string,
    conversationId: string,
    markdown: string,
    title: string
): Promise<StoreDocument | null> {
    const store = await getOrCreateMemoryStore(userId, googleApiKey);

    const fileName = `memory_${conversationId}_${Date.now()}.md`;
    const fileBuffer = Buffer.from(markdown, "utf-8");

    const doc = await uploadDocumentToStore(
        store.geminiStoreName,
        fileBuffer,
        fileName,
        "text/markdown",
        googleApiKey
    );

    // Update document count in DB
    await db
        .update(geminiStores)
        .set({
            documentCount: await getMemoryCount(userId, googleApiKey),
            updatedAt: new Date(),
        })
        .where(eq(geminiStores.id, store.id));

    return doc;
}

/**
 * Retrieve relevant memories using Gemini File Search
 */
export async function retrieveMemories(
    userId: string,
    googleApiKey: string,
    query: string
): Promise<string> {
    console.log(`[Memory Store] retrieveMemories called for user ${userId.slice(0, 8)}...`);

    const store = await db.query.geminiStores.findFirst({
        where: and(
            eq(geminiStores.userId, userId),
            like(geminiStores.displayName, `${MEMORY_STORE_PREFIX}%`)
        ),
    });

    if (!store) {
        console.log("[Memory Store] No memory store found for user");
        return "";
    }

    console.log(`[Memory Store] Found store: ${store.geminiStoreName}, docs: ${store.documentCount || 0}`);

    try {
        // Enhanced query for better memory retrieval
        const enhancedQuery = `You are retrieving memories from past conversations. Search for any relevant information about the following query and return the most useful context found.

Query: ${query}

Instructions:
- Look for any conversations, facts, or discussions related to the query
- Include relevant context about dates, people, places, or topics mentioned
- If you find relevant memories, summarize them clearly
- If nothing relevant is found, respond with "No relevant memories found."`;

        const result = await searchWithStores(
            enhancedQuery,
            [store.geminiStoreName],
            googleApiKey
        );

        console.log(`[Memory Store] Retrieved ${result.length} chars of memory context`);
        return result;
    } catch (error) {
        console.error("[Memory Store] retrieveMemories error:", error);
        return "";
    }
}

/**
 * List all memory documents
 */
export async function listMemories(
    userId: string,
    googleApiKey: string
): Promise<StoreDocument[]> {
    const store = await db.query.geminiStores.findFirst({
        where: and(
            eq(geminiStores.userId, userId),
            like(geminiStores.displayName, `${MEMORY_STORE_PREFIX}%`)
        ),
    });

    if (!store) return [];

    try {
        const result = await listStoreDocuments(store.geminiStoreName, googleApiKey);
        return result.documents || [];
    } catch (error) {
        console.error("[Memory Store] listMemories error:", error);
        return [];
    }
}

/**
 * Delete a specific memory document
 */
export async function deleteMemory(
    userId: string,
    googleApiKey: string,
    documentName: string
): Promise<void> {
    // Verify the memory store belongs to this user
    const store = await db.query.geminiStores.findFirst({
        where: and(
            eq(geminiStores.userId, userId),
            like(geminiStores.displayName, `${MEMORY_STORE_PREFIX}%`)
        ),
    });

    if (!store) throw new Error("Memory store not found");

    // Verify the document belongs to this store
    if (!documentName.startsWith(store.geminiStoreName.replace("fileSearchStores/", ""))) {
        // Double-check by trying to list and find
        const docs = await listStoreDocuments(store.geminiStoreName, googleApiKey);
        const found = docs.documents?.find((d) => d.name === documentName);
        if (!found) throw new Error("Memory document not found in your store");
    }

    await deleteStoreDocument(documentName, googleApiKey);

    // Update count
    await db
        .update(geminiStores)
        .set({
            documentCount: Math.max(0, (store.documentCount || 0) - 1),
            updatedAt: new Date(),
        })
        .where(eq(geminiStores.id, store.id));
}

/**
 * Clear all memories (delete and recreate store)
 */
export async function clearAllMemories(
    userId: string,
    googleApiKey: string
): Promise<void> {
    const store = await db.query.geminiStores.findFirst({
        where: and(
            eq(geminiStores.userId, userId),
            like(geminiStores.displayName, `${MEMORY_STORE_PREFIX}%`)
        ),
    });

    if (!store) return;

    try {
        // Force-delete the Gemini store (includes all documents)
        await deleteGeminiStore(store.geminiStoreName, googleApiKey);
    } catch (error) {
        console.error("[Memory Store] Failed to delete Gemini store:", error);
    }

    // Remove from DB
    await db.delete(geminiStores).where(eq(geminiStores.id, store.id));
}

/**
 * Get memory store info
 */
export async function getMemoryStoreInfo(
    userId: string,
    googleApiKey: string
): Promise<{
    exists: boolean;
    documentCount: number;
    storeId?: string;
} | null> {
    const store = await db.query.geminiStores.findFirst({
        where: and(
            eq(geminiStores.userId, userId),
            like(geminiStores.displayName, `${MEMORY_STORE_PREFIX}%`)
        ),
    });

    if (!store) return { exists: false, documentCount: 0 };

    try {
        const geminiStore = await getGeminiStore(store.geminiStoreName, googleApiKey);
        const activeCount = parseInt(geminiStore.activeDocumentsCount || "0", 10);

        return {
            exists: true,
            documentCount: activeCount,
            storeId: store.id,
        };
    } catch {
        return {
            exists: true,
            documentCount: store.documentCount || 0,
            storeId: store.id,
        };
    }
}

async function getMemoryCount(
    userId: string,
    googleApiKey: string
): Promise<number> {
    try {
        const store = await db.query.geminiStores.findFirst({
            where: and(
                eq(geminiStores.userId, userId),
                like(geminiStores.displayName, `${MEMORY_STORE_PREFIX}%`)
            ),
        });

        if (!store) return 0;

        const geminiStore = await getGeminiStore(store.geminiStoreName, googleApiKey);
        return parseInt(geminiStore.activeDocumentsCount || "0", 10);
    } catch {
        return 0;
    }
}
