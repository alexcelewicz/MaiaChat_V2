/**
 * Speech-to-Text Plugin
 *
 * Transcribes audio to text using OpenAI's Whisper API.
 * Supports multiple audio formats and languages.
 */

import { Plugin, PluginManifest, PluginContext, PluginExecutionResult } from '../runtime';

export class STTPlugin extends Plugin {
    manifest: PluginManifest = {
        name: 'Speech to Text',
        slug: 'stt',
        version: '1.0.0',
        description: 'Transcribe audio to text using Whisper',
        author: 'MaiaChat',
        icon: '🎤',
        category: 'utility',
        permissions: ['api_calls'],
        configSchema: {
            language: {
                type: 'string',
                label: 'Language',
                description: 'ISO language code (e.g., en, es, fr). Leave empty for auto-detection.',
                default: '',
            },
        },
        tools: [
            {
                name: 'transcribe',
                description: 'Transcribe audio to text. Accepts audio URL or base64 encoded audio.',
                parameters: {
                    type: 'object',
                    properties: {
                        audioUrl: {
                            type: 'string',
                            description: 'URL to the audio file or base64 data URL',
                        },
                        language: {
                            type: 'string',
                            description: 'ISO language code (e.g., en, es, fr). Optional.',
                        },
                    },
                    required: ['audioUrl'],
                },
            },
        ],
    };

    async execute(
        toolName: string,
        args: Record<string, unknown>,
        context: PluginContext
    ): Promise<PluginExecutionResult> {
        if (toolName !== 'transcribe') {
            return { success: false, error: `Unknown tool: ${toolName}` };
        }

        const audioUrl = args.audioUrl as string;
        const language = (args.language as string) || (context.config.language as string) || undefined;

        if (!audioUrl) {
            return { success: false, error: 'Audio URL is required' };
        }

        try {
            const result = await this.transcribeAudio(audioUrl, language);
            return result;
        } catch (error) {
            console.error('[STT Plugin] Error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Transcription failed',
            };
        }
    }

    private async transcribeAudio(
        audioUrl: string,
        language?: string
    ): Promise<PluginExecutionResult> {
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            return {
                success: false,
                error: 'OPENAI_API_KEY is required for speech-to-text transcription.',
            };
        }

        // Handle base64 data URL or fetch from URL
        let audioBlob: Blob;
        let filename = 'audio.mp3';

        if (audioUrl.startsWith('data:')) {
            // Parse data URL
            const matches = audioUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
                return { success: false, error: 'Invalid audio data URL' };
            }

            const mimeType = matches[1];
            const base64Data = matches[2];
            const binaryData = Buffer.from(base64Data, 'base64');
            audioBlob = new Blob([binaryData], { type: mimeType });

            // Determine extension from mime type
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
            // Fetch from URL
            const response = await fetch(audioUrl);
            if (!response.ok) {
                return { success: false, error: `Failed to fetch audio: ${response.statusText}` };
            }
            audioBlob = await response.blob();

            // Try to determine extension from URL
            const urlPath = new URL(audioUrl).pathname;
            const ext = urlPath.split('.').pop();
            if (ext && ['mp3', 'mp4', 'm4a', 'wav', 'webm', 'ogg'].includes(ext)) {
                filename = `audio.${ext}`;
            }
        }

        // Create form data
        const formData = new FormData();
        formData.append('file', audioBlob, filename);
        formData.append('model', 'whisper-1');

        if (language) {
            formData.append('language', language);
        }

        // Call Whisper API
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const text = result.text as string;

        return {
            success: true,
            output: text,
            data: {
                text,
                language: language || 'auto-detected',
            },
        };
    }
}

// ============================================================================
// Standalone Transcription Function (for use outside plugin system)
// ============================================================================

/**
 * Transcribe audio from URL or base64
 * Can be used directly without going through plugin system
 */
export async function transcribeAudio(
    audioUrl: string,
    apiKey?: string,
    language?: string
): Promise<{ text: string; error?: string }> {
    const key = apiKey || process.env.OPENAI_API_KEY;

    if (!key) {
        return { text: '', error: 'OPENAI_API_KEY is required' };
    }

    try {
        // Handle base64 data URL or fetch from URL
        let audioBlob: Blob;
        let filename = 'audio.mp3';

        if (audioUrl.startsWith('data:')) {
            const matches = audioUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
                return { text: '', error: 'Invalid audio data URL' };
            }

            const mimeType = matches[1];
            const base64Data = matches[2];
            const binaryData = Buffer.from(base64Data, 'base64');
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
            const response = await fetch(audioUrl);
            if (!response.ok) {
                return { text: '', error: `Failed to fetch audio: ${response.statusText}` };
            }
            audioBlob = await response.blob();

            const urlPath = new URL(audioUrl).pathname;
            const ext = urlPath.split('.').pop();
            if (ext && ['mp3', 'mp4', 'm4a', 'wav', 'webm', 'ogg'].includes(ext)) {
                filename = `audio.${ext}`;
            }
        }

        const formData = new FormData();
        formData.append('file', audioBlob, filename);
        formData.append('model', 'whisper-1');

        if (language) {
            formData.append('language', language);
        }

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { text: '', error: `Whisper API error: ${response.status} - ${errorText}` };
        }

        const result = await response.json();
        return { text: result.text };
    } catch (error) {
        return {
            text: '',
            error: error instanceof Error ? error.message : 'Transcription failed',
        };
    }
}
