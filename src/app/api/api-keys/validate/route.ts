import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { z } from "zod";
import type { ProviderId } from "@/lib/ai/providers/types";

const VALID_PROVIDERS: ProviderId[] = ["openai", "anthropic", "google", "xai", "perplexity", "openrouter", "ollama", "lmstudio", "deepgram"];

const validateKeySchema = z.object({
    provider: z.enum(VALID_PROVIDERS as [ProviderId, ...ProviderId[]]),
    apiKey: z.string().min(1).max(500), // Allow shorter keys for local providers
});

// Provider-specific validation endpoints
const VALIDATION_ENDPOINTS: Record<ProviderId, { url: string; method: string; headers: (key: string) => Record<string, string> }> = {
    openai: {
        url: "https://api.openai.com/v1/models",
        method: "GET",
        headers: (key) => ({ Authorization: `Bearer ${key}` }),
    },
    anthropic: {
        url: "https://api.anthropic.com/v1/messages",
        method: "POST",
        headers: (key) => ({
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }),
    },
    google: {
        url: "https://generativelanguage.googleapis.com/v1beta/models",
        method: "GET",
        headers: () => ({}), // Key is passed as query param
    },
    xai: {
        url: "https://api.x.ai/v1/models",
        method: "GET",
        headers: (key) => ({ Authorization: `Bearer ${key}` }),
    },
    perplexity: {
        url: "https://api.perplexity.ai/chat/completions",
        method: "POST",
        headers: (key) => ({ Authorization: `Bearer ${key}`, "Content-Type": "application/json" }),
    },
    openrouter: {
        url: "https://openrouter.ai/api/v1/auth/key",
        method: "GET",
        headers: (key) => ({ Authorization: `Bearer ${key}` }),
    },
    ollama: {
        url: "http://127.0.0.1:11434/api/tags",
        method: "GET",
        headers: () => ({}), // Ollama doesn't need authentication
    },
    lmstudio: {
        url: "http://127.0.0.1:1234/v1/models",
        method: "GET",
        headers: () => ({}), // LM Studio doesn't need authentication
    },
    deepgram: {
        url: "https://api.deepgram.com/v1/projects",
        method: "GET",
        headers: (key) => ({ Authorization: `Token ${key}` }),
    },
};

async function validateApiKey(provider: ProviderId, apiKey: string): Promise<{ valid: boolean; error?: string }> {
    const config = VALIDATION_ENDPOINTS[provider];

    if (!config) {
        return { valid: false, error: "Unknown provider" };
    }

    try {
        let url = config.url;
        const options: RequestInit = {
            method: config.method,
            headers: config.headers(apiKey),
        };

        // Special handling for Google - API key as query param
        if (provider === "google") {
            url = `${config.url}?key=${apiKey}`;
        }

        // Special handling for Anthropic - needs a minimal body
        if (provider === "anthropic" && config.method === "POST") {
            options.body = JSON.stringify({
                model: "claude-3-5-haiku-20241022",
                max_tokens: 1,
                messages: [{ role: "user", content: "Hi" }],
            });
        }

        const response = await fetch(url, options);

        // Check response status
        if (response.ok) {
            return { valid: true };
        }

        // Handle specific error cases
        if (response.status === 401 || response.status === 403) {
            return { valid: false, error: "Invalid API key" };
        }

        if (response.status === 429) {
            // Rate limited but key is valid
            return { valid: true };
        }

        // For Anthropic, a 400 error with certain content might still indicate valid key
        if (provider === "anthropic" && response.status === 400) {
            const body = await response.text();
            // If we get a model-related error, the key is valid
            if (body.includes("model") || body.includes("credit")) {
                return { valid: true };
            }
        }

        const errorText = await response.text().catch(() => "Unknown error");
        return { valid: false, error: `Validation failed: ${errorText.slice(0, 100)}` };

    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { valid: false, error: `Connection error: ${message}` };
    }
}

// POST /api/api-keys/validate - Validate an API key without saving
export async function POST(request: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", RATE_LIMITS.api);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.api);
        }

        const body = await request.json();
        const parseResult = validateKeySchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json(
                {
                    error: "Validation failed",
                    code: "VALIDATION_ERROR",
                    details: parseResult.error.flatten().fieldErrors,
                },
                { status: 400 }
            );
        }

        const { provider, apiKey } = parseResult.data;

        // Validate the key
        const result = await validateApiKey(provider, apiKey);

        return NextResponse.json({
            success: true,
            valid: result.valid,
            error: result.error,
        });
    } catch (error) {
        console.error("Validate API key error:", error);
        return NextResponse.json(
            { error: "Validation failed", code: "VALIDATION_FAILED" },
            { status: 500 }
        );
    }
}
