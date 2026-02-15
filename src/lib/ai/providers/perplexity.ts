/**
 * Perplexity AI Provider
 *
 * Provides access to Perplexity's Sonar models for web search and deep research.
 * Uses OpenAI-compatible API (base URL: https://api.perplexity.ai).
 *
 * Models:
 * - sonar: Fast web search with citations
 * - sonar-pro: Advanced web search with deeper analysis
 * - sonar-deep-research: Multi-step deep research agent
 * - sonar-reasoning-pro: Search with chain-of-thought reasoning
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel as LanguageModelV1 } from "ai";
import type { AIProvider, ModelConfig, ProviderConfig } from "./types";
import { PROVIDERS, PERPLEXITY_MODELS } from "../models";

const PERPLEXITY_BASE_URL = "https://api.perplexity.ai";

class PerplexityProvider implements AIProvider {
    id = "perplexity" as const;
    config: ProviderConfig;
    private apiKey: string | undefined;

    constructor(apiKey?: string) {
        this.config = PROVIDERS.perplexity!;
        this.apiKey = apiKey || process.env.PERPLEXITY_API_KEY;
    }

    getModel(modelId: string): LanguageModelV1 {
        if (!this.supportsModel(modelId)) {
            throw new Error(`Model ${modelId} is not supported by Perplexity provider`);
        }

        const key = this.apiKey;
        if (!key) {
            throw new Error("Perplexity API key is required. Set PERPLEXITY_API_KEY or add it in Settings.");
        }

        const provider = createOpenAI({
            apiKey: key,
            baseURL: PERPLEXITY_BASE_URL,
        });

        return provider(modelId);
    }

    isConfigured(): boolean {
        return !!this.apiKey || !!process.env.PERPLEXITY_API_KEY;
    }

    supportsModel(modelId: string): boolean {
        return PERPLEXITY_MODELS.some((m) => m.id === modelId);
    }

    getModelConfig(modelId: string): ModelConfig | undefined {
        return PERPLEXITY_MODELS.find((m) => m.id === modelId);
    }
}

// Export singleton instance for default usage
export const perplexityProvider = new PerplexityProvider();

// Export factory function for custom API keys
export function createPerplexityProvider(apiKey?: string): AIProvider {
    return new PerplexityProvider(apiKey);
}
