import { createXai, xai } from "@ai-sdk/xai";
import type { LanguageModel as LanguageModelV1 } from "ai";
import type { AIProvider, ModelConfig, ProviderConfig } from "./types";
import { PROVIDERS, XAI_MODELS } from "../models";

class XAIProvider implements AIProvider {
    id = "xai" as const;
    config: ProviderConfig;
    private apiKey: string | undefined;

    constructor(apiKey?: string) {
        this.config = PROVIDERS.xai!;
        this.apiKey = apiKey || process.env.XAI_API_KEY;
    }

    getModel(modelId: string): LanguageModelV1 {
        if (!this.supportsModel(modelId)) {
            throw new Error(`Model ${modelId} is not supported by xAI provider`);
        }

        if (this.apiKey) {
            const provider = createXai({ apiKey: this.apiKey });
            return provider(modelId);
        }

        return xai(modelId);
    }

    isConfigured(): boolean {
        return !!this.apiKey || !!process.env.XAI_API_KEY;
    }

    supportsModel(modelId: string): boolean {
        return XAI_MODELS.some((m) => m.id === modelId);
    }

    getModelConfig(modelId: string): ModelConfig | undefined {
        return XAI_MODELS.find((m) => m.id === modelId);
    }
}

// Export singleton instance for default usage
export const xaiProvider = new XAIProvider();

// Export factory function for custom API keys
export function createXAIProvider(apiKey?: string): AIProvider {
    return new XAIProvider(apiKey);
}
