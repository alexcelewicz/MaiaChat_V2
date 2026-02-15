/**
 * Deepgram Streaming STT Client
 *
 * Uses raw WebSocket to connect to Deepgram's real-time speech-to-text API.
 * No npm dependencies required - uses browser-native WebSocket and MediaRecorder.
 *
 * NOTE: We send audio in WebM/Opus container format. Deepgram auto-detects
 * the encoding from container headers. Do NOT specify encoding/sample_rate
 * params — those are only for raw/headerless audio streams.
 */

export interface DeepgramSTTOptions {
    apiKey: string;
    model?: string;
    language?: string;
    onInterimTranscript?: (text: string, isFinal: boolean) => void;
    onFinalTranscript?: (text: string) => void;
    onUtteranceEnd?: () => void;
    onSpeechStarted?: () => void;
    onError?: (error: string) => void;
}

export function createDeepgramSTT(options: DeepgramSTTOptions) {
    const {
        apiKey,
        model = "nova-3",
        language = "en",
        onInterimTranscript,
        onFinalTranscript,
        onUtteranceEnd,
        onSpeechStarted,
        onError,
    } = options;

    let ws: WebSocket | null = null;
    let mediaRecorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;
    let destroyed = false;
    let finalTranscript = "";
    let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

    // Do NOT include encoding/sample_rate — Deepgram auto-detects from WebM container
    const params = new URLSearchParams({
        model,
        language,
        smart_format: "true",
        interim_results: "true",
        endpointing: "800",
        utterance_end_ms: "2000",
        vad_events: "true",
    });

    const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    console.log("[Deepgram STT] Connecting to:", wsUrl);

    // Connect WebSocket
    ws = new WebSocket(wsUrl, ["token", apiKey]);

    ws.onopen = async () => {
        if (destroyed) return;
        console.log("[Deepgram STT] WebSocket connected, starting microphone...");

        // Send KeepAlive heartbeats to prevent Deepgram timeout (net0001)
        // while mic initializes or between audio chunks
        keepAliveInterval = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "KeepAlive" }));
            }
        }, 8000);

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            // Use WebM/Opus container — Deepgram auto-detects encoding
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : "audio/webm";

            console.log("[Deepgram STT] Using MIME type:", mimeType);

            mediaRecorder = new MediaRecorder(stream, { mimeType });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && ws?.readyState === WebSocket.OPEN) {
                    ws.send(event.data);
                }
            };

            mediaRecorder.start(250); // Send chunks every 250ms for better framing
            console.log("[Deepgram STT] Recording started");
        } catch (err) {
            console.error("[Deepgram STT] Microphone error:", err);
            onError?.(err instanceof Error ? err.message : "Failed to access microphone");
        }
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === "Results") {
                const transcript = data.channel?.alternatives?.[0]?.transcript || "";
                const isFinal = data.is_final;

                if (transcript) {
                    console.log(`[Deepgram STT] ${isFinal ? "FINAL" : "interim"}: "${transcript}"`);
                    if (isFinal) {
                        finalTranscript += (finalTranscript ? " " : "") + transcript;
                        onInterimTranscript?.(transcript, true);
                    } else {
                        onInterimTranscript?.(transcript, false);
                    }
                }
            } else if (data.type === "UtteranceEnd") {
                console.log("[Deepgram STT] Utterance end, accumulated:", finalTranscript);
                if (finalTranscript.trim()) {
                    onFinalTranscript?.(finalTranscript.trim());
                    finalTranscript = "";
                }
                onUtteranceEnd?.();
            } else if (data.type === "SpeechStarted") {
                console.log("[Deepgram STT] SpeechStarted");
                onSpeechStarted?.();
            } else if (data.type === "Metadata") {
                console.log("[Deepgram STT] Metadata received:", data.model_info?.name || "unknown model");
            }
        } catch {
            // Ignore parse errors for non-JSON messages
        }
    };

    ws.onerror = (event) => {
        console.error("[Deepgram STT] WebSocket error:", event);
        onError?.("Deepgram WebSocket error");
    };

    ws.onclose = (event) => {
        console.log(`[Deepgram STT] WebSocket closed: code=${event.code}, reason="${event.reason}"`);
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }
        if (!destroyed && event.code !== 1000) {
            onError?.(`Deepgram connection closed: ${event.reason || `code ${event.code}`}`);
        }
    };

    return {
        stop() {
            console.log("[Deepgram STT] Stopping...");
            if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
            }
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
            }
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "CloseStream" }));
            }
            if (finalTranscript.trim()) {
                onFinalTranscript?.(finalTranscript.trim());
                finalTranscript = "";
            }
        },
        destroy() {
            console.log("[Deepgram STT] Destroying...");
            destroyed = true;
            if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
            }
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
            }
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
                stream = null;
            }
            if (ws) {
                ws.close();
                ws = null;
            }
            mediaRecorder = null;
        },
    };
}
