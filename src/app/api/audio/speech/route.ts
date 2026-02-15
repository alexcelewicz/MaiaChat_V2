/**
 * Text-to-Speech API
 *
 * POST /api/audio/speech
 * Converts text to speech using OpenAI's TTS API.
 *
 * Request body:
 * {
 *   text: string,       // Required: Text to convert (max 4096 chars)
 *   voice?: string,     // Optional: alloy, echo, fable, onyx, nova, shimmer
 *   speed?: number,     // Optional: 0.25 to 4.0
 *   format?: string,    // Optional: mp3, opus, aac, flac (default: mp3)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getUserApiKeys } from '@/lib/ai/get-user-keys';

const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const VALID_FORMATS = ['mp3', 'opus', 'aac', 'flac'];

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { text, voice = 'alloy', speed = 1.0, format = 'mp3' } = body;

        // Validate text
        if (!text || typeof text !== 'string') {
            return NextResponse.json(
                { error: 'Text is required' },
                { status: 400 }
            );
        }

        if (text.length > 4096) {
            return NextResponse.json(
                { error: 'Text must be 4096 characters or less' },
                { status: 400 }
            );
        }

        // Validate voice
        if (!VALID_VOICES.includes(voice)) {
            return NextResponse.json(
                { error: `Invalid voice. Must be one of: ${VALID_VOICES.join(', ')}` },
                { status: 400 }
            );
        }

        // Validate speed
        if (typeof speed !== 'number' || speed < 0.25 || speed > 4.0) {
            return NextResponse.json(
                { error: 'Speed must be between 0.25 and 4.0' },
                { status: 400 }
            );
        }

        // Validate format
        if (!VALID_FORMATS.includes(format)) {
            return NextResponse.json(
                { error: `Invalid format. Must be one of: ${VALID_FORMATS.join(', ')}` },
                { status: 400 }
            );
        }

        // Get API key
        const apiKeys = await getUserApiKeys(user.id);
        const openaiKey = apiKeys.openai || process.env.OPENAI_API_KEY;
        const xaiKey = apiKeys.xai || process.env.XAI_API_KEY || process.env.GROK_API_KEY;

        let apiKey: string | undefined;
        let baseUrl: string;

        if (openaiKey) {
            apiKey = openaiKey;
            baseUrl = 'https://api.openai.com/v1';
        } else if (xaiKey) {
            apiKey = xaiKey;
            baseUrl = 'https://api.x.ai/v1';
        } else {
            return NextResponse.json(
                { error: 'No TTS API key configured. Add OpenAI or xAI key in Settings.' },
                { status: 400 }
            );
        }

        // Call TTS API
        const response = await fetch(`${baseUrl}/audio/speech`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'tts-1',
                input: text,
                voice,
                speed,
                response_format: format,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Speech API] TTS error:', errorText);
            return NextResponse.json(
                { error: `Speech generation failed: ${response.statusText}` },
                { status: response.status }
            );
        }

        // Return audio as base64
        const audioBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString('base64');

        const mimeTypes: Record<string, string> = {
            mp3: 'audio/mp3',
            opus: 'audio/opus',
            aac: 'audio/aac',
            flac: 'audio/flac',
        };

        return NextResponse.json({
            success: true,
            audio: {
                base64: base64Audio,
                dataUrl: `data:${mimeTypes[format]};base64,${base64Audio}`,
                format,
                mimeType: mimeTypes[format],
            },
            metadata: {
                textLength: text.length,
                voice,
                speed,
            },
        });
    } catch (error) {
        console.error('[Speech API] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Speech generation failed' },
            { status: 500 }
        );
    }
}
