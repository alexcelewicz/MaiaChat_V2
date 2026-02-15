/**
 * Ollama Provider
 *
 * Integrates with locally running Ollama instance.
 * Supports auto-discovery of installed models.
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel as LanguageModelV1 } from "ai";
import type { AIProvider, ModelConfig, ProviderConfig, ProviderId, ModelCapability } from "./types";

// ============================================================================
// Constants
// ============================================================================

const OLLAMA_API_BASE_URL = "http://127.0.0.1:11434";
const OLLAMA_OPENAI_URL = `${OLLAMA_API_BASE_URL}/v1`;
const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_TOKENS = 8192;

// ============================================================================
// Ollama API Types
// ============================================================================

interface OllamaModel {
    name: string;
    modified_at: string;
    size: number;
    digest: string;
    details?: {
        family?: string;
        parameter_size?: string;
        quantization_level?: string;
    };
}

interface OllamaTagsResponse {
    models: OllamaModel[];
}

// ============================================================================
// Model Discovery
// ============================================================================

/**
 * Discover installed Ollama models
 */
export async function discoverOllamaModels(): Promise<ModelConfig[]> {
    try {
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/tags`, {
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            console.warn(`[Ollama] Failed to discover models: ${response.status}`);
            return [];
        }

        const data = (await response.json()) as OllamaTagsResponse;
        if (!data.models || data.models.length === 0) {
            console.warn("[Ollama] No models found on local instance");
            return [];
        }

        return data.models.map((model) => {
            const modelId = model.name;
            const isReasoning =
                modelId.toLowerCase().includes("r1") ||
                modelId.toLowerCase().includes("reasoning") ||
                modelId.toLowerCase().includes("deepseek");

            const capabilities: ModelCapability[] = ["text", "streaming"];
            if (isReasoning) capabilities.push("reasoning");
            if (modelId.toLowerCase().includes("coder") || modelId.toLowerCase().includes("code")) {
                capabilities.push("code");
            }
            // Most modern models support tools
            if (!modelId.toLowerCase().includes("embed")) {
                capabilities.push("tools");
            }

            return {
                id: `ollama/${modelId}`,
                name: formatModelName(modelId),
                provider: "ollama" as ProviderId,
                contextWindow: DEFAULT_CONTEXT_WINDOW,
                maxOutputTokens: DEFAULT_MAX_TOKENS,
                capabilities,
                pricing: { input: 0, output: 0 }, // Free - running locally
                description: `Local Ollama model: ${model.details?.parameter_size || "unknown size"}`,
            };
        });
    } catch (error) {
        console.warn(`[Ollama] Failed to discover models: ${String(error)}`);
        return [];
    }
}

/**
 * Check if Ollama is running
 */
export async function isOllamaRunning(): Promise<boolean> {
    try {
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/tags`, {
            signal: AbortSignal.timeout(2000),
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Format model name for display
 */
function formatModelName(modelId: string): string {
    // Convert "llama3.3:latest" to "Llama 3.3"
    const parts = modelId.split(":");
    const baseName = parts[0];
    return baseName
        .split(/[-_]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

// ============================================================================
// Default Models (when discovery not available)
// ============================================================================

export const OLLAMA_MODELS: ModelConfig[] = [
    {
        id: "ollama/llama3.3",
        name: "Llama 3.3",
        provider: "ollama" as ProviderId,
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ["text", "tools", "json", "streaming", "code"],
        pricing: { input: 0, output: 0 },
        description: "Meta Llama 3.3 running locally via Ollama",
    },
    {
        id: "ollama/qwen2.5-coder:32b",
        name: "Qwen 2.5 Coder 32B",
        provider: "ollama" as ProviderId,
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ["text", "tools", "json", "streaming", "code"],
        pricing: { input: 0, output: 0 },
        description: "Qwen 2.5 Coder running locally via Ollama",
    },
    {
        id: "ollama/deepseek-r1:32b",
        name: "DeepSeek R1 32B",
        provider: "ollama" as ProviderId,
        contextWindow: 65536,
        maxOutputTokens: 8192,
        capabilities: ["text", "tools", "streaming", "code", "reasoning"],
        pricing: { input: 0, output: 0 },
        description: "DeepSeek R1 reasoning model running locally",
    },
    {
        id: "ollama/mistral",
        name: "Mistral",
        provider: "ollama" as ProviderId,
        contextWindow: 32000,
        maxOutputTokens: 8192,
        capabilities: ["text", "tools", "json", "streaming"],
        pricing: { input: 0, output: 0 },
        description: "Mistral running locally via Ollama",
    },
];

// ============================================================================
// Provider Configuration
// ============================================================================

export const ollamaProviderConfig: ProviderConfig = {
    id: "ollama" as ProviderId,
    name: "Ollama (Local)",
    description: "Run models locally with Ollama",
    website: "https://ollama.ai",
    models: OLLAMA_MODELS,
    defaultModel: "ollama/llama3.3",
    supportsStreaming: true,
    supportsVision: false, // Most local models don't support vision
    supportsTools: true,
    requiresApiKey: false, // Ollama doesn't need an API key
    apiKeyEnvVar: "OLLAMA_API_KEY",
    baseUrl: OLLAMA_OPENAI_URL,
};

// ============================================================================
// Provider Implementation
// ============================================================================

/**
 * Create an Ollama provider with optional custom base URL
 */
export function createOllamaProvider(baseUrl?: string): AIProvider {
    const actualBaseUrl = baseUrl || OLLAMA_OPENAI_URL;

    // Create OpenAI-compatible client pointing to Ollama
    const client = createOpenAI({
        baseURL: actualBaseUrl,
        apiKey: "ollama", // Ollama doesn't require a real key
    });

    return {
        id: "ollama" as ProviderId,
        config: ollamaProviderConfig,

        getModel(modelId: string): LanguageModelV1 {
            // Strip the "ollama/" prefix if present
            const actualModelId = modelId.startsWith("ollama/")
                ? modelId.slice(7)
                : modelId;
            // Use .chat() to explicitly target /v1/chat/completions endpoint
            // Default client() uses the Responses API (/v1/responses) which Ollama doesn't support
            return client.chat(actualModelId);
        },

        isConfigured(): boolean {
            // Ollama is "configured" if it's running
            // For sync check, we assume it's configured
            return true;
        },

        supportsModel(modelId: string): boolean {
            // Support any model with ollama/ prefix or in our list
            if (modelId.startsWith("ollama/")) return true;
            return OLLAMA_MODELS.some((m) => m.id === modelId);
        },

        getModelConfig(modelId: string): ModelConfig | undefined {
            const found = OLLAMA_MODELS.find((m) => m.id === modelId);
            if (found) return found;

            // For dynamic models, create a default config
            if (modelId.startsWith("ollama/")) {
                const name = modelId.slice(7);
                return {
                    id: modelId,
                    name: formatModelName(name),
                    provider: "ollama" as ProviderId,
                    contextWindow: DEFAULT_CONTEXT_WINDOW,
                    maxOutputTokens: DEFAULT_MAX_TOKENS,
                    capabilities: ["text", "tools", "streaming"],
                    pricing: { input: 0, output: 0 },
                    description: `Ollama model: ${name}`,
                };
            }

            return undefined;
        },
    };
}

/**
 * Default Ollama provider instance
 */
export const ollamaProvider = createOllamaProvider();
