import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel as LanguageModelV1 } from 'ai';
import type { AIProvider, ModelConfig, ProviderConfig } from './types';
import { PROVIDERS, OPENROUTER_MODELS } from '../models';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Custom fetch wrapper to add OpenRouter-specific headers
function createOpenRouterFetch(apiKey: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Add OpenRouter-specific headers
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${apiKey}`);
    headers.set('HTTP-Referer', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    headers.set('X-Title', 'MAIAChat');

    return fetch(input, {
      ...init,
      headers,
    });
  };
}

class OpenRouterProvider implements AIProvider {
  id = 'openrouter' as const;
  config: ProviderConfig;
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.config = PROVIDERS.openrouter!;
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY;
  }

  getModel(modelId: string): LanguageModelV1 {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key is required');
    }

    // Strip "openrouter/" prefix — OpenRouter model IDs use org/model format
    // (e.g. "anthropic/claude-3.5-sonnet"), not "openrouter/model"
    const resolvedId = modelId.startsWith('openrouter/')
      ? modelId.slice('openrouter/'.length)
      : modelId;

    // Use OpenAI SDK with .chat() to force Chat Completions API (not Responses API)
    // OpenRouter only supports the classic Chat Completions API
    const provider = createOpenAI({
      apiKey: this.apiKey,
      baseURL: OPENROUTER_BASE_URL,
      fetch: createOpenRouterFetch(this.apiKey),
    });

    // Use .chat() to force Chat Completions API instead of Responses API
    // OpenRouter supports ~350 models - trust the model ID and let OpenRouter validate
    return provider.chat(resolvedId);
  }

  isConfigured(): boolean {
    return !!this.apiKey || !!process.env.OPENROUTER_API_KEY;
  }

  supportsModel(modelId: string): boolean {
    const resolvedId = modelId.startsWith('openrouter/')
      ? modelId.slice('openrouter/'.length)
      : modelId;
    // OpenRouter supports hundreds of models dynamically
    // Check hardcoded list first, but also accept any model ID
    // OpenRouter will return an error if the model doesn't exist
    if (OPENROUTER_MODELS.some((m) => m.id === resolvedId)) {
      return true;
    }
    // Accept any model ID that looks like an OpenRouter model (provider/model format)
    return resolvedId.includes('/');
  }

  getModelConfig(modelId: string): ModelConfig | undefined {
    // Strip "openrouter/" prefix — OpenRouter IDs use org/model format
    const resolvedId = modelId.startsWith('openrouter/')
      ? modelId.slice('openrouter/'.length)
      : modelId;

    // Return hardcoded config if available
    const hardcoded = OPENROUTER_MODELS.find((m) => m.id === resolvedId);
    if (hardcoded) return hardcoded;

    // Return a dynamic config for unknown models
    if (resolvedId.includes('/')) {
      return {
        id: resolvedId,
        name: resolvedId.split('/').pop() || resolvedId,
        provider: 'openrouter',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        capabilities: ['text', 'streaming'],
        pricing: { input: 0, output: 0 },
        description: `${resolvedId} via OpenRouter`,
      };
    }

    return undefined;
  }
}

// Export singleton instance for default usage
export const openrouterProvider = new OpenRouterProvider();

// Export factory function for custom API keys
export function createOpenRouterProvider(apiKey?: string): AIProvider {
  return new OpenRouterProvider(apiKey);
}
