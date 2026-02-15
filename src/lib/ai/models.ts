import type { ModelConfig, ProviderConfig } from "./providers/types";

// ============================================================================
// OpenAI Models
// ============================================================================

export const OPENAI_MODELS: ModelConfig[] = [
    {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code"],
        pricing: { input: 2.50, output: 10.00 },
        description: "Most capable GPT-4 model with vision",
    },
    {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: "openai",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code"],
        pricing: { input: 0.15, output: 0.60 },
        description: "Affordable and fast GPT-4 model",
    },
    {
        id: "gpt-4-turbo",
        name: "GPT-4 Turbo",
        provider: "openai",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code"],
        pricing: { input: 10.00, output: 30.00 },
        description: "Previous generation GPT-4 with vision",
    },
    {
        id: "o1",
        name: "o1",
        provider: "openai",
        contextWindow: 200000,
        maxOutputTokens: 100000,
        capabilities: ["text", "reasoning", "code"],
        pricing: { input: 15.00, output: 60.00 },
        description: "Advanced reasoning model",
        beta: true,
    },
    {
        id: "o1-mini",
        name: "o1 Mini",
        provider: "openai",
        contextWindow: 128000,
        maxOutputTokens: 65536,
        capabilities: ["text", "reasoning", "code"],
        pricing: { input: 3.00, output: 12.00 },
        description: "Faster reasoning model",
        beta: true,
    },
    {
        id: "o3-mini",
        name: "o3 Mini",
        provider: "openai",
        contextWindow: 200000,
        maxOutputTokens: 100000,
        capabilities: ["text", "reasoning", "tools", "code"],
        pricing: { input: 1.10, output: 4.40 },
        description: "Latest efficient reasoning model",
        beta: true,
    },
];

// ============================================================================
// Anthropic Models
// ============================================================================

export const ANTHROPIC_MODELS: ModelConfig[] = [
    {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        provider: "anthropic",
        contextWindow: 200000,
        maxOutputTokens: 64000,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code", "reasoning", "extended_thinking"],
        pricing: { input: 3.00, output: 15.00 },
        description: "Latest Sonnet with excellent balance of speed and capability",
    },
    {
        id: "claude-opus-4-20250514",
        name: "Claude Opus 4",
        provider: "anthropic",
        contextWindow: 200000,
        maxOutputTokens: 32000,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code", "reasoning", "extended_thinking"],
        pricing: { input: 15.00, output: 75.00 },
        description: "Most capable Claude model with extended thinking",
    },
    {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        provider: "anthropic",
        contextWindow: 200000,
        maxOutputTokens: 8192,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code"],
        pricing: { input: 3.00, output: 15.00 },
        description: "Previous Sonnet model",
    },
    {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        provider: "anthropic",
        contextWindow: 200000,
        maxOutputTokens: 8192,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code"],
        pricing: { input: 0.80, output: 4.00 },
        description: "Fast and affordable Claude model",
    },
];

// ============================================================================
// Google Models
// ============================================================================

export const GOOGLE_MODELS: ModelConfig[] = [
    {
        id: "gemini-2.5-pro-preview-06-05",
        name: "Gemini 2.5 Pro",
        provider: "google",
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code", "reasoning"],
        pricing: { input: 1.25, output: 10.00 },
        description: "Most capable Gemini with 1M context",
        beta: true,
    },
    {
        id: "gemini-2.5-flash-preview-05-20",
        name: "Gemini 2.5 Flash",
        provider: "google",
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code", "reasoning"],
        pricing: { input: 0.15, output: 0.60 },
        description: "Fast Gemini with 1M context",
        beta: true,
    },
    {
        id: "gemini-2.5-flash-preview-image-generation",
        name: "Gemini 2.5 Flash (Image Gen)",
        provider: "google",
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code", "image_generation"],
        pricing: { input: 0.15, output: 0.60 },
        description: "Gemini 2.5 Flash with native image generation",
    },
    {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        provider: "google",
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code"],
        pricing: { input: 0.10, output: 0.40 },
        description: "Balanced speed and capability",
    },
    {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        provider: "google",
        contextWindow: 2097152,
        maxOutputTokens: 8192,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code"],
        pricing: { input: 1.25, output: 5.00 },
        description: "Previous generation with 2M context",
    },
    {
        id: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        provider: "google",
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        capabilities: ["text", "vision", "tools", "json", "streaming"],
        pricing: { input: 0.075, output: 0.30 },
        description: "Fast and efficient",
    },
];

