/**
 * GET /api/models/local - Discover locally available models
 *
 * Checks for Ollama and LM Studio availability and returns discovered models.
 */

import { NextResponse } from "next/server";
import { discoverOllamaModels, isOllamaRunning } from "@/lib/ai/providers/ollama";
import { discoverLMStudioModels, isLMStudioRunning } from "@/lib/ai/providers/lmstudio";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        // Check availability in parallel
        const [ollamaRunning, lmstudioRunning] = await Promise.all([
            isOllamaRunning(),
            isLMStudioRunning(),
        ]);

        // Discover models from running services
        const [ollamaModels, lmstudioModels] = await Promise.all([
            ollamaRunning ? discoverOllamaModels() : Promise.resolve([]),
            lmstudioRunning ? discoverLMStudioModels() : Promise.resolve([]),
        ]);

        return NextResponse.json({
            ollama: {
                available: ollamaRunning,
                models: ollamaModels,
                url: "http://127.0.0.1:11434",
            },
            lmstudio: {
                available: lmstudioRunning,
                models: lmstudioModels,
                url: "http://127.0.0.1:1234",
            },
        });
    } catch (error) {
        console.error("[API] Local models discovery error:", error);
        return NextResponse.json(
            {
                error: "Failed to discover local models",
                ollama: { available: false, models: [], url: "http://127.0.0.1:11434" },
                lmstudio: { available: false, models: [], url: "http://127.0.0.1:1234" },
            },
            { status: 200 } // Return 200 with error info rather than 500
        );
    }
}
