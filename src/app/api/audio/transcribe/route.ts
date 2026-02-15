/**
 * Audio Transcription API
 *
 * POST /api/audio/transcribe
 * Transcribes audio to text using OpenAI's Whisper API.
 *
 * Accepts:
 * - multipart/form-data with 'audio' file
 * - application/json with { audioUrl: string } or { audioBase64: string, mimeType: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getUserApiKeys } from '@/lib/ai/get-user-keys';

// Whisper accepts max 25MB; reject oversized payloads before decoding
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_AUDIO_BYTES * 1.4);

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Get user's API key or fall back to environment variable
        const apiKeys = await getUserApiKeys(user.id);
        const apiKey = apiKeys.openai || process.env.OPENAI_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { error: 'OpenAI API key not configured. Add it in Settings or set OPENAI_API_KEY.' },
                { status: 400 }
            );
        }

        let audioBlob: Blob;
        let filename = 'audio.mp3';
        let language: string | undefined;

        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('multipart/form-data')) {
            // Handle file upload
            const formData = await request.formData();
            const audioFile = formData.get('audio') as File;
            language = formData.get('language') as string | undefined;

            if (!audioFile) {
                return NextResponse.json(
                    { error: 'No audio file provided' },
                    { status: 400 }
                );
            }

            // Enforce size limit on multipart uploads (same as base64 paths)
            if (audioFile.size > MAX_AUDIO_BYTES) {
                return NextResponse.json(
                    { error: 'Audio exceeds 25MB limit' },
                    { status: 400 }
                );
            }
            audioBlob = audioFile;
            filename = audioFile.name || 'audio.mp3';
        } else {
            // Handle JSON with URL or base64
            const body = await request.json();

            if (body.audioUrl) {
                // Fetch from URL
                if (body.audioUrl.startsWith('data:')) {
                    // Parse data URL
                    // Regex update: Allow parameters in mime type (e.g. audio/webm;codecs=opus)
                    const matches = body.audioUrl.match(/^data:(.*?);base64,(.+)$/);
                    if (!matches) {
                        return NextResponse.json(
                            { error: 'Invalid audio data URL' },
                            { status: 400 }
                        );
                    }

                    const mimeType = matches[1];
                    const base64Data = matches[2];
                    if (base64Data.length > MAX_BASE64_LENGTH) {
                        return NextResponse.json(
                            { error: 'Audio exceeds 25MB limit' },
                            { status: 400 }
                        );
                    }
                    const binaryData = Buffer.from(base64Data, 'base64');

                    // Strip codec parameters (e.g. "audio/webm;codecs=opus" → "audio/webm")
                    // Whisper API rejects MIME types with codec params
                    const baseMimeType = mimeType.split(';')[0].trim();
                    audioBlob = new Blob([binaryData], { type: baseMimeType });
                    const extMap: Record<string, string> = {
                        'audio/mp3': 'mp3',
                        'audio/mpeg': 'mp3',
                        'audio/mp4': 'm4a',
                        'audio/wav': 'wav',
                        'audio/webm': 'webm',
                        'audio/ogg': 'ogg',
                    };
                    filename = `audio.${extMap[baseMimeType] || 'webm'}`;
                } else {
                    // Fetch from external URL — validate before fetching
                    let fetchUrl: URL;
                    try {
                        fetchUrl = new URL(body.audioUrl);
                    } catch {
                        return NextResponse.json(
                            { error: 'Invalid audio URL' },
                            { status: 400 }
                        );
                    }
                    if (fetchUrl.protocol !== 'http:' && fetchUrl.protocol !== 'https:') {
                        return NextResponse.json(
                            { error: 'Only HTTP/HTTPS audio URLs are supported' },
                            { status: 400 }
                        );
                    }
                    const response = await fetch(body.audioUrl, { redirect: 'error' });
                    if (!response.ok) {
                        return NextResponse.json(
                            { error: `Failed to fetch audio: ${response.statusText}` },
                            { status: 400 }
                        );
                    }
                    // Reject oversized responses before reading into memory
                    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
                    if (contentLength > MAX_AUDIO_BYTES) {
                        return NextResponse.json(
                            { error: 'Audio exceeds 25MB limit' },
                            { status: 400 }
                        );
                    }
                    audioBlob = await response.blob();
                    if (audioBlob.size > MAX_AUDIO_BYTES) {
                        return NextResponse.json(
                            { error: 'Audio exceeds 25MB limit' },
                            { status: 400 }
                        );
                    }
                }
            } else if (body.audioBase64) {
                // Handle base64 with separate mimeType
                if (typeof body.audioBase64 === 'string' && body.audioBase64.length > MAX_BASE64_LENGTH) {
                    return NextResponse.json(
                        { error: 'Audio exceeds 25MB limit' },
                        { status: 400 }
                    );
                }
                const mimeType = body.mimeType || 'audio/mp3';
                const binaryData = Buffer.from(body.audioBase64, 'base64');
                audioBlob = new Blob([binaryData], { type: mimeType });

                const extMap: Record<string, string> = {
                    'audio/mp3': 'mp3',
                    'audio/mpeg': 'mp3',
                    'audio/mp4': 'm4a',
                    'audio/wav': 'wav',
                    'audio/webm': 'webm',
                    'audio/ogg': 'ogg',
                };
                filename = `audio.${extMap[mimeType] || 'mp3'}`;
            } else {
                return NextResponse.json(
                    { error: 'No audio provided. Send audioUrl or audioBase64.' },
                    { status: 400 }
                );
            }

            language = body.language;
        }

        // Reject audio that's too small to be valid (corrupted or empty WebM containers)
        if (audioBlob.size < 2048) {
            console.warn(`[Transcribe API] Audio too small (${audioBlob.size} bytes), skipping`);
            return NextResponse.json(
                { error: 'Audio too short to transcribe' },
                { status: 400 }
            );
        }

        // Strip codec params from MIME type for Whisper compatibility
        // e.g. "audio/webm;codecs=opus" → "audio/webm"
        const cleanMimeType = (audioBlob.type || 'audio/webm').split(';')[0].trim();
        const audioFile = new File([audioBlob], filename, { type: cleanMimeType });

        // Create form data for Whisper API
        const whisperFormData = new FormData();
        whisperFormData.append('file', audioFile);
        whisperFormData.append('model', 'whisper-1');
        // Prompt helps reduce Whisper hallucinations on silence/noise
        whisperFormData.append('prompt', 'Conversational voice chat transcription.');

        if (language) {
            whisperFormData.append('language', language);
        }

        // Call Whisper API
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            body: whisperFormData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Transcribe API] Whisper error:', errorText);
            return NextResponse.json(
                { error: `Transcription failed: ${response.statusText}` },
                { status: response.status }
            );
        }

        const result = await response.json();
        const transcribedText = (result.text || '').trim();

        // Filter known Whisper hallucination patterns (produced when given silence/noise)
        const hallucinations = [
            'thank you for watching',
            'thanks for watching',
            'subscribe',
            'please post them in the comments',
            'if you have any questions',
            'thank you for your attention',
            'like and subscribe',
            'see you next time',
            'see you in the next video',
        ];
        const lowerText = transcribedText.toLowerCase();
        const isHallucination = hallucinations.some(h => lowerText.includes(h));

        if (!transcribedText || isHallucination) {
            console.log(`[Transcribe API] Filtered: "${transcribedText}" (hallucination: ${isHallucination})`);
            return NextResponse.json({
                success: true,
                text: '',
                language: language || 'auto-detected',
                filtered: true,
            });
        }

        return NextResponse.json({
            success: true,
            text: transcribedText,
            language: language || 'auto-detected',
        });
    } catch (error) {
        console.error('[Transcribe API] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Transcription failed' },
            { status: 500 }
        );
    }
}
