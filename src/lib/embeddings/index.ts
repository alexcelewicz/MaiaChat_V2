import { generateEmbedding, generateEmbeddings, cosineSimilarity } from "./openai";
export { generateEmbedding, generateEmbeddings, cosineSimilarity };

export type EmbeddingProvider = "openai" | "google";

export interface EmbeddingModelConfig {
    provider: EmbeddingProvider;
    model: string;
    dimensions: number;
}

// Default embedding configuration
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingModelConfig = {
    provider: "openai",
    model: "text-embedding-3-large",
    dimensions: 1536,
};

// Google embedding configuration
export const GOOGLE_EMBEDDING_CONFIG: EmbeddingModelConfig = {
    provider: "google",
    model: "text-embedding-004",
    dimensions: 768,
};

/**
 * Generate embedding using Google's Generative AI
 * Uses the text-embedding-004 model
 */
async function generateGoogleEmbedding(
    text: string,
    apiKey?: string
): Promise<number[]> {
    const key = apiKey || process.env.GOOGLE_AI_API_KEY;
    if (!key) {
        throw new Error("Google AI API key is required for Google embeddings");
    }

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${key}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "models/text-embedding-004",
                content: {
                    parts: [{ text }],
                },
            }),
        }
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Google embedding failed: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.embedding?.values || [];
}

/**
 * Generate embeddings for multiple texts using Google's Generative AI
 */
async function generateGoogleEmbeddings(
    texts: string[],
    apiKey?: string
): Promise<number[][]> {
    const key = apiKey || process.env.GOOGLE_AI_API_KEY;
    if (!key) {
        throw new Error("Google AI API key is required for Google embeddings");
    }

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${key}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                requests: texts.map((text) => ({
                    model: "models/text-embedding-004",
                    content: {
                        parts: [{ text }],
                    },
                })),
            }),
        }
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Google batch embedding failed: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return (data.embeddings || []).map((e: { values: number[] }) => e.values);
}

/**
 * Generate embedding using the specified provider
 */
export async function embed(
    text: string,
    provider: EmbeddingProvider = "openai",
    apiKey?: string
): Promise<number[]> {
    switch (provider) {
        case "openai": {
            const result = await generateEmbedding(text, apiKey);
            return result.embedding;
        }
        case "google": {
            return await generateGoogleEmbedding(text, apiKey);
        }
        default:
            throw new Error(`Unsupported embedding provider: ${provider}`);
    }
}

/**
 * Generate embeddings for multiple texts
 */
export async function embedBatch(
    texts: string[],
    provider: EmbeddingProvider = "openai",
    apiKey?: string
): Promise<number[][]> {
    switch (provider) {
        case "openai": {
            const result = await generateEmbeddings(texts, apiKey);
            return result.embeddings;
        }
        case "google": {
            return await generateGoogleEmbeddings(texts, apiKey);
        }
        default:
            throw new Error(`Unsupported embedding provider: ${provider}`);
    }
}