// ============================================================================
// X.AI (Grok) Models
// ============================================================================

export const XAI_MODELS: ModelConfig[] = [
    {
        id: "grok-3",
        name: "Grok 3",
        provider: "xai",
        contextWindow: 131072,
        maxOutputTokens: 131072,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code", "reasoning"],
        pricing: { input: 3.00, output: 15.00 },
        description: "Latest Grok model with advanced reasoning",
    },
    {
        id: "grok-3-fast",
        name: "Grok 3 Fast",
        provider: "xai",
        contextWindow: 131072,
        maxOutputTokens: 131072,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code"],
        pricing: { input: 1.00, output: 4.00 },
        description: "Faster variant of Grok 3",
    },
    {
        id: "grok-2-vision-1212",
        name: "Grok 2 Vision",
        provider: "xai",
        contextWindow: 32768,
        maxOutputTokens: 32768,
        capabilities: ["text", "vision", "tools", "json", "streaming"],
        pricing: { input: 2.00, output: 10.00 },
        description: "Grok 2 with vision capabilities",
    },
    {
        id: "grok-2-1212",
        name: "Grok 2",
        provider: "xai",
        contextWindow: 131072,
        maxOutputTokens: 131072,
        capabilities: ["text", "tools", "json", "streaming", "code"],
        pricing: { input: 2.00, output: 10.00 },
        description: "Previous generation Grok",
    },
];

// ============================================================================
// OpenRouter Models (Popular selections)
// ============================================================================

// ============================================================================
// Local Models (Ollama/LM Studio)
// ============================================================================

export const OLLAMA_MODELS: ModelConfig[] = [
    {
        id: "ollama/llama3.3",
        name: "Llama 3.3 (Local)",
        provider: "ollama",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ["text", "tools", "json", "streaming", "code"],
        pricing: { input: 0, output: 0 },
        description: "Meta Llama 3.3 running locally via Ollama",
    },
    {
        id: "ollama/qwen2.5-coder:32b",
        name: "Qwen 2.5 Coder 32B (Local)",
        provider: "ollama",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ["text", "tools", "json", "streaming", "code"],
        pricing: { input: 0, output: 0 },
        description: "Qwen 2.5 Coder running locally via Ollama",
    },
    {
        id: "ollama/deepseek-r1:32b",
        name: "DeepSeek R1 32B (Local)",
        provider: "ollama",
        contextWindow: 65536,
        maxOutputTokens: 8192,
        capabilities: ["text", "tools", "streaming", "code", "reasoning"],
        pricing: { input: 0, output: 0 },
        description: "DeepSeek R1 reasoning model running locally",
    },
    {
        id: "ollama/mistral",
        name: "Mistral (Local)",
        provider: "ollama",
        contextWindow: 32000,
        maxOutputTokens: 8192,
        capabilities: ["text", "tools", "json", "streaming"],
        pricing: { input: 0, output: 0 },
        description: "Mistral running locally via Ollama",
    },
];

export const LMSTUDIO_MODELS: ModelConfig[] = [
    {
        id: "lmstudio/default",
        name: "LM Studio (Active Model)",
        provider: "lmstudio",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ["text", "tools", "json", "streaming", "code"],
        pricing: { input: 0, output: 0 },
        description: "Currently loaded model in LM Studio",
    },
];

// ============================================================================
// OpenRouter Models (Popular selections)
// ============================================================================

