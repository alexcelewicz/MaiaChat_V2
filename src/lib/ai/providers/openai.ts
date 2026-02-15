import { createOpenAI, openai } from "@ai-sdk/openai";
import type { LanguageModel as LanguageModelV1 } from "ai";
import type { AIProvider, ModelConfig, ProviderConfig } from "./types";
import { PROVIDERS, OPENAI_MODELS } from "../models";

class OpenAIProvider implements AIProvider {
    id = "openai" as const;
    config: ProviderConfig;
    private apiKey: string | undefined;

    constructor(apiKey?: string) {
        this.config = PROVIDERS.openai!;
        this.apiKey = apiKey || process.env.OPENAI_API_KEY;
    }

    getModel(modelId: string): LanguageModelV1 {
        if (!this.supportsModel(modelId)) {
            throw new Error(`Model ${modelId} is not supported by OpenAI provider`);
        }

        if (this.apiKey) {
            const provider = createOpenAI({ apiKey: this.apiKey });
            return provider(modelId);
        }

        return openai(modelId);
    }

    isConfigured(): boolean {
        return !!this.apiKey || !!process.env.OPENAI_API_KEY;
    }

    supportsModel(modelId: string): boolean {
        return OPENAI_MODELS.some((m) => m.id === modelId);
    }

    getModelConfig(modelId: string): ModelConfig | undefined {
        return OPENAI_MODELS.find((m) => m.id === modelId);
    }
}

// Export singleton instance for default usage
export const openaiProvider = new OpenAIProvider();

// Export factory function for custom API keys
export function createOpenAIProvider(apiKey?: string): AIProvider {
    return new OpenAIProvider(apiKey);
}

// Legacy export for backwards compatibility
export const getOpenAIModel = (modelId: string = "gpt-4o") => {
    return openaiProvider.getModel(modelId);
};
