import type { LanguageModel as LanguageModelV1 } from "ai";
import type { AIProvider, ProviderId, ModelConfig } from "./types";
import { openaiProvider, createOpenAIProvider } from "./openai";
import { anthropicProvider, createAnthropicProvider } from "./anthropic";
import { googleProvider, createGoogleProvider } from "./google";
import { xaiProvider, createXAIProvider } from "./xai";
import { openrouterProvider, createOpenRouterProvider } from "./openrouter";
import { ollamaProvider, createOllamaProvider } from "./ollama";
import { lmstudioProvider, createLMStudioProvider } from "./lmstudio";
import { perplexityProvider, createPerplexityProvider } from "./perplexity";
import { PROVIDERS, getModelById } from "../models";

// ============================================================================
// Provider Registry
// ============================================================================

// Deepgram is audio-only (no LLM) - placeholder uses OpenAI as fallback
const defaultProviders: Record<ProviderId, AIProvider> = {
    openai: openaiProvider,
    anthropic: anthropicProvider,
    google: googleProvider,
    xai: xaiProvider,
    openrouter: openrouterProvider,
    perplexity: perplexityProvider,
    ollama: ollamaProvider,
    lmstudio: lmstudioProvider,
    deepgram: openaiProvider, // Deepgram is audio-only, not used for LLM
};

const providerFactories: Record<ProviderId, (apiKey?: string) => AIProvider> = {
    openai: createOpenAIProvider,
    anthropic: createAnthropicProvider,
    google: createGoogleProvider,
    xai: createXAIProvider,
    openrouter: createOpenRouterProvider,
    perplexity: createPerplexityProvider,
    ollama: createOllamaProvider,
    lmstudio: createLMStudioProvider,
    deepgram: createOpenAIProvider, // Deepgram is audio-only, not used for LLM
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Get a provider by ID using environment variables
 */
export function getProvider(providerId: ProviderId): AIProvider {
    const provider = defaultProviders[providerId];
    if (!provider) {
        throw new Error(`Unknown provider: ${providerId}`);
    }
    return provider;
}

/**
 * Create a provider with a custom API key
 */
export function createProvider(providerId: ProviderId, apiKey?: string): AIProvider {
    const factory = providerFactories[providerId];
    if (!factory) {
        throw new Error(`Unknown provider: ${providerId}`);
    }
    return factory(apiKey);
}

/**
 * Get a model from any provider
 * Automatically determines the provider from the model ID
 */
export function getModel(modelId: string): LanguageModelV1 {
    const modelConfig = getModelById(modelId);
    if (!modelConfig) {
        throw new Error(`Unknown model: ${modelId}`);
    }

    const provider = getProvider(modelConfig.provider);
    return provider.getModel(modelId);
}

/**
 * Get a model with a custom API key
 */
export function getModelWithKey(
    modelId: string,
    apiKeys: Partial<Record<ProviderId, string>>
): LanguageModelV1 {
    const modelConfig = getModelConfig(modelId);
    if (!modelConfig) {
        throw new Error(`Unknown model: ${modelId}`);
    }

    const apiKey = apiKeys[modelConfig.provider];
    const provider = createProvider(modelConfig.provider, apiKey);
    return provider.getModel(modelId);
}

/**
 * Get model configuration
 * Supports hardcoded models, dynamic OpenRouter models, and local models
 */
export function getModelConfig(modelId: string): ModelConfig | undefined {
    // First check hardcoded models
    const hardcodedConfig = getModelById(modelId);
    if (hardcodedConfig) {
        return hardcodedConfig;
    }

    // Check for local models (ollama/ or lmstudio/ prefix)
    if (modelId.startsWith("ollama/")) {
        const ollamaProviderInstance = createOllamaProvider();
        return ollamaProviderInstance.getModelConfig(modelId);
    }

    if (modelId.startsWith("lmstudio/")) {
        const lmstudioProviderInstance = createLMStudioProvider();
        return lmstudioProviderInstance.getModelConfig(modelId);
    }

    // Check for dynamic Google/Gemini models (e.g., gemini-3-flash-preview)
    if (modelId.startsWith("gemini-")) {
        return createGoogleProvider().getModelConfig(modelId);
    }

    // Check for dynamic OpenRouter models (format: provider/model)
    if (modelId.includes("/")) {
        // Use the OpenRouter provider's getModelConfig for dynamic models
        const orProvider = createOpenRouterProvider() as { getModelConfig?: (id: string) => ModelConfig | undefined };
        if (orProvider.getModelConfig) {
            return orProvider.getModelConfig(modelId);
        }
    }

    return undefined;
}

/**
 * Check if a provider is configured (has API key)
 */
export function isProviderConfigured(providerId: ProviderId): boolean {
    const provider = getProvider(providerId);
    return provider.isConfigured();
}

/**
 * Get all configured providers
 */
export function getConfiguredProviders(): ProviderId[] {
    return (Object.keys(defaultProviders) as ProviderId[]).filter(
        (id) => isProviderConfigured(id)
    );
}

/**
 * Get all available providers (whether configured or not)
 */
export function getAllProviders(): typeof PROVIDERS {
    return PROVIDERS;
}

// ============================================================================
// Type exports
// ============================================================================

export type { AIProvider, ProviderId, ModelConfig } from "./types";
export { PROVIDERS } from "../models";