export const OPENROUTER_MODELS: ModelConfig[] = [
    {
        id: "openai/gpt-4o",
        name: "GPT-4o (via OpenRouter)",
        provider: "openrouter",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code"],
        pricing: { input: 2.50, output: 10.00 },
        description: "OpenAI GPT-4o via OpenRouter",
    },
    {
        id: "anthropic/claude-sonnet-4",
        name: "Claude Sonnet 4 (via OpenRouter)",
        provider: "openrouter",
        contextWindow: 200000,
        maxOutputTokens: 64000,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code", "reasoning"],
        pricing: { input: 3.00, output: 15.00 },
        description: "Anthropic Claude via OpenRouter",
    },
    {
        id: "google/gemini-2.5-pro-preview",
        name: "Gemini 2.5 Pro (via OpenRouter)",
        provider: "openrouter",
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        capabilities: ["text", "vision", "tools", "json", "streaming", "code", "reasoning"],
        pricing: { input: 1.25, output: 10.00 },
        description: "Google Gemini via OpenRouter",
    },
    {
        id: "meta-llama/llama-3.3-70b-instruct",
        name: "Llama 3.3 70B",
        provider: "openrouter",
        contextWindow: 131072,
        maxOutputTokens: 32768,
        capabilities: ["text", "tools", "json", "streaming", "code"],
        pricing: { input: 0.40, output: 0.40 },
        description: "Meta Llama 3.3 70B via OpenRouter",
    },
    {
        id: "deepseek/deepseek-r1",
        name: "DeepSeek R1",
        provider: "openrouter",
        contextWindow: 65536,
        maxOutputTokens: 8192,
        capabilities: ["text", "tools", "json", "streaming", "code", "reasoning"],
        pricing: { input: 0.55, output: 2.19 },
        description: "DeepSeek reasoning model via OpenRouter",
    },
    {
        id: "mistralai/mistral-large-2411",
        name: "Mistral Large",
        provider: "openrouter",
        contextWindow: 131072,
        maxOutputTokens: 131072,
        capabilities: ["text", "tools", "json", "streaming", "code"],
        pricing: { input: 2.00, output: 6.00 },
        description: "Mistral Large via OpenRouter",
    },
];

// ============================================================================
// Provider Configurations
// ============================================================================

// ============================================================================
// Perplexity Models (Web Search & Deep Research)
// ============================================================================

export const PERPLEXITY_MODELS: ModelConfig[] = [
    {
        id: "sonar",
        name: "Sonar",
        provider: "perplexity",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        capabilities: ["text", "streaming"],
        pricing: { input: 1.0, output: 1.0 },
        description: "Fast web search with citations. Best for quick factual queries.",
    },
    {
        id: "sonar-pro",
        name: "Sonar Pro",
        provider: "perplexity",
        contextWindow: 200000,
        maxOutputTokens: 8192,
        capabilities: ["text", "streaming"],
        pricing: { input: 3.0, output: 15.0 },
        description: "Advanced web search with deeper analysis and more sources.",
    },
    {
        id: "sonar-reasoning-pro",
        name: "Sonar Reasoning Pro",
        provider: "perplexity",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ["text", "reasoning", "streaming"],
        pricing: { input: 2.0, output: 8.0 },
        description: "Web search with chain-of-thought reasoning for complex queries.",
    },
    {
        id: "sonar-deep-research",
        name: "Sonar Deep Research",
        provider: "perplexity",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ["text", "reasoning", "streaming"],
        pricing: { input: 2.0, output: 8.0 },
        description: "Multi-step deep research agent. Conducts thorough investigation across many sources.",
    },
];

// ============================================================================
// Deepgram (Audio-only provider - no LLM models)
// ============================================================================

export const DEEPGRAM_MODELS: ModelConfig[] = [];

