/**
 * Deepgram TTS Client
 *
 * Uses Deepgram REST API for text-to-speech.
 * No npm dependencies - uses browser-native fetch.
 */

export interface DeepgramSpeakOptions {
    apiKey: string;
    voice?: string;
    model?: string;
}

export const DEEPGRAM_VOICES = [
    { id: "aura-asteria-en", name: "Asteria (Female)" },
    { id: "aura-luna-en", name: "Luna (Female)" },
    { id: "aura-stella-en", name: "Stella (Female)" },
    { id: "aura-athena-en", name: "Athena (Female)" },
    { id: "aura-hera-en", name: "Hera (Female)" },
    { id: "aura-orion-en", name: "Orion (Male)" },
    { id: "aura-arcas-en", name: "Arcas (Male)" },
    { id: "aura-perseus-en", name: "Perseus (Male)" },
    { id: "aura-angus-en", name: "Angus (Male)" },
    { id: "aura-orpheus-en", name: "Orpheus (Male)" },
    { id: "aura-helios-en", name: "Helios (Male)" },
    { id: "aura-zeus-en", name: "Zeus (Male)" },
] as const;

export async function deepgramSpeak(
    text: string,
    options: DeepgramSpeakOptions
): Promise<{ audioBlob: Blob; dataUrl: string }> {
    const {
        apiKey,
        voice = "aura-asteria-en",
        model = "aura",
    } = options;

    const params = new URLSearchParams({
        model: voice.startsWith("aura-") ? voice : `${model}-${voice}`,
        encoding: "mp3",
    });

    const response = await fetch(
        `https://api.deepgram.com/v1/speak?${params.toString()}`,
        {
            method: "POST",
            headers: {
                Authorization: `Token ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ text }),
        }
    );

    if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`Deepgram TTS failed (${response.status}): ${errorText}`);
    }

    const audioBlob = await response.blob();
    const dataUrl = URL.createObjectURL(audioBlob);

    return { audioBlob, dataUrl };
}
