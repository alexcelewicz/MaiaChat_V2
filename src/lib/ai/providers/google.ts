import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import type { LanguageModel as LanguageModelV1 } from "ai";
import type { AIProvider, ModelConfig, ProviderConfig } from "./types";
import { PROVIDERS, GOOGLE_MODELS } from "../models";

class GoogleProvider implements AIProvider {
    id = "google" as const;
    config: ProviderConfig;
    private apiKey: string | undefined;

    constructor(apiKey?: string) {
        this.config = PROVIDERS.google!;
        this.apiKey = apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    }

    getModel(modelId: string): LanguageModelV1 {
        if (!this.supportsModel(modelId)) {
            throw new Error(`Model ${modelId} is not supported by Google provider`);
        }

        if (this.apiKey) {
            const provider = createGoogleGenerativeAI({ apiKey: this.apiKey });
            return provider(modelId);
        }

        return google(modelId);
    }

    isConfigured(): boolean {
        return !!this.apiKey || !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    }

    supportsModel(modelId: string): boolean {
        return GOOGLE_MODELS.some((m) => m.id === modelId) || modelId.startsWith("gemini-");
    }

    getModelConfig(modelId: string): ModelConfig | undefined {
        const found = GOOGLE_MODELS.find((m) => m.id === modelId);
        if (found) return found;

        // Dynamic fallback for unregistered Gemini models
        if (modelId.startsWith("gemini-")) {
            return {
                id: modelId,
                name: modelId,
                provider: "google",
                contextWindow: 1048576,
                maxOutputTokens: 65536,
                capabilities: ["text", "vision", "tools", "json", "streaming", "code"],
                pricing: { input: 0, output: 0 },
                description: `Dynamic Gemini model: ${modelId}`,
            };
        }

        return undefined;
    }
}

// Export singleton instance for default usage
export const googleProvider = new GoogleProvider();

// Export factory function for custom API keys
export function createGoogleProvider(apiKey?: string): AIProvider {
    return new GoogleProvider(apiKey);
}
