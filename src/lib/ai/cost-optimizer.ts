/**
 * Cost-Aware Model Fallback System
 *
 * Provides cost-optimized model selection and budget-aware fallback logic.
 * Works with the existing model registry and provider factory to select
 * the cheapest available model that meets capability requirements.
 */

import { getModelById, getModelsByProvider, PROVIDERS } from "./models";
import type { ModelConfig, ProviderId } from "./providers/types";
import { getConfiguredProviders } from "./providers/factory";

// ============================================================================
// Cost-Optimized Fallbacks
// ============================================================================

/**
 * Gets fallback model candidates sorted by cost (cheapest first).
 * Only includes models from configured (API-key-present) providers.
 *
 * @param modelId - The primary model ID to find fallbacks for
 * @param budget - Optional per-request budget in USD. Models exceeding this
 *                 estimate (based on a reference request of 2000 input + 1000
 *                 output tokens) are filtered out.
 * @returns Sorted array of fallback ModelConfigs, cheapest first
 */
export function getCostOptimizedFallbacks(
    modelId: string,
    budget?: number
): ModelConfig[] {
    const originalModel = getModelById(modelId);
    if (!originalModel) {
        return [];
    }

    const configuredProviderIds = getConfiguredProviders();

    // Collect all models from configured providers, excluding the original
    const candidates: ModelConfig[] = [];
    for (const providerId of configuredProviderIds) {
        const models = getModelsByProvider(providerId);
        for (const model of models) {
            if (model.id === modelId) continue;
            if (model.deprecated) continue;
            candidates.push(model);
        }
    }

    // If a budget is provided, filter out models that exceed the per-request
    // cost estimate. Use a reference request size of 2000 input + 1000 output
    // tokens as the estimation baseline.
    let filtered = candidates;
    if (budget !== undefined && budget > 0) {
        filtered = candidates.filter((model) => {
            const estimate = getModelCostEstimate(model.id, 2000, 1000);
            return estimate <= budget;
        });
    }

    return sortModelsByCost(filtered);
}

// ============================================================================
// Budget Monitoring
// ============================================================================

/**
 * Checks whether cost optimization / fallback should activate based on
 * current monthly spend vs. budget.
 *
 * @param currentMonthCost - Total USD spent this billing month
 * @param monthlyBudget - Monthly budget cap in USD
 * @param alertPercentage - Percentage threshold for alert (default 80)
 * @returns Object indicating whether to fallback, alert, and current usage %
 */
export function shouldFallback(
    currentMonthCost: number,
    monthlyBudget: number,
    alertPercentage: number = 80
): { shouldFallback: boolean; shouldAlert: boolean; percentUsed: number } {
    if (monthlyBudget <= 0) {
        // No budget set = unlimited, never fallback or alert
        return { shouldFallback: false, shouldAlert: false, percentUsed: 0 };
    }

    const percentUsed = (currentMonthCost / monthlyBudget) * 100;

    return {
        shouldFallback: percentUsed >= 100,
        shouldAlert: percentUsed >= alertPercentage,
        percentUsed: Math.round(percentUsed * 100) / 100,
    };
}

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Returns estimated cost in USD for a single request with the given model.
 * Pricing is per 1M tokens as stored in ModelConfig.
 *
 * @param modelId - Model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD, or 0 if the model is not found
 */
export function getModelCostEstimate(
    modelId: string,
    inputTokens: number,
    outputTokens: number
): number {
    const model = getModelById(modelId);
    if (!model) {
        return 0;
    }

    const inputCost = (inputTokens / 1_000_000) * model.pricing.input;
    const outputCost = (outputTokens / 1_000_000) * model.pricing.output;
    return inputCost + outputCost;
}

// ============================================================================
// Cheapest Model Selection
// ============================================================================

/**
 * Returns the cheapest model that has ALL required capabilities, considering
 * only configured providers.
 *
 * @param capabilities - Array of required capability strings (e.g. ["text", "tools"])
 * @returns The cheapest matching ModelConfig, or null if none found
 */
export function getCheapestModel(
    capabilities?: string[]
): ModelConfig | null {
    const configuredProviderIds = getConfiguredProviders();

    const allModels: ModelConfig[] = [];
    for (const providerId of configuredProviderIds) {
        const models = getModelsByProvider(providerId);
        allModels.push(...models);
    }

    // Filter to non-deprecated models with all required capabilities
    let filtered = allModels.filter((m) => !m.deprecated);

    if (capabilities && capabilities.length > 0) {
        filtered = filtered.filter((model) =>
            capabilities.every((cap) =>
                model.capabilities.includes(cap as ModelConfig["capabilities"][number])
            )
        );
    }

    if (filtered.length === 0) {
        return null;
    }

    const sorted = sortModelsByCost(filtered);
    return sorted[0];
}

// ============================================================================
// Sorting
// ============================================================================

/**
 * Sorts models by total pricing (input + output per 1M tokens) ascending.
 * Returns a new array; does not mutate the input.
 *
 * @param models - Array of ModelConfig to sort
 * @returns New sorted array, cheapest first
 */
export function sortModelsByCost(models: ModelConfig[]): ModelConfig[] {
    return [...models].sort((a, b) => {
        const costA = a.pricing.input + a.pricing.output;
        const costB = b.pricing.input + b.pricing.output;
        return costA - costB;
    });
}
