/**
 * Deepgram Token Endpoint
 *
 * POST /api/audio/deepgram/token
 * Returns the user's Deepgram API key for client-side WebSocket usage.
 */

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";

export async function POST() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const apiKeys = await getUserApiKeys(userId);
        const deepgramKey = (apiKeys as Record<string, string>).deepgram;

        if (!deepgramKey) {
            return NextResponse.json(
                { error: "No Deepgram API key configured. Add it in Settings." },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            apiKey: deepgramKey,
        });
    } catch (error) {
        console.error("[Deepgram Token] Error:", error);
        return NextResponse.json(
            { error: "Failed to retrieve Deepgram API key" },
            { status: 500 }
        );
    }
}
