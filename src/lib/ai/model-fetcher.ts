/**
 * Dynamic model fetching from provider APIs
 * Fetches available models from OpenRouter, OpenAI, Google, and xAI
 */

import { getFromCache, setInCache } from '@/lib/cache';
import type { ModelConfig, ProviderId, ModelCapability } from './providers/types';
import {
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
  XAI_MODELS,
  OPENROUTER_MODELS,
  OLLAMA_MODELS,
  LMSTUDIO_MODELS,
} from './models';

// ============================================================================
// Types
// ============================================================================

export interface FetchedModel {
  id: string;
  name: string;
  provider: ProviderId;
  contextWindow?: number;
  maxOutputTokens?: number;
  capabilities: ModelCapability[];
  pricing?: { input: number; output: number };
  description?: string;
}

export interface ProviderModelsResult {
  provider: ProviderId;
  models: ModelConfig[];
  fromCache: boolean;
  error?: string;
}

// Cache key for provider models
const MODELS_CACHE_KEY = (provider: ProviderId) => `models:${provider}`;
const MODELS_CACHE_TTL = 3600; // 1 hour

// ============================================================================
// Model ID Normalization
// ============================================================================

const PROVIDER_PREFIXES: Record<string, ProviderId> = {
  'ollama/': 'ollama',
  'lmstudio/': 'lmstudio',
  'openrouter/': 'openrouter',
};

/**
 * Strip provider prefix from a model ID to get the bare model name.
 * e.g. "ollama/llama3.3" → "llama3.3", "lmstudio/default" → "default"
 * OpenRouter IDs (e.g. "anthropic/claude-3-opus") are returned as-is
 * since OpenRouter's API expects the full qualified name.
 */
export function stripModelPrefix(modelId: string): string {
  for (const prefix of Object.keys(PROVIDER_PREFIXES)) {
    if (modelId.startsWith(prefix)) {
      return modelId.slice(prefix.length);
    }
  }
  return modelId;
}

/**
 * Add the appropriate provider prefix to a bare model ID.
 * e.g. ("llama3.3", "ollama") → "ollama/llama3.3"
 * Only adds prefix for local providers (ollama, lmstudio).
 * Cloud provider model IDs are returned unchanged.
 */
export function addModelPrefix(modelId: string, provider: ProviderId): string {
  if (provider === 'ollama' && !modelId.startsWith('ollama/')) {
    return `ollama/${modelId}`;
  }
  if (provider === 'lmstudio' && !modelId.startsWith('lmstudio/')) {
    return `lmstudio/${modelId}`;
  }
  return modelId;
}

/**
 * Detect the provider from a prefixed model ID.
 * Returns the provider if a known prefix is found, undefined otherwise.
 */
export function detectProviderFromModelId(modelId: string): ProviderId | undefined {
  for (const [prefix, provider] of Object.entries(PROVIDER_PREFIXES)) {
    if (modelId.startsWith(prefix)) {
      return provider;
    }
  }
  return undefined;
}

/**
 * Normalize a model ID for a target provider.
 * Strips foreign prefixes and adds the correct one if needed.
 */
export function normalizeModelId(modelId: string, targetProvider: ProviderId): string {
  const bare = stripModelPrefix(modelId);
  return addModelPrefix(bare, targetProvider);
}

// ============================================================================
// OpenRouter Models Fetcher
// ============================================================================

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
  };
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
}

export async function fetchOpenRouterModels(apiKey: string): Promise<ModelConfig[]> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const models: OpenRouterModel[] = data.data || [];

    return models.map((m) => ({
      id: m.id,
      name: m.name || m.id,
      provider: 'openrouter' as ProviderId,
      contextWindow: m.context_length || 4096,
      maxOutputTokens: m.top_provider?.max_completion_tokens || 4096,
      capabilities: inferCapabilities(m),
      pricing: {
        input: parseFloat(m.pricing?.prompt || '0') * 1_000_000,
        output: parseFloat(m.pricing?.completion || '0') * 1_000_000,
      },
      description: m.description?.slice(0, 200) || `${m.name} via OpenRouter`,
    }));
  } catch (error) {
    console.error('Failed to fetch OpenRouter models:', error);
    return OPENROUTER_MODELS; // Fallback to hardcoded
  }
}

