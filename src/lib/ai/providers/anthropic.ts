import { createAnthropic, anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel as LanguageModelV1 } from "ai";
import type { AIProvider, ModelConfig, ProviderConfig } from "./types";
import { PROVIDERS, ANTHROPIC_MODELS } from "../models";

class AnthropicProvider implements AIProvider {
    id = "anthropic" as const;
    config: ProviderConfig;
    private apiKey: string | undefined;

    constructor(apiKey?: string) {
        this.config = PROVIDERS.anthropic!;
        this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    }

    getModel(modelId: string): LanguageModelV1 {
        if (!this.supportsModel(modelId)) {
            throw new Error(`Model ${modelId} is not supported by Anthropic provider`);
        }

        if (this.apiKey) {
            const provider = createAnthropic({ apiKey: this.apiKey });
            return provider(modelId);
        }

        return anthropic(modelId);
    }

    isConfigured(): boolean {
        return !!this.apiKey || !!process.env.ANTHROPIC_API_KEY;
    }

    supportsModel(modelId: string): boolean {
        return ANTHROPIC_MODELS.some((m) => m.id === modelId);
    }

    getModelConfig(modelId: string): ModelConfig | undefined {
        return ANTHROPIC_MODELS.find((m) => m.id === modelId);
    }
}

// Export singleton instance for default usage
export const anthropicProvider = new AnthropicProvider();

// Export factory function for custom API keys
export function createAnthropicProvider(apiKey?: string): AIProvider {
    return new AnthropicProvider(apiKey);
}
