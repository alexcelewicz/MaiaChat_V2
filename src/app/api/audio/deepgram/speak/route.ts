/**
 * Deepgram TTS Proxy
 *
 * POST /api/audio/deepgram/speak
 * Proxies text-to-speech requests to Deepgram's REST API server-side
 * to avoid browser CORS restrictions.
 *
 * Request body:
 * {
 *   text: string,
 *   voice?: string,   // e.g. "aura-asteria-en"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";

export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { text, voice = "aura-asteria-en" } = body;

        if (!text || typeof text !== "string") {
            return NextResponse.json(
                { error: "Text is required" },
                { status: 400 }
            );
        }

        if (text.length > 4096) {
            return NextResponse.json(
                { error: "Text must be 4096 characters or less" },
                { status: 400 }
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

        const model = voice.startsWith("aura-") ? voice : `aura-${voice}`;
        const params = new URLSearchParams({
            model,
            encoding: "mp3",
        });

        const response = await fetch(
            `https://api.deepgram.com/v1/speak?${params.toString()}`,
            {
                method: "POST",
                headers: {
                    Authorization: `Token ${deepgramKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ text }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text().catch(() => "Unknown error");
            console.error("[Deepgram TTS Proxy] Error:", response.status, errorText);
            return NextResponse.json(
                { error: `Deepgram TTS failed (${response.status}): ${errorText}` },
                { status: response.status }
            );
        }

        const audioBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString("base64");

        return NextResponse.json({
            success: true,
            audio: {
                base64: base64Audio,
                dataUrl: `data:audio/mp3;base64,${base64Audio}`,
                format: "mp3",
                mimeType: "audio/mp3",
            },
        });
    } catch (error) {
        console.error("[Deepgram TTS Proxy] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "TTS failed" },
            { status: 500 }
        );
    }
}