function inferCapabilities(model: OpenRouterModel): ModelCapability[] {
  const caps: ModelCapability[] = ['text', 'streaming'];
  const id = model.id.toLowerCase();
  const name = (model.name || '').toLowerCase();

  // Vision capabilities
  if (
    id.includes('vision') ||
    id.includes('4o') ||
    id.includes('gpt-4-turbo') ||
    id.includes('claude-3') ||
    id.includes('gemini')
  ) {
    caps.push('vision');
  }

  // Tool/function calling
  if (
    id.includes('gpt-4') ||
    id.includes('gpt-3.5') ||
    id.includes('claude') ||
    id.includes('gemini') ||
    id.includes('mistral-large')
  ) {
    caps.push('tools');
  }

  // JSON mode
  if (id.includes('gpt-4') || id.includes('gpt-3.5') || id.includes('gemini')) {
    caps.push('json');
  }

  // Reasoning/thinking models
  if (
    id.includes('o1') ||
    id.includes('o3') ||
    id.includes('deepseek-r1') ||
    name.includes('reasoning') ||
    id.includes('qwq')
  ) {
    caps.push('reasoning');
  }

  // Code models
  if (
    id.includes('code') ||
    id.includes('deepseek') ||
    id.includes('codestral') ||
    id.includes('claude') ||
    id.includes('gpt-4')
  ) {
    caps.push('code');
  }

  return [...new Set(caps)] as ModelCapability[];
}

// ============================================================================
// OpenAI Models Fetcher
// ============================================================================

export async function fetchOpenAIModels(apiKey: string): Promise<ModelConfig[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const models = data.data || [];

    // Filter to chat models only
    const chatModels = models.filter(
      (m: { id: string }) =>
        m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3')
    );

    // Merge with hardcoded data for pricing/capabilities
    return chatModels.map((m: { id: string }) => {
      const hardcoded = OPENAI_MODELS.find((hm) => hm.id === m.id);
      if (hardcoded) return hardcoded;

      return {
        id: m.id,
        name: m.id,
        provider: 'openai' as ProviderId,
        contextWindow: 128000,
        maxOutputTokens: 16384,
        capabilities: ['text', 'streaming'] as ModelCapability[],
        pricing: { input: 0, output: 0 },
        description: `OpenAI ${m.id}`,
      };
    });
  } catch (error) {
    console.error('Failed to fetch OpenAI models:', error);
    return OPENAI_MODELS; // Fallback to hardcoded
  }
}

// ============================================================================
// Google Models Fetcher
// ============================================================================

export async function fetchGoogleModels(apiKey: string): Promise<ModelConfig[]> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }

    const data = await response.json();
    const models = data.models || [];

    // Filter to generative models
    const chatModels = models.filter((m: { name: string }) => m.name.includes('gemini'));

    return chatModels.map(
      (m: {
        name: string;
        displayName?: string;
        inputTokenLimit?: number;
        outputTokenLimit?: number;
        description?: string;
      }) => {
        const modelId = m.name.replace('models/', '');
        const hardcoded = GOOGLE_MODELS.find((hm) => hm.id === modelId);
        if (hardcoded) return hardcoded;

        return {
          id: modelId,
          name: m.displayName || modelId,
          provider: 'google' as ProviderId,
          contextWindow: m.inputTokenLimit || 32768,
          maxOutputTokens: m.outputTokenLimit || 8192,
          capabilities: ['text', 'streaming', 'vision'] as ModelCapability[],
          pricing: { input: 0, output: 0 },
          description: m.description?.slice(0, 200) || `Google ${modelId}`,
        };
      }
    );
  } catch (error) {
    console.error('Failed to fetch Google models:', error);
    return GOOGLE_MODELS; // Fallback to hardcoded
  }
}

// ============================================================================
// xAI Models Fetcher
// ============================================================================