export const PROVIDERS: Record<string, ProviderConfig> = {
    openai: {
        id: "openai",
        name: "OpenAI",
        description: "GPT-4o, o1, and other OpenAI models",
        website: "https://openai.com",
        models: OPENAI_MODELS,
        defaultModel: "gpt-4o",
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        requiresApiKey: true,
        apiKeyEnvVar: "OPENAI_API_KEY",
    },
    anthropic: {
        id: "anthropic",
        name: "Anthropic",
        description: "Claude Opus, Sonnet, and Haiku models",
        website: "https://anthropic.com",
        models: ANTHROPIC_MODELS,
        defaultModel: "claude-sonnet-4-20250514",
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        requiresApiKey: true,
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
    },
    google: {
        id: "google",
        name: "Google AI",
        description: "Gemini Pro and Flash models",
        website: "https://ai.google.dev",
        models: GOOGLE_MODELS,
        defaultModel: "gemini-2.5-flash-preview-05-20",
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        requiresApiKey: true,
        apiKeyEnvVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    },
    xai: {
        id: "xai",
        name: "xAI",
        description: "Grok models with real-time knowledge",
        website: "https://x.ai",
        models: XAI_MODELS,
        defaultModel: "grok-3",
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        requiresApiKey: true,
        apiKeyEnvVar: "XAI_API_KEY",
    },
    openrouter: {
        id: "openrouter",
        name: "OpenRouter",
        description: "Access multiple providers through one API",
        website: "https://openrouter.ai",
        models: OPENROUTER_MODELS,
        defaultModel: "openai/gpt-4o",
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        requiresApiKey: true,
        apiKeyEnvVar: "OPENROUTER_API_KEY",
    },
    perplexity: {
        id: "perplexity",
        name: "Perplexity",
        description: "Web search and deep research models with real-time citations",
        website: "https://docs.perplexity.ai",
        models: PERPLEXITY_MODELS,
        defaultModel: "sonar",
        supportsStreaming: true,
        supportsVision: false,
        supportsTools: false,
        requiresApiKey: true,
        apiKeyEnvVar: "PERPLEXITY_API_KEY",
    },
    deepgram: {
        id: "deepgram",
        name: "Deepgram",
        description: "Real-time speech-to-text and text-to-speech",
        website: "https://deepgram.com",
        models: DEEPGRAM_MODELS,
        defaultModel: "",
        supportsStreaming: false,
        supportsVision: false,
        supportsTools: false,
        requiresApiKey: true,
        apiKeyEnvVar: "DEEPGRAM_API_KEY",
    },
    ollama: {
        id: "ollama",
        name: "Ollama (Local)",
        description: "Run models locally with Ollama",
        website: "https://ollama.ai",
        models: OLLAMA_MODELS,
        defaultModel: "ollama/llama3.3",
        supportsStreaming: true,
        supportsVision: false,
        supportsTools: true,
        requiresApiKey: false,
        apiKeyEnvVar: "OLLAMA_API_KEY",
        baseUrl: "http://127.0.0.1:11434/v1",
    },
    lmstudio: {
        id: "lmstudio",
        name: "LM Studio (Local)",
        description: "Run models locally with LM Studio",
        website: "https://lmstudio.ai",
        models: LMSTUDIO_MODELS,
        defaultModel: "lmstudio/default",
        supportsStreaming: true,
        supportsVision: false,
        supportsTools: true,
        requiresApiKey: false,
        apiKeyEnvVar: "LMSTUDIO_API_KEY",
        baseUrl: "http://127.0.0.1:1234/v1",
    },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all models from all providers
 */
export function getAllModels(): ModelConfig[] {
    return [
        ...OPENAI_MODELS,
        ...ANTHROPIC_MODELS,
        ...GOOGLE_MODELS,
        ...XAI_MODELS,
        ...PERPLEXITY_MODELS,
        ...OPENROUTER_MODELS,
        ...OLLAMA_MODELS,
        ...LMSTUDIO_MODELS,
    ];
}

/**
 * Get models by provider
 */
export function getModelsByProvider(providerId: string): ModelConfig[] {
    return PROVIDERS[providerId]?.models || [];
}

/**
 * Get a specific model by ID
 */
export function getModelById(modelId: string): ModelConfig | undefined {
    return getAllModels().find((m) => m.id === modelId);
}

/**
 * Get models by capability
 */
export function getModelsByCapability(capability: string): ModelConfig[] {
    return getAllModels().filter((m) => 
        m.capabilities.includes(capability as ModelConfig["capabilities"][number])
    );
}

/**
 * Get the provider for a model
 */
export function getProviderForModel(modelId: string): ProviderConfig | undefined {
    const model = getModelById(modelId);
    if (!model) return undefined;
    return PROVIDERS[model.provider];
}

/**
 * Sort models by price (cheapest first)
 */
export function sortModelsByPrice(models: ModelConfig[]): ModelConfig[] {
    return [...models].sort((a, b) => {
        const avgA = (a.pricing.input + a.pricing.output) / 2;
        const avgB = (b.pricing.input + b.pricing.output) / 2;
        return avgA - avgB;
    });
}

/**
 * Get recommended model based on requirements
 */
export function getRecommendedModel(requirements: {
    needsVision?: boolean;
    needsReasoning?: boolean;
    needsTools?: boolean;
    maxCostPerMToken?: number;
}): ModelConfig | undefined {
    let candidates = getAllModels();
    
    if (requirements.needsVision) {
        candidates = candidates.filter((m) => m.capabilities.includes("vision"));
    }
    if (requirements.needsReasoning) {
        candidates = candidates.filter((m) => m.capabilities.includes("reasoning"));
    }
    if (requirements.needsTools) {
        candidates = candidates.filter((m) => m.capabilities.includes("tools"));
    }
    if (requirements.maxCostPerMToken) {
        candidates = candidates.filter(
            (m) => m.pricing.output <= requirements.maxCostPerMToken!
        );
    }
    
    // Sort by price and return cheapest
    return sortModelsByPrice(candidates)[0];
}
