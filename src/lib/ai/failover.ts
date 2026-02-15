import type { LanguageModel as LanguageModelV1 } from "ai";
import { getModel, getConfiguredProviders, isProviderConfigured } from "./providers/factory";
import { getModelById, getModelsByProvider, PROVIDERS } from "./models";
import type { ProviderId, ModelConfig } from "./providers/types";
import { getCostOptimizedFallbacks, sortModelsByCost } from "./cost-optimizer";

// ============================================================================
// Configuration
// ============================================================================

export interface FailoverConfig {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    enableFallback: boolean;
    fallbackOrder?: ProviderId[];
    /** When true, sort fallback candidates by cost (cheapest first) */
    costOptimization?: boolean;
    /** Maximum cost per request in USD — models exceeding this are filtered out */
    maxCostPerRequest?: number;
    /** When true, prefer cheaper fallback models over capability-matched ones */
    preferCheaperFallback?: boolean;
}

export const DEFAULT_FAILOVER_CONFIG: FailoverConfig = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    enableFallback: true,
    fallbackOrder: ["openai", "anthropic", "google", "xai", "openrouter"],
};

// ============================================================================
// Error Types
// ============================================================================

export interface ProviderError extends Error {
    provider: ProviderId;
    model: string;
    isRetryable: boolean;
    statusCode?: number;
}

export function isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        
        // Rate limit errors are retryable
        if (message.includes("rate limit") || message.includes("429")) {
            return true;
        }
        
        // Temporary server errors are retryable
        if (message.includes("500") || message.includes("502") || message.includes("503") || message.includes("504")) {
            return true;
        }
        
        // Timeout errors are retryable
        if (message.includes("timeout") || message.includes("timed out")) {
            return true;
        }
        
        // Network errors are retryable
        if (message.includes("network") || message.includes("connection")) {
            return true;
        }
    }
    
    return false;
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Sleep for the specified duration
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
    attempt: number,
    config: FailoverConfig
): number {
    const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
    // Add jitter (±25%)
    const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.round(cappedDelay + jitter);
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<FailoverConfig> = {}
): Promise<T> {
    const fullConfig = { ...DEFAULT_FAILOVER_CONFIG, ...config };
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            // Check if we should retry
            if (attempt < fullConfig.maxRetries && isRetryableError(error)) {
                const delay = calculateDelay(attempt, fullConfig);
                console.log(`Retry attempt ${attempt + 1}/${fullConfig.maxRetries} after ${delay}ms`);
                await sleep(delay);
            } else {
                throw lastError;
            }
        }
    }
    
    throw lastError || new Error("Max retries exceeded");
}

// ============================================================================
// Fallback Logic
// ============================================================================

/**
 * Get fallback models for a given model.
 * When costOptimization or preferCheaperFallback is enabled, returns
 * cost-sorted candidates instead of capability-matched per-provider picks.
 */
export function getFallbackModels(
    modelId: string,
    config: Partial<FailoverConfig> = {}
): ModelConfig[] {
    const fullConfig = { ...DEFAULT_FAILOVER_CONFIG, ...config };
    const originalModel = getModelById(modelId);

    if (!originalModel) {
        return [];
    }

    // Cost-optimized path: delegate to cost-optimizer for sorted candidates
    if (fullConfig.preferCheaperFallback || fullConfig.costOptimization) {
        return getCostOptimizedFallbacks(modelId, fullConfig.maxCostPerRequest);
    }

    // Standard capability-matching path
    const fallbacks: ModelConfig[] = [];
    const configuredProviders = getConfiguredProviders();

    // Get fallback order, filtering to only configured providers
    const fallbackOrder = (fullConfig.fallbackOrder || []).filter(
        (p) => configuredProviders.includes(p) && p !== originalModel.provider
    );

    // For each provider, find a model with similar capabilities
    for (const providerId of fallbackOrder) {
        const providerModels = getModelsByProvider(providerId);

        // Find a model with similar capabilities
        const similarModel = providerModels.find((m) => {
            // Must have similar capabilities
            const hasVision = originalModel.capabilities.includes("vision");
            const hasReasoning = originalModel.capabilities.includes("reasoning");
            const hasTools = originalModel.capabilities.includes("tools");

            if (hasVision && !m.capabilities.includes("vision")) return false;
            if (hasReasoning && !m.capabilities.includes("reasoning")) return false;
            if (hasTools && !m.capabilities.includes("tools")) return false;

            return true;
        });

        if (similarModel) {
            fallbacks.push(similarModel);
        }
    }

    return fallbacks;
}

/**
 * Get a model with automatic failover
 */