export async function fetchXAIModels(apiKey: string): Promise<ModelConfig[]> {
  try {
    const response = await fetch('https://api.x.ai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`xAI API error: ${response.status}`);
    }

    const data = await response.json();
    const models = data.data || [];

    return models.map((m: { id: string }) => {
      const hardcoded = XAI_MODELS.find((hm) => hm.id === m.id);
      if (hardcoded) return hardcoded;

      return {
        id: m.id,
        name: m.id,
        provider: 'xai' as ProviderId,
        contextWindow: 131072,
        maxOutputTokens: 131072,
        capabilities: ['text', 'streaming'] as ModelCapability[],
        pricing: { input: 0, output: 0 },
        description: `xAI ${m.id}`,
      };
    });
  } catch (error) {
    console.error('Failed to fetch xAI models:', error);
    return XAI_MODELS; // Fallback to hardcoded
  }
}

// ============================================================================
// Ollama Models Fetcher
// ============================================================================

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  details?: {
    family?: string;
    parameter_size?: string;
  };
}

export async function fetchOllamaModels(): Promise<ModelConfig[]> {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(`Ollama API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const models: OllamaModel[] = data.models || [];

    if (models.length === 0) {
      return OLLAMA_MODELS; // Return defaults if no models found
    }

    return models.map((m) => {
      const modelId = m.name;
      const isReasoning =
        modelId.toLowerCase().includes('r1') || modelId.toLowerCase().includes('deepseek');
      const isCode =
        modelId.toLowerCase().includes('code') || modelId.toLowerCase().includes('coder');

      const caps: ModelCapability[] = ['text', 'streaming', 'tools'];
      if (isReasoning) caps.push('reasoning');
      if (isCode) caps.push('code');

      return {
        id: `ollama/${modelId}`,
        name: formatOllamaModelName(modelId),
        provider: 'ollama' as ProviderId,
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: caps,
        pricing: { input: 0, output: 0 },
        description: `Local Ollama model${m.details?.parameter_size ? ` (${m.details.parameter_size})` : ''}`,
      };
    });
  } catch (error: unknown) {
    const code =
      (error as NodeJS.ErrnoException)?.cause &&
      typeof (error as NodeJS.ErrnoException).cause === 'object'
        ? ((error as NodeJS.ErrnoException).cause as NodeJS.ErrnoException).code
        : (error as NodeJS.ErrnoException).code;
    if (
      code === 'ECONNREFUSED' ||
      (error instanceof DOMException && error.name === 'TimeoutError')
    ) {
      // Ollama isn't running — silently return empty
      return [];
    }
    console.warn('Ollama not accessible:', (error as Error).message || error);
    return [];
  }
}

function formatOllamaModelName(modelId: string): string {
  const parts = modelId.split(':');
  const baseName = parts[0];
  return (
    baseName
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ') + ' (Local)'
  );
}

// ============================================================================
// LM Studio Models Fetcher
// ============================================================================

export async function fetchLMStudioModels(): Promise<ModelConfig[]> {
  try {
    const response = await fetch('http://127.0.0.1:1234/v1/models', {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(`LM Studio API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const models = data.data || [];

    if (models.length === 0) {
      return LMSTUDIO_MODELS; // Return defaults if no models found
    }

    return models.map((m: { id: string }) => {
      const modelId = m.id;
      const isReasoning = modelId.toLowerCase().includes('r1');
      const isCode =
        modelId.toLowerCase().includes('code') || modelId.toLowerCase().includes('coder');

      const caps: ModelCapability[] = ['text', 'streaming', 'tools'];
      if (isReasoning) caps.push('reasoning');
      if (isCode) caps.push('code');

      return {
        id: `lmstudio/${modelId}`,
        name: formatLMStudioModelName(modelId),
        provider: 'lmstudio' as ProviderId,
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: caps,
        pricing: { input: 0, output: 0 },
        description: 'Local LM Studio model',
      };
    });
  } catch (error: unknown) {
    const code =
      (error as NodeJS.ErrnoException)?.cause &&
      typeof (error as NodeJS.ErrnoException).cause === 'object'
        ? ((error as NodeJS.ErrnoException).cause as NodeJS.ErrnoException).code
        : (error as NodeJS.ErrnoException).code;
    if (
      code === 'ECONNREFUSED' ||
      (error instanceof DOMException && error.name === 'TimeoutError')
    ) {
      // LM Studio isn't running — silently return empty
      return [];
    }
    console.warn('LM Studio not accessible:', (error as Error).message || error);
    return [];
  }
}

