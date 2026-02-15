import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import { fetchModelsForProvider, fetchAllModels } from "@/lib/ai/model-fetcher";
import { getAllModels } from "@/lib/ai/models";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import type { ProviderId } from "@/lib/ai/providers/types";

// GET /api/models - Get available models
export async function GET(request: Request) {
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

        const { searchParams } = new URL(request.url);
        const provider = searchParams.get("provider") as ProviderId | null;
        const refresh = searchParams.get("refresh") === "true";

        // Get user's API keys for fetching
        const userApiKeys = await getUserApiKeys(userId);

        if (provider) {
            // Fetch models for a specific provider
            const result = await fetchModelsForProvider(
                provider,
                userApiKeys[provider]
            );

            return NextResponse.json({
                success: true,
                provider,
                models: result.models,
                fromCache: result.fromCache,
                modelCount: result.models.length,
                error: result.error,
            });
        }

        // Fetch models for all providers
        const results = await fetchAllModels(userApiKeys);

        // Combine all models
        const allModels = Object.values(results).flatMap((r) => r.models);

        // Sort by provider then by name
        allModels.sort((a, b) => {
            if (a.provider !== b.provider) {
                return a.provider.localeCompare(b.provider);
            }
            return a.name.localeCompare(b.name);
        });

        return NextResponse.json({
            success: true,
            models: allModels,
            modelCount: allModels.length,
            byProvider: Object.fromEntries(
                Object.entries(results).map(([provider, result]) => [
                    provider,
                    {
                        count: result.models.length,
                        fromCache: result.fromCache,
                        error: result.error,
                    },
                ])
            ),
        });
    } catch (error) {
        console.error("Models API error:", error);

        // Fallback to hardcoded models on error
        const fallbackModels = getAllModels();

        return NextResponse.json({
            success: true,
            models: fallbackModels,
            modelCount: fallbackModels.length,
            fallback: true,
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
}
