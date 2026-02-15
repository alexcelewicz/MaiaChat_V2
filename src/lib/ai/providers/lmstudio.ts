/**
 * LM Studio Provider
 *
 * Integrates with locally running LM Studio instance.
 * Supports OpenAI-compatible API for local model inference.
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel as LanguageModelV1 } from "ai";
import type { AIProvider, ModelConfig, ProviderConfig, ProviderId, ModelCapability } from "./types";

// ============================================================================
// Constants
// ============================================================================

const LMSTUDIO_DEFAULT_URL = "http://127.0.0.1:1234/v1";
const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_TOKENS = 8192;

// ============================================================================
// LM Studio API Types
// ============================================================================

interface LMStudioModel {
    id: string;
    object: string;
    owned_by: string;
}

interface LMStudioModelsResponse {
    data: LMStudioModel[];
}

// ============================================================================
// Model Discovery
// ============================================================================

/**
 * Discover loaded models in LM Studio
 */
export async function discoverLMStudioModels(baseUrl?: string): Promise<ModelConfig[]> {
    const url = baseUrl || LMSTUDIO_DEFAULT_URL;
    try {
        const response = await fetch(`${url}/models`, {
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            console.warn(`[LM Studio] Failed to discover models: ${response.status}`);
            return [];
        }

        const data = (await response.json()) as LMStudioModelsResponse;
        if (!data.data || data.data.length === 0) {
            console.warn("[LM Studio] No models loaded");
            return [];
        }

        return data.data.map((model) => {
            const modelId = model.id;
            const isReasoning =
                modelId.toLowerCase().includes("r1") ||
                modelId.toLowerCase().includes("reasoning");

            const capabilities: ModelCapability[] = ["text", "streaming"];
            if (isReasoning) capabilities.push("reasoning");
            if (modelId.toLowerCase().includes("coder") || modelId.toLowerCase().includes("code")) {
                capabilities.push("code");
            }
            capabilities.push("tools"); // Most LM Studio models support tools

            return {
                id: `lmstudio/${modelId}`,
                name: formatModelName(modelId),
                provider: "lmstudio" as ProviderId,
                contextWindow: DEFAULT_CONTEXT_WINDOW,
                maxOutputTokens: DEFAULT_MAX_TOKENS,
                capabilities,
                pricing: { input: 0, output: 0 }, // Free - running locally
                description: `Local LM Studio model`,
            };
        });
    } catch (error) {
        console.warn(`[LM Studio] Failed to discover models: ${String(error)}`);
        return [];
    }
}

/**
 * Check if LM Studio is running
 */
export async function isLMStudioRunning(baseUrl?: string): Promise<boolean> {
    const url = baseUrl || LMSTUDIO_DEFAULT_URL;
    try {
        const response = await fetch(`${url}/models`, {
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
    // LM Studio model IDs can be long paths, extract the meaningful part
    const parts = modelId.split("/");
    const baseName = parts[parts.length - 1] || modelId;
    return baseName
        .replace(/\.gguf$/i, "")
        .split(/[-_]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

// ============================================================================
// Default Models (when discovery not available)
// ============================================================================

export const LMSTUDIO_MODELS: ModelConfig[] = [
    {
        id: "lmstudio/default",
        name: "LM Studio (Active Model)",
        provider: "lmstudio" as ProviderId,
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ["text", "tools", "json", "streaming", "code"],
        pricing: { input: 0, output: 0 },
        description: "Currently loaded model in LM Studio",
    },
];

// ============================================================================
// Provider Configuration
// ============================================================================

export const lmstudioProviderConfig: ProviderConfig = {
    id: "lmstudio" as ProviderId,
    name: "LM Studio (Local)",
    description: "Run models locally with LM Studio",
    website: "https://lmstudio.ai",
    models: LMSTUDIO_MODELS,
    defaultModel: "lmstudio/default",
    supportsStreaming: true,
    supportsVision: false, // Depends on loaded model
    supportsTools: true,
    requiresApiKey: false, // LM Studio doesn't need an API key
    apiKeyEnvVar: "LMSTUDIO_API_KEY",
    baseUrl: LMSTUDIO_DEFAULT_URL,
};

// ============================================================================
// Provider Implementation
// ============================================================================

/**
 * Create an LM Studio provider with optional custom base URL
 */
export function createLMStudioProvider(baseUrl?: string): AIProvider {
    const actualBaseUrl = baseUrl || LMSTUDIO_DEFAULT_URL;

    // Create OpenAI-compatible client pointing to LM Studio
    const client = createOpenAI({
        baseURL: actualBaseUrl,
        apiKey: "lmstudio", // LM Studio doesn't require a real key
    });

    return {
        id: "lmstudio" as ProviderId,
        config: lmstudioProviderConfig,

        getModel(modelId: string): LanguageModelV1 {
            // Strip the "lmstudio/" prefix if present
            let actualModelId = modelId.startsWith("lmstudio/")
                ? modelId.slice(9)
                : modelId;

            // LM Studio uses "default" or the actual model name
            // If "default", LM Studio will use whatever model is currently loaded
            if (actualModelId === "default") {
                actualModelId = ""; // Empty string tells LM Studio to use the active model
            }

            // Use .chat() to explicitly target /v1/chat/completions endpoint
            // Default client() uses the Responses API (/v1/responses) which LM Studio doesn't support
            return client.chat(actualModelId || "lmstudio-default");
        },

        isConfigured(): boolean {
            // LM Studio is "configured" if we can reach it
            return true;
        },

        supportsModel(modelId: string): boolean {
            // Support any model with lmstudio/ prefix or in our list
            if (modelId.startsWith("lmstudio/")) return true;
            return LMSTUDIO_MODELS.some((m) => m.id === modelId);
        },

        getModelConfig(modelId: string): ModelConfig | undefined {
            const found = LMSTUDIO_MODELS.find((m) => m.id === modelId);
            if (found) return found;

            // For dynamic models, create a default config
            if (modelId.startsWith("lmstudio/")) {
                const name = modelId.slice(9);
                return {
                    id: modelId,
                    name: formatModelName(name),
                    provider: "lmstudio" as ProviderId,
                    contextWindow: DEFAULT_CONTEXT_WINDOW,
                    maxOutputTokens: DEFAULT_MAX_TOKENS,
                    capabilities: ["text", "tools", "streaming"],
                    pricing: { input: 0, output: 0 },
                    description: `LM Studio model: ${name}`,
                };
            }

            return undefined;
        },
    };
}

/**
 * Default LM Studio provider instance
 */
export const lmstudioProvider = createLMStudioProvider();
