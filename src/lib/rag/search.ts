import { db } from "@/lib/db";
import { embeddings, chunks, documents } from "@/lib/db/schema";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";
import { embed } from "@/lib/embeddings";

export interface SearchOptions {
    topK?: number;
    threshold?: number;
    documentIds?: string[];
    userId?: string;
}

export interface SearchResult {
    chunkId: string;
    documentId: string;
    content: string;
    score: number;
    metadata: Record<string, unknown>;
    documentFilename?: string;
}

/**
 * Semantic search using vector similarity
 */
export async function semanticSearch(
    query: string,
    options: SearchOptions = {},
    apiKey?: string
): Promise<SearchResult[]> {
    const {
        topK = 5,
        threshold = 0.7,
        documentIds,
        userId,
    } = options;

    // Generate embedding for query
    const queryEmbedding = await embed(query, "openai", apiKey);

    // Build the query with filters
    let sqlQuery = sql`
        SELECT 
            e.id as embedding_id,
            c.id as chunk_id,
            c.document_id,
            c.content,
            c.metadata,
            d.filename as document_filename,
            1 - (e.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as score
        FROM embeddings e
        INNER JOIN chunks c ON e.chunk_id = c.id
        INNER JOIN documents d ON c.document_id = d.id
        WHERE d.deleted_at IS NULL
    `;

    // Add user filter
    if (userId) {
        sqlQuery = sql`${sqlQuery} AND d.user_id = ${userId}`;
    }

    // Add document filter
    if (documentIds && documentIds.length > 0) {
        sqlQuery = sql`${sqlQuery} AND c.document_id = ANY(${documentIds})`;
    }

    // Add threshold filter and ordering
    sqlQuery = sql`
        ${sqlQuery}
        AND 1 - (e.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) >= ${threshold}
        ORDER BY score DESC
        LIMIT ${topK}
    `;

    const results = await db.execute(sqlQuery);

    return (results.rows as Array<{
        chunk_id: string;
        document_id: string;
        content: string;
        score: number;
        metadata: Record<string, unknown>;
        document_filename: string;
    }>).map(row => ({
        chunkId: row.chunk_id,
        documentId: row.document_id,
        content: row.content,
        score: row.score,
        metadata: row.metadata || {},
        documentFilename: row.document_filename,
    }));
}

/**
 * Full-text search using PostgreSQL tsvector
 */
export async function textSearch(
    query: string,
    options: SearchOptions = {}
): Promise<SearchResult[]> {
    const {
        topK = 5,
        documentIds,
        userId,
    } = options;

    // Build the query
    let sqlQuery = sql`
        SELECT 
            c.id as chunk_id,
            c.document_id,
            c.content,
            c.metadata,
            d.filename as document_filename,
            ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', ${query})) as score
        FROM chunks c
        INNER JOIN documents d ON c.document_id = d.id
        WHERE d.deleted_at IS NULL
            AND to_tsvector('english', c.content) @@ plainto_tsquery('english', ${query})
    `;

    // Add user filter
    if (userId) {
        sqlQuery = sql`${sqlQuery} AND d.user_id = ${userId}`;
    }

    // Add document filter
    if (documentIds && documentIds.length > 0) {
        sqlQuery = sql`${sqlQuery} AND c.document_id = ANY(${documentIds})`;
    }

    // Add ordering and limit
    sqlQuery = sql`
        ${sqlQuery}
        ORDER BY score DESC
        LIMIT ${topK}
    `;

    const results = await db.execute(sqlQuery);

    return (results.rows as Array<{
        chunk_id: string;
        document_id: string;
        content: string;
        score: number;
        metadata: Record<string, unknown>;
        document_filename: string;
    }>).map(row => ({
        chunkId: row.chunk_id,
        documentId: row.document_id,
        content: row.content,
        score: row.score,
        metadata: row.metadata || {},
        documentFilename: row.document_filename,
    }));
}

/**
 * Hybrid search combining semantic and text search with RRF
 */
export async function hybridSearch(
    query: string,
    options: SearchOptions = {},
    apiKey?: string
): Promise<SearchResult[]> {
    const {
        topK = 5,
        threshold = 0.7,
    } = options;

    // Get results from both search methods
    const [semanticResults, textResults] = await Promise.all([
        semanticSearch(query, { ...options, topK: topK * 2 }, apiKey),
        textSearch(query, { ...options, topK: topK * 2 }),
    ]);

    // Reciprocal Rank Fusion (RRF)
    const k = 60; // RRF constant
    const scores = new Map<string, { result: SearchResult; score: number }>();

    // Process semantic results
    semanticResults.forEach((result, rank) => {
        const rrf = 1 / (k + rank + 1);
        scores.set(result.chunkId, { result, score: rrf });
    });

    // Process text results and combine scores
    textResults.forEach((result, rank) => {
        const rrf = 1 / (k + rank + 1);
        const existing = scores.get(result.chunkId);
        
        if (existing) {
            existing.score += rrf;
        } else {
            scores.set(result.chunkId, { result, score: rrf });
        }
    });

    // Sort by combined score and return top K
    const sorted = Array.from(scores.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

    return sorted.map(({ result, score }) => ({
        ...result,
        score,
    }));
}

/**
 * Get RAG context for a query
 */
export async function getRAGContext(
    query: string,
    options: SearchOptions = {},
    apiKey?: string
): Promise<{
    context: string;
    sources: SearchResult[];
}> {
    const results = await hybridSearch(query, options, apiKey);

    if (results.length === 0) {
        return { context: "", sources: [] };
    }

    // Format context for LLM
    const contextParts = results.map((result, index) => {
        const source = result.documentFilename || `Document ${result.documentId}`;
        return `[Source ${index + 1}: ${source}]\n${result.content}`;
    });

    const context = contextParts.join("\n\n---\n\n");

    return {
        context,
        sources: results,
    };
}
