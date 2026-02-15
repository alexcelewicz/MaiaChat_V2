/**
 * Text-to-Speech Plugin
 *
 * Converts text to speech audio using OpenAI's TTS API or xAI's TTS API.
 * Supports multiple voices and adjustable speed.
 */

import { Plugin, PluginManifest, PluginContext, PluginExecutionResult } from '../runtime';

export class TTSPlugin extends Plugin {
    manifest: PluginManifest = {
        name: 'Text to Speech',
        slug: 'tts',
        version: '1.0.0',
        description: 'Convert text to speech audio',
        author: 'MaiaChat',
        icon: '🔊',
        category: 'utility',
        permissions: ['api_calls'],
        configSchema: {
            voice: {
                type: 'select',
                label: 'Default Voice',
                description: 'The default voice to use for TTS',
                default: 'alloy',
                options: [
                    { value: 'alloy', label: 'Alloy' },
                    { value: 'echo', label: 'Echo' },
                    { value: 'fable', label: 'Fable' },
                    { value: 'onyx', label: 'Onyx' },
                    { value: 'nova', label: 'Nova' },
                    { value: 'shimmer', label: 'Shimmer' },
                ],
            },
            speed: {
                type: 'number',
                label: 'Speed',
                description: 'Speech speed (0.25 to 4.0)',
                default: 1.0,
            },
        },
        tools: [
            {
                name: 'speak',
                description: 'Convert text to speech audio. Returns audio as base64 encoded MP3.',
                parameters: {
                    type: 'object',
                    properties: {
                        text: {
                            type: 'string',
                            description: 'The text to convert to speech (max 4096 characters)',
                        },
                        voice: {
                            type: 'string',
                            description: 'Voice to use: alloy, echo, fable, onyx, nova, or shimmer',
                            enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
                        },
                        speed: {
                            type: 'number',
                            description: 'Speech speed (0.25 to 4.0, default 1.0)',
                        },
                    },
                    required: ['text'],
                },
            },
        ],
    };

    async execute(
        toolName: string,
        args: Record<string, unknown>,
        context: PluginContext
    ): Promise<PluginExecutionResult> {
        if (toolName !== 'speak') {
            return { success: false, error: `Unknown tool: ${toolName}` };
        }

        const text = args.text as string;
        const voice = (args.voice as string) || (context.config.voice as string) || 'alloy';
        const speed = (args.speed as number) || (context.config.speed as number) || 1.0;

        // Validate text length
        if (!text || text.length === 0) {
            return { success: false, error: 'Text is required' };
        }

        if (text.length > 4096) {
            return { success: false, error: 'Text must be 4096 characters or less' };
        }

        // Validate speed
        if (speed < 0.25 || speed > 4.0) {
            return { success: false, error: 'Speed must be between 0.25 and 4.0' };
        }

        try {
            const result = await this.generateSpeech(text, voice, speed);
            return result;
        } catch (error) {
            console.error('[TTS Plugin] Error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'TTS generation failed',
            };
        }
    }

    private async generateSpeech(
        text: string,
        voice: string,
        speed: number
    ): Promise<PluginExecutionResult> {
        // Try OpenAI first, then xAI
        const openaiKey = process.env.OPENAI_API_KEY;
        const xaiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;

        let apiKey: string | undefined;
        let baseUrl: string;
        let model: string;

        if (openaiKey) {
            apiKey = openaiKey;
            baseUrl = 'https://api.openai.com/v1';
            model = 'tts-1';
        } else if (xaiKey) {
            apiKey = xaiKey;
            baseUrl = 'https://api.x.ai/v1';
            model = 'tts-1'; // xAI uses same model name
        } else {
            return {
                success: false,
                error: 'No TTS API key configured. Add OPENAI_API_KEY or XAI_API_KEY to enable TTS.',
            };
        }

        const response = await fetch(`${baseUrl}/audio/speech`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                input: text,
                voice,
                speed,
                response_format: 'mp3',
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`TTS API error: ${response.status} - ${errorText}`);
        }

        const audioBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString('base64');
        const audioDataUrl = `data:audio/mp3;base64,${base64Audio}`;

        return {
            success: true,
            output: `Generated speech for: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`,
            data: {
                audioUrl: audioDataUrl,
                audioBase64: base64Audio,
                voice,
                speed,
                textLength: text.length,
                format: 'mp3',
            },
            metadata: {
                audioUrl: audioDataUrl,
            },
        };
    }
}
