import useSWR from "swr";
import type { ModelConfig, ProviderId } from "@/lib/ai/providers/types";
import { getAllModels, getModelsByProvider } from "@/lib/ai/models";

// ============================================================================
// Types
// ============================================================================

export interface ModelsResponse {
    success: boolean;
    models: ModelConfig[];
    modelCount: number;
    byProvider?: Record<
        string,
        { count: number; fromCache: boolean; error?: string }
    >;
    fallback?: boolean;
    error?: string;
}

export interface UseModelsOptions {
    provider?: ProviderId;
    enabled?: boolean;
}

// ============================================================================
// Fetcher
// ============================================================================

const fetcher = async (url: string): Promise<ModelsResponse> => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
        throw new Error("Failed to fetch models");
    }
    return res.json();
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to fetch available models with dynamic API fetching
 * Falls back to hardcoded models if API fails
 */
export function useModels(options: UseModelsOptions = {}) {
    const { provider, enabled = true } = options;

    // Build URL with optional provider filter
    const url = provider ? `/api/models?provider=${provider}` : "/api/models";

    const { data, error, isLoading, mutate } = useSWR<ModelsResponse>(
        enabled ? url : null,
        fetcher,
        {
            revalidateOnFocus: false,
            revalidateOnReconnect: false,
            dedupingInterval: 60000, // 1 minute
            fallbackData: {
                success: true,
                models: provider ? getModelsByProvider(provider) : getAllModels(),
                modelCount: provider
                    ? getModelsByProvider(provider).length
                    : getAllModels().length,
                fallback: true,
            },
        }
    );

    return {
        models: data?.models ?? [],
        modelCount: data?.modelCount ?? 0,
        byProvider: data?.byProvider,
        isLoading,
        error,
        isFallback: data?.fallback ?? false,
        mutate,
    };
}

/**
 * Hook to fetch models for a specific provider
 */
export function useProviderModels(provider: ProviderId) {
    return useModels({ provider });
}

/**
 * Search models by query string
 */
export function filterModels(
    models: ModelConfig[],
    query: string
): ModelConfig[] {
    if (!query.trim()) return models;

    const lowerQuery = query.toLowerCase();

    return models.filter(
        (m) =>
            m.id.toLowerCase().includes(lowerQuery) ||
            m.name.toLowerCase().includes(lowerQuery) ||
            m.description?.toLowerCase().includes(lowerQuery) ||
            m.provider.toLowerCase().includes(lowerQuery)
    );
}

/**
 * Filter models by capabilities
 */
export function filterByCapabilities(
    models: ModelConfig[],
    capabilities: string[]
): ModelConfig[] {
    if (capabilities.length === 0) return models;

    return models.filter((m) =>
        capabilities.every((cap) =>
            m.capabilities.includes(cap as ModelConfig["capabilities"][number])
        )
    );
}

/**
 * Group models by provider
 */
export function groupByProvider(
    models: ModelConfig[]
): Record<ProviderId, ModelConfig[]> {
    return models.reduce(
        (acc, model) => {
            if (!acc[model.provider]) {
                acc[model.provider] = [];
            }
            acc[model.provider].push(model);
            return acc;
        },
        {} as Record<ProviderId, ModelConfig[]>
    );
}
