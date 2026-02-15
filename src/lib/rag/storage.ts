import { db } from "@/lib/db";
import { embeddings, chunks, documents } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { embedBatch } from "@/lib/embeddings";
import { v4 as uuidv4 } from "uuid";

export interface StoreEmbeddingsOptions {
    batchSize?: number;
    onProgress?: (processed: number, total: number) => void;
}

/**
 * Store embeddings for document chunks
 */
export async function storeChunkEmbeddings(
    documentId: string,
    apiKey?: string,
    options: StoreEmbeddingsOptions = {}
): Promise<{ stored: number; errors: string[] }> {
    const { batchSize = 50, onProgress } = options;
    
    // Get all chunks for the document
    const documentChunks = await db.query.chunks.findMany({
        where: eq(chunks.documentId, documentId),
        orderBy: (chunks, { asc }) => [asc(chunks.index)],
    });

    if (documentChunks.length === 0) {
        return { stored: 0, errors: [] };
    }

    const errors: string[] = [];
    let stored = 0;

    // Process in batches
    for (let i = 0; i < documentChunks.length; i += batchSize) {
        const batch = documentChunks.slice(i, i + batchSize);
        const texts = batch.map(chunk => chunk.content);

        try {
            // Generate embeddings for batch
            const embeddingVectors = await embedBatch(texts, "openai", apiKey);

            // Store embeddings
            const embeddingRecords = batch.map((chunk, j) => ({
                id: uuidv4(),
                chunkId: chunk.id,
                embedding: embeddingVectors[j],
            }));

            // Delete existing embeddings for these chunks
            for (const chunk of batch) {
                await db.delete(embeddings).where(eq(embeddings.chunkId, chunk.id));
            }

            // Insert new embeddings
            await db.insert(embeddings).values(embeddingRecords);

            stored += batch.length;
            onProgress?.(stored, documentChunks.length);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            errors.push(`Batch ${Math.floor(i / batchSize)}: ${errorMsg}`);
        }
    }

    return { stored, errors };
}

/**
 * Delete embeddings for a document
 */
export async function deleteDocumentEmbeddings(documentId: string): Promise<void> {
    // Get all chunks for the document
    const documentChunks = await db.query.chunks.findMany({
        where: eq(chunks.documentId, documentId),
        columns: { id: true },
    });

    // Delete embeddings for each chunk
    for (const chunk of documentChunks) {
        await db.delete(embeddings).where(eq(embeddings.chunkId, chunk.id));
    }
}

/**
 * Get embedding statistics for a document
 */
export async function getDocumentEmbeddingStats(documentId: string): Promise<{
    totalChunks: number;
    embeddedChunks: number;
    percentage: number;
}> {
    const documentChunks = await db.query.chunks.findMany({
        where: eq(chunks.documentId, documentId),
        columns: { id: true },
    });

    const embeddedCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(embeddings)
        .innerJoin(chunks, eq(embeddings.chunkId, chunks.id))
        .where(eq(chunks.documentId, documentId));

    const totalChunks = documentChunks.length;
    const embeddedChunks = Number(embeddedCount[0]?.count || 0);

    return {
        totalChunks,
        embeddedChunks,
        percentage: totalChunks > 0 ? Math.round((embeddedChunks / totalChunks) * 100) : 0,
    };
}