export async function getModelWithFailover(
    modelId: string,
    config: Partial<FailoverConfig> = {}
): Promise<{ model: LanguageModelV1; modelId: string; provider: ProviderId }> {
    const fullConfig = { ...DEFAULT_FAILOVER_CONFIG, ...config };
    const originalModel = getModelById(modelId);
    
    if (!originalModel) {
        throw new Error(`Unknown model: ${modelId}`);
    }
    
    // Try the original model first
    try {
        const model = getModel(modelId);
        return { model, modelId, provider: originalModel.provider };
    } catch (error) {
        console.error(`Failed to get model ${modelId}:`, error);
        
        // If fallback is disabled, throw
        if (!fullConfig.enableFallback) {
            throw error;
        }
    }
    
    // Try fallback models
    const fallbacks = getFallbackModels(modelId, config);
    
    for (const fallback of fallbacks) {
        try {
            const model = getModel(fallback.id);
            console.log(`Falling back from ${modelId} to ${fallback.id}`);
            return { model, modelId: fallback.id, provider: fallback.provider };
        } catch (error) {
            console.error(`Failed to get fallback model ${fallback.id}:`, error);
        }
    }
    
    throw new Error(`No available models. Original: ${modelId}, tried ${fallbacks.length} fallbacks.`);
}

// ============================================================================
// Failover Events
// ============================================================================

export interface FailoverEvent {
    timestamp: Date;
    originalModel: string;
    originalProvider: ProviderId;
    fallbackModel?: string;
    fallbackProvider?: ProviderId;
    error: string;
    retryAttempt?: number;
    success: boolean;
}

// In-memory event log (for now - could be moved to database later)
const failoverEvents: FailoverEvent[] = [];

export function logFailoverEvent(event: FailoverEvent): void {
    failoverEvents.push(event);
    // Keep only last 100 events in memory
    if (failoverEvents.length > 100) {
        failoverEvents.shift();
    }
    
    // Log to console for debugging
    console.log("[Failover Event]", JSON.stringify(event, null, 2));
}

export function getFailoverEvents(limit: number = 50): FailoverEvent[] {
    return failoverEvents.slice(-limit);
}

export function clearFailoverEvents(): void {
    failoverEvents.length = 0;
}

// ============================================================================
// Combined Failover + Retry
// ============================================================================

/**
 * Execute a function with the model, including retry and failover logic
 */
export async function executeWithFailover<T>(
    modelId: string,
    fn: (model: LanguageModelV1, modelId: string, provider: ProviderId) => Promise<T>,
    config: Partial<FailoverConfig> = {}
): Promise<{ result: T; modelId: string; provider: ProviderId; usedFallback: boolean }> {
    const fullConfig = { ...DEFAULT_FAILOVER_CONFIG, ...config };
    const originalModel = getModelById(modelId);
    
    if (!originalModel) {
        throw new Error(`Unknown model: ${modelId}`);
    }
    
    // Try original model with retry
    try {
        const result = await withRetry(async () => {
            const model = getModel(modelId);
            return fn(model, modelId, originalModel.provider);
        }, fullConfig);
        
        return {
            result,
            modelId,
            provider: originalModel.provider,
            usedFallback: false,
        };
    } catch (primaryError) {
        const errorMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
        
        // Log the failure
        logFailoverEvent({
            timestamp: new Date(),
            originalModel: modelId,
            originalProvider: originalModel.provider,
            error: errorMessage,
            success: false,
        });
        
        // If fallback is disabled, throw
        if (!fullConfig.enableFallback) {
            throw primaryError;
        }
        
        // Try fallback models
        const fallbacks = getFallbackModels(modelId, config);
        
        for (const fallback of fallbacks) {
            try {
                const result = await withRetry(async () => {
                    const model = getModel(fallback.id);
                    return fn(model, fallback.id, fallback.provider);
                }, { ...fullConfig, maxRetries: 1 }); // Fewer retries for fallbacks
                
                // Log successful fallback
                logFailoverEvent({
                    timestamp: new Date(),
                    originalModel: modelId,
                    originalProvider: originalModel.provider,
                    fallbackModel: fallback.id,
                    fallbackProvider: fallback.provider,
                    error: errorMessage,
                    success: true,
                });
                
                return {
                    result,
                    modelId: fallback.id,
                    provider: fallback.provider,
                    usedFallback: true,
                };
            } catch (fallbackError) {
                console.error(`Fallback ${fallback.id} failed:`, fallbackError);
            }
        }
        
        // All fallbacks failed
        throw new Error(
            `All models failed. Original: ${modelId}, tried ${fallbacks.length} fallbacks. ` +
            `Last error: ${errorMessage}`
        );
    }
}
