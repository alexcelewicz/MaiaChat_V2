import { env } from "@/lib/env";

const OPENAI_EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 1536; // OpenAI default, can be reduced to 256/512/1024

export interface EmbeddingResult {
    embedding: number[];
    model: string;
    usage: {
        promptTokens: number;
        totalTokens: number;
    };
}

export interface BatchEmbeddingResult {
    embeddings: number[][];
    model: string;
    usage: {
        promptTokens: number;
        totalTokens: number;
    };
}

/**
 * Generate embedding for a single text using OpenAI
 */
export async function generateEmbedding(
    text: string,
    apiKey?: string
): Promise<EmbeddingResult> {
    const key = apiKey || env.OPENAI_API_KEY;
    
    if (!key) {
        throw new Error("OpenAI API key not configured");
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
            model: OPENAI_EMBEDDING_MODEL,
            input: text,
            dimensions: EMBEDDING_DIMENSIONS,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`OpenAI embedding error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    return {
        embedding: data.data[0].embedding,
        model: OPENAI_EMBEDDING_MODEL,
        usage: {
            promptTokens: data.usage.prompt_tokens,
            totalTokens: data.usage.total_tokens,
        },
    };
}

/**
 * Generate embeddings for multiple texts using OpenAI (batched)
 */
export async function generateEmbeddings(
    texts: string[],
    apiKey?: string
): Promise<BatchEmbeddingResult> {
    const key = apiKey || env.OPENAI_API_KEY;
    
    if (!key) {
        throw new Error("OpenAI API key not configured");
    }

    if (texts.length === 0) {
        return {
            embeddings: [],
            model: OPENAI_EMBEDDING_MODEL,
            usage: { promptTokens: 0, totalTokens: 0 },
        };
    }

    // OpenAI has a limit on batch size, process in chunks
    const batchSize = 100;
    const allEmbeddings: number[][] = [];
    let totalPromptTokens = 0;
    let totalTokens = 0;

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);

        const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
                model: OPENAI_EMBEDDING_MODEL,
                input: batch,
                dimensions: EMBEDDING_DIMENSIONS,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(`OpenAI embedding error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();

        // Sort by index to ensure correct order
        const sortedEmbeddings = data.data
            .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
            .map((item: { embedding: number[] }) => item.embedding);

        allEmbeddings.push(...sortedEmbeddings);
        totalPromptTokens += data.usage.prompt_tokens;
        totalTokens += data.usage.total_tokens;
    }

    return {
        embeddings: allEmbeddings,
        model: OPENAI_EMBEDDING_MODEL,
        usage: {
            promptTokens: totalPromptTokens,
            totalTokens: totalTokens,
        },
    };
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error("Embeddings must have the same dimensions");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