function formatLMStudioModelName(modelId: string): string {
  const parts = modelId.split('/');
  const baseName = parts[parts.length - 1] || modelId;
  return (
    baseName
      .replace(/\.gguf$/i, '')
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ') + ' (Local)'
  );
}

// ============================================================================
// Main Fetcher with Caching
// ============================================================================

export async function fetchModelsForProvider(
  provider: ProviderId,
  apiKey?: string
): Promise<ProviderModelsResult> {
  // Check cache first (skip cache for local providers as they change frequently)
  if (provider !== 'ollama' && provider !== 'lmstudio') {
    const cacheKey = MODELS_CACHE_KEY(provider);
    const cached = await getFromCache<ModelConfig[]>(cacheKey);

    if (cached) {
      return {
        provider,
        models: cached,
        fromCache: true,
      };
    }
  }

  // Fetch from API
  let models: ModelConfig[];

  try {
    switch (provider) {
      case 'openrouter':
        if (!apiKey) {
          return { provider, models: OPENROUTER_MODELS, fromCache: false };
        }
        models = await fetchOpenRouterModels(apiKey);
        break;

      case 'openai':
        if (!apiKey) {
          return { provider, models: OPENAI_MODELS, fromCache: false };
        }
        models = await fetchOpenAIModels(apiKey);
        break;

      case 'google':
        if (!apiKey) {
          return { provider, models: GOOGLE_MODELS, fromCache: false };
        }
        models = await fetchGoogleModels(apiKey);
        break;

      case 'xai':
        if (!apiKey) {
          return { provider, models: XAI_MODELS, fromCache: false };
        }
        models = await fetchXAIModels(apiKey);
        break;

      case 'anthropic':
        // Anthropic doesn't have a public models list API
        // Always return hardcoded models
        return { provider, models: ANTHROPIC_MODELS, fromCache: false };

      case 'ollama':
        // Fetch from local Ollama instance
        models = await fetchOllamaModels();
        return { provider, models, fromCache: false };

      case 'lmstudio':
        // Fetch from local LM Studio instance
        models = await fetchLMStudioModels();
        return { provider, models, fromCache: false };

      default:
        return { provider, models: [], fromCache: false, error: `Unknown provider: ${provider}` };
    }

    // Cache the results (only for cloud providers)
    const cacheKey = MODELS_CACHE_KEY(provider);
    await setInCache(cacheKey, models, { ttl: MODELS_CACHE_TTL });

    return { provider, models, fromCache: false };
  } catch (error) {
    console.error(`Failed to fetch models for ${provider}:`, error);
    return {
      provider,
      models: getFallbackModels(provider),
      fromCache: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function getFallbackModels(provider: ProviderId): ModelConfig[] {
  switch (provider) {
    case 'openai':
      return OPENAI_MODELS;
    case 'anthropic':
      return ANTHROPIC_MODELS;
    case 'google':
      return GOOGLE_MODELS;
    case 'xai':
      return XAI_MODELS;
    case 'openrouter':
      return OPENROUTER_MODELS;
    case 'ollama':
      return OLLAMA_MODELS;
    case 'lmstudio':
      return LMSTUDIO_MODELS;
    default:
      return [];
  }
}

// ============================================================================
// Fetch All Providers
// ============================================================================

export async function fetchAllModels(
  apiKeys: Partial<Record<ProviderId, string>>
): Promise<Record<ProviderId, ProviderModelsResult>> {
  // Include both cloud and local providers
  const providers: ProviderId[] = [
    'openai',
    'anthropic',
    'google',
    'xai',
    'openrouter',
    'ollama',
    'lmstudio',
  ];

  const results = await Promise.all(
    providers.map((provider) => fetchModelsForProvider(provider, apiKeys[provider]))
  );

  // Filter out local providers with no models (not running)
  const filteredResults = results.filter((result) => {
    // Always include cloud providers
    if (result.provider !== 'ollama' && result.provider !== 'lmstudio') {
      return true;
    }
    // Only include local providers if they have models
    return result.models.length > 0;
  });

  return Object.fromEntries(filteredResults.map((result) => [result.provider, result])) as Record<
    ProviderId,
    ProviderModelsResult
  >;
}
