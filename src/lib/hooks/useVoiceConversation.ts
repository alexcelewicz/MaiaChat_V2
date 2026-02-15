"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useVoiceRecording } from "./useVoiceRecording";

export type VoiceConversationState =
    | "idle"
    | "listening"
    | "transcribing"
    | "thinking"
    | "speaking";

export type VoiceProvider = "whisper" | "deepgram";

export interface VoiceSettings {
    voice: string;
    speed: number;
    provider: VoiceProvider;
}

export interface UseVoiceConversationOptions {
    onTranscription?: (text: string) => void;
    onError?: (error: string) => void;
    provider?: VoiceProvider;
    voice?: string;
    speed?: number;
    deepgramApiKey?: string;
}

export function useVoiceConversation(options: UseVoiceConversationOptions = {}) {
    const {
        onTranscription,
        onError,
        provider = "deepgram",
        voice = "aura-asteria-en",
        speed = 1.0,
        deepgramApiKey,
    } = options;

    const [conversationState, setConversationState] = useState<VoiceConversationState>("idle");
    const [interimText, setInterimText] = useState("");
    const [isActive, setIsActive] = useState(false);
    const isPausedRef = useRef(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const deepgramSttRef = useRef<{ stop: () => void; destroy: () => void } | null>(null);
    const activeAudioUrlRef = useRef<string | null>(null);
    const ttsQueueRef = useRef<string[]>([]);
    const ttsIsPlayingRef = useRef(false);
    const responseStreamingRef = useRef(false);

    // === Refs for ALL values read in async callbacks (avoids stale closures) ===
    const isActiveRef = useRef(false);
    const onTranscriptionRef = useRef(onTranscription);
    const onErrorRef = useRef(onError);
    const providerRef = useRef(provider);
    const voiceRef = useRef(voice);
    const speedRef = useRef(speed);
    const deepgramApiKeyRef = useRef(deepgramApiKey);

    // Keep refs in sync
    useEffect(() => { onTranscriptionRef.current = onTranscription; }, [onTranscription]);
    useEffect(() => { onErrorRef.current = onError; }, [onError]);
    useEffect(() => { providerRef.current = provider; }, [provider]);
    useEffect(() => { voiceRef.current = voice; }, [voice]);
    useEffect(() => { speedRef.current = speed; }, [speed]);
    useEffect(() => { deepgramApiKeyRef.current = deepgramApiKey; }, [deepgramApiKey]);

    // Whisper-based recording with VAD
    // All callbacks read from refs — never stale
    const whisperRecording = useVoiceRecording({
        vadEnabled: true,
        silenceThreshold: 0.06,
        silenceDuration: 1.5,
        onTranscription: (text) => {
            console.log("[VoiceConversation] Whisper transcription received:", text?.substring(0, 50));
            if (!isActiveRef.current || isPausedRef.current) {
                console.log("[VoiceConversation] Discarding - isActive:", isActiveRef.current, "isPaused:", isPausedRef.current);
                return;
            }
            setInterimText("");
            setConversationState("thinking");
            onTranscriptionRef.current?.(text);
        },
        onError: (error) => {
            // Internal skip signal: audio too short, silently restart without showing error
            if (error === "__audio_skip__") {
                console.log("[VoiceConversation] Audio too short, silently restarting listener...");
                if (isActiveRef.current && !isPausedRef.current) {
                    startListeningRef.current();
                }
                return;
            }
            console.error("[VoiceConversation] Whisper error:", error);
            onErrorRef.current?.(error);
            if (isActiveRef.current && !isPausedRef.current) {
                setTimeout(() => {
                    if (isActiveRef.current && !isPausedRef.current) {
                        console.log("[VoiceConversation] Restarting listening after error...");
                        startListeningRef.current();
                    }
                }, 1000);
            }
        },
        onSilenceDetected: () => {
            console.log("[VoiceConversation] Silence detected, transitioning to transcribing");
            setConversationState("transcribing");
        },
    });

    // Ref for startListening to avoid circular deps in error recovery callback
    const startListeningRef = useRef<() => void>(() => {});

    // Stop ALL active listeners (both Deepgram and Whisper) regardless of current provider
    const stopAllListeners = useCallback(() => {
        console.log("[VoiceConversation] Stopping all listeners...");
        // Always try to stop Deepgram
        if (deepgramSttRef.current) {
            deepgramSttRef.current.stop();
            deepgramSttRef.current.destroy();
            deepgramSttRef.current = null;
        }
        // Always try to stop Whisper recording
        if (whisperRecording.isRecording) {
            whisperRecording.stopRecording();
        }
    }, [whisperRecording]);

    const startListening = useCallback(() => {
        if (isPausedRef.current) return;

        // Stop any previously running listener first
        stopAllListeners();

        // Stop any TTS playback and clear queued chunks (barge-in)
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        ttsQueueRef.current = [];
        ttsIsPlayingRef.current = false;
        if (activeAudioUrlRef.current && activeAudioUrlRef.current.startsWith("blob:")) {
            URL.revokeObjectURL(activeAudioUrlRef.current);
            activeAudioUrlRef.current = null;
        }

        setConversationState("listening");
        setInterimText("");

        const currentProvider = providerRef.current;
        const currentDgKey = deepgramApiKeyRef.current;

        console.log("[VoiceConversation] Starting listening with provider:", currentProvider);

        if (currentProvider === "deepgram" && currentDgKey) {
            import("@/lib/voice/deepgram-stt").then(({ createDeepgramSTT }) => {
                // Check we're still active and not already destroyed
                if (!isActiveRef.current || isPausedRef.current) return;

                const stt = createDeepgramSTT({
                    apiKey: currentDgKey,
                    onInterimTranscript: (text) => {
                        setInterimText(text);
                    },
                    onFinalTranscript: (text) => {
                        console.log("[VoiceConversation] Deepgram final transcript:", text?.substring(0, 50));
                        if (!isActiveRef.current || isPausedRef.current) return;
                        setInterimText("");
                        setConversationState("thinking");
                        onTranscriptionRef.current?.(text);
                    },
                    onUtteranceEnd: () => {
                        console.log("[VoiceConversation] Deepgram utterance end");
                    },
                    onError: (error) => {
                        console.error("[VoiceConversation] Deepgram error:", error);
                        onErrorRef.current?.(error);
                    },
                });
                deepgramSttRef.current = stt;
            }).catch((err) => {
                console.error("[VoiceConversation] Failed to start Deepgram:", err);
                onErrorRef.current?.(`Failed to start Deepgram: ${err.message}`);
            });
        } else {
            // Whisper: start recording, VAD will auto-stop
            console.log("[VoiceConversation] Starting Whisper recording...");
            whisperRecording.startRecording();
        }
    }, [whisperRecording, stopAllListeners]);

    // Keep startListeningRef in sync
    useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

    // Restart listening when provider changes while voice is active
    useEffect(() => {
        if (isActiveRef.current && !isPausedRef.current && conversationState === "listening") {
            console.log("[VoiceConversation] Provider changed to:", provider, "- restarting listener");
            startListeningRef.current();
        }
    // Only trigger on provider change, not on other deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provider]);

    const stopTtsPlayback = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        ttsIsPlayingRef.current = false;
        if (activeAudioUrlRef.current && activeAudioUrlRef.current.startsWith("blob:")) {
            URL.revokeObjectURL(activeAudioUrlRef.current);
            activeAudioUrlRef.current = null;
        }
    }, []);

    const flushTTSQueue = useCallback(() => {
        ttsQueueRef.current = [];
        stopTtsPlayback();
    }, [stopTtsPlayback]);

    const playNextTTSChunk = useCallback(async () => {
        if (ttsIsPlayingRef.current) return;

        const nextText = ttsQueueRef.current.shift();
        if (!nextText) {
            if (responseStreamingRef.current) {
                if (isActiveRef.current) {
                    setConversationState("thinking");
                }
                return;
            }

            if (isActiveRef.current && !isPausedRef.current) {
                setTimeout(() => {
                    if (isActiveRef.current && !isPausedRef.current) {
                        startListeningRef.current();
                    } else {
                        setConversationState("idle");
                    }
                }, 500);
            } else {
                setConversationState("idle");
            }
            return;
        }

        if (!isActiveRef.current || isPausedRef.current) {
            ttsQueueRef.current = [];
            return;
        }

        console.log("[VoiceConversation] Speaking chunk:", nextText.substring(0, 50) + "...");
        setConversationState("speaking");
        ttsIsPlayingRef.current = true;

        try {
            let audioUrl: string;

            if (providerRef.current === "deepgram" && deepgramApiKeyRef.current) {
                const dgResponse = await fetch("/api/audio/deepgram/speak", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: nextText,
                        voice: voiceRef.current,
                    }),
                });

                if (!dgResponse.ok) {
                    const errData = await dgResponse.json().catch(() => ({}));
                    throw new Error(errData.error || "Deepgram TTS failed");
                }

                const dgData = await dgResponse.json();
                audioUrl = dgData.audio.dataUrl;
            } else {
                const response = await fetch("/api/audio/speech", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: nextText,
                        voice: voiceRef.current,
                        speed: speedRef.current,
                    }),
                });

                if (!response.ok) {
                    throw new Error("Speech generation failed");
                }

                const data = await response.json();
                audioUrl = data.audio.dataUrl;
            }

            if (activeAudioUrlRef.current && activeAudioUrlRef.current.startsWith("blob:")) {
                URL.revokeObjectURL(activeAudioUrlRef.current);
            }
            activeAudioUrlRef.current = audioUrl;

            const audio = new Audio(audioUrl);
            audioRef.current = audio;

            audio.onended = () => {
                audioRef.current = null;
                ttsIsPlayingRef.current = false;
                playNextTTSChunk();
            };

            audio.onerror = () => {
                console.error("[VoiceConversation] Audio playback error");
                audioRef.current = null;
                ttsIsPlayingRef.current = false;
                onErrorRef.current?.("Audio playback failed");
                playNextTTSChunk();
            };

            await audio.play();
        } catch (error) {
            const message = error instanceof Error ? error.message : "TTS failed";
            console.error("[VoiceConversation] TTS error:", message);
            onErrorRef.current?.(message);
            ttsIsPlayingRef.current = false;
            playNextTTSChunk();
        }
    }, []);

    const enqueueTTS = useCallback((text: string, options?: { replaceQueue?: boolean }) => {
        if (!isActiveRef.current || isPausedRef.current) return;
        const trimmed = text.trim();
        if (!trimmed) return;

        if (options?.replaceQueue) {
            ttsQueueRef.current = [];
        }

        ttsQueueRef.current.push(trimmed);
        playNextTTSChunk();
    }, [playNextTTSChunk]);

    const speakText = useCallback((text: string) => {
        console.log("[VoiceConversation] speakText queued:", text.substring(0, 50) + "...");
        enqueueTTS(text, { replaceQueue: true });
    }, [enqueueTTS]);

    // Start voice conversation
    const start = useCallback(() => {
        console.log("[VoiceConversation] Starting voice conversation");
        // Set ref SYNCHRONOUSLY so all callbacks see it immediately
        isActiveRef.current = true;
        setIsActive(true);
        isPausedRef.current = false;
        startListening();
    }, [startListening]);

    // Stop voice conversation
    const stop = useCallback(() => {
        console.log("[VoiceConversation] Stopping voice conversation");
        isActiveRef.current = false;
        setIsActive(false);
        isPausedRef.current = false;
        responseStreamingRef.current = false;
        setConversationState("idle");
        setInterimText("");
        stopAllListeners();
        flushTTSQueue();
    }, [stopAllListeners, flushTTSQueue]);

    // Pause voice conversation
    const pause = useCallback(() => {
        console.log("[VoiceConversation] Pausing");
        isPausedRef.current = true;
        responseStreamingRef.current = false;
        stopAllListeners();
        flushTTSQueue();
        setConversationState("idle");
    }, [stopAllListeners, flushTTSQueue]);

    // Resume voice conversation
    const resume = useCallback(() => {
        console.log("[VoiceConversation] Resuming");
        isPausedRef.current = false;
        startListening();
    }, [startListening]);

    // Skip current TTS playback
    const skipSpeaking = useCallback(() => {
        flushTTSQueue();
        if (isActiveRef.current && !isPausedRef.current) {
            startListeningRef.current();
        }
    }, [flushTTSQueue]);

    const setResponseStreaming = useCallback((isStreaming: boolean) => {
        responseStreamingRef.current = isStreaming;
        if (isStreaming && isActiveRef.current && !isPausedRef.current) {
            setConversationState("thinking");
        }
        if (!isStreaming && isActiveRef.current && !isPausedRef.current) {
            if (!ttsIsPlayingRef.current && ttsQueueRef.current.length === 0) {
                setTimeout(() => {
                    if (isActiveRef.current && !isPausedRef.current) {
                        startListeningRef.current();
                    }
                }, 200);
            }
        }
    }, []);

    // Signal that AI is "thinking" (called externally when AI response starts streaming)
    const setThinking = useCallback(() => {
        if (isActiveRef.current) {
            setConversationState("thinking");
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isActiveRef.current = false;
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            if (deepgramSttRef.current) {
                deepgramSttRef.current.destroy();
                deepgramSttRef.current = null;
            }
            if (activeAudioUrlRef.current && activeAudioUrlRef.current.startsWith("blob:")) {
                URL.revokeObjectURL(activeAudioUrlRef.current);
            }
        };
    }, []);

    return {
        state: conversationState,
        isActive,
        isPaused: isPausedRef.current,
        audioLevel: provider === "whisper" ? whisperRecording.audioLevel : 0,
        interimText,
        start,
        stop,
        pause,
        resume,
        skipSpeaking,
        speakText,
        setThinking,
        enqueueTTS,
        flushTTSQueue,
        setResponseStreaming,
    };
}
