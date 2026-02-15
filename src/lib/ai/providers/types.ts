import type { LanguageModel as LanguageModelV1 } from "ai";

// ============================================================================
// Provider Types
// ============================================================================

export type ProviderId =
    | "openai"
    | "anthropic"
    | "google"
    | "xai"
    | "perplexity"
    | "openrouter"
    | "ollama"
    | "lmstudio"
    | "deepgram";

export type ModelCapability =
    | "text"           // Basic text generation
    | "vision"         // Image understanding
    | "tools"          // Function/tool calling
    | "reasoning"      // Extended thinking/reasoning
    | "code"           // Code generation optimization
    | "json"           // JSON mode output
    | "streaming"      // Streaming support
    | "extended_thinking" // Anthropic extended thinking with budget
    | "image_generation"; // Native image generation (e.g. Gemini)

// ============================================================================
// Model Configuration
// ============================================================================

export interface ModelConfig {
    id: string;                          // Unique model identifier (e.g., "gpt-4o")
    name: string;                        // Display name (e.g., "GPT-4o")
    provider: ProviderId;                // Provider this model belongs to
    contextWindow: number;               // Max context window size in tokens
    maxOutputTokens: number;             // Max output tokens
    capabilities: ModelCapability[];     // What the model can do
    
    // Pricing (per 1M tokens, in USD)
    pricing: {
        input: number;
        output: number;
        cached?: number;                 // Cached input price if supported
    };
    
    // Optional metadata
    description?: string;
    deprecated?: boolean;
    beta?: boolean;
    releaseDate?: string;
}

// ============================================================================
// Provider Configuration
// ============================================================================

export interface ProviderConfig {
    id: ProviderId;
    name: string;                        // Display name (e.g., "OpenAI")
    description: string;
    website: string;
    models: ModelConfig[];
    defaultModel: string;                // Default model ID
    
    // Provider capabilities
    supportsStreaming: boolean;
    supportsVision: boolean;
    supportsTools: boolean;
    
    // API configuration
    requiresApiKey: boolean;
    apiKeyEnvVar: string;                // Environment variable name
    baseUrl?: string;                    // Optional custom base URL
}

// ============================================================================
// Provider Interface
// ============================================================================

export interface AIProvider {
    id: ProviderId;
    config: ProviderConfig;
    
    /**
     * Get the language model instance for the specified model ID
     */
    getModel(modelId: string): LanguageModelV1;
    
    /**
     * Check if the provider has a valid API key configured
     */
    isConfigured(): boolean;
    
    /**
     * Validate that a model ID is supported by this provider
     */
    supportsModel(modelId: string): boolean;
    
    /**
     * Get the model configuration for a specific model ID
     */
    getModelConfig(modelId: string): ModelConfig | undefined;
}

// ============================================================================
// Usage Tracking Types
// ============================================================================

export interface UsageRecord {
    id: string;
    userId: string;
    conversationId?: string;
    messageId?: string;
    provider: ProviderId;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;                     // Calculated cost in USD
    timestamp: Date;
}

export interface UsageSummary {
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    byProvider: Record<ProviderId, {
        tokens: number;
        cost: number;
    }>;
    byModel: Record<string, {
        tokens: number;
        cost: number;
    }>;
}

// ============================================================================
// API Key Types
// ============================================================================

export interface StoredApiKey {
    id: string;
    userId: string;
    provider: ProviderId;
    encryptedKey: string;                // AES-256-GCM encrypted
    keyHint: string;                     // Last 4 characters for display
    isValid: boolean;
    lastValidated?: Date;
    lastUsed?: Date;
    createdAt: Date;
    updatedAt: Date;
}

// ============================================================================
// Chat Request Types
// ============================================================================

export interface MultiProviderChatRequest {
    messages: Array<{
        role: "user" | "assistant" | "system";
        content: string;
    }>;
    provider: ProviderId;
    model: string;
    conversationId?: string;
    
    // Optional parameters
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate the cost for a given number of tokens
 */
export function calculateCost(
    model: ModelConfig,
    inputTokens: number,
    outputTokens: number
): number {
    const inputCost = (inputTokens / 1_000_000) * model.pricing.input;
    const outputCost = (outputTokens / 1_000_000) * model.pricing.output;
    return inputCost + outputCost;
}

/**
 * Format cost for display
 */
export function formatCost(costUsd: number): string {
    if (costUsd < 0.01) {
        return `${(costUsd * 100).toFixed(4)}¢`;
    }
    return `$${costUsd.toFixed(4)}`;
}

/**
 * Check if a model has a specific capability
 */
export function hasCapability(
    model: ModelConfig,
    capability: ModelCapability
): boolean {
    return model.capabilities.includes(capability);
}
