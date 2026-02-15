/**
 * Voice Recording Hook
 *
 * Provides microphone recording functionality using the Web Audio API.
 * Records audio and transcribes it using the speech-to-text API.
 *
 * ALL callbacks and config are stored in refs to avoid stale closures
 * in MediaRecorder event handlers and requestAnimationFrame loops.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface VoiceRecordingState {
    isRecording: boolean;
    isTranscribing: boolean;
    error: string | null;
    audioLevel: number;
}

export interface UseVoiceRecordingOptions {
    onTranscription?: (text: string) => void;
    onError?: (error: string) => void;
    language?: string;
    maxDuration?: number; // Maximum recording duration in seconds
    // VAD (Voice Activity Detection) options
    vadEnabled?: boolean;
    silenceThreshold?: number; // 0-1, default 0.06
    silenceDuration?: number; // seconds of silence before auto-stop, default 1.5
    onSilenceDetected?: () => void;
}

export function useVoiceRecording(options: UseVoiceRecordingOptions = {}) {
    const {
        onTranscription,
        onError,
        language,
        maxDuration = 60,
        vadEnabled = false,
        silenceThreshold = 0.06,
        silenceDuration = 1.5,
        onSilenceDetected,
    } = options;

    const [state, setState] = useState<VoiceRecordingState>({
        isRecording: false,
        isTranscribing: false,
        error: null,
        audioLevel: 0,
    });

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const silenceStartRef = useRef<number | null>(null);
    const hasSpokenRef = useRef(false);
    const speechStartRef = useRef<number | null>(null); // When audio first crossed threshold (for debounce)
    const frameCountRef = useRef(0);
    const recordingStartTimeRef = useRef<number>(0); // For VAD grace period

    // === ALL callbacks and config stored as refs to avoid stale closures ===
    const onTranscriptionRef = useRef(onTranscription);
    const onErrorRef = useRef(onError);
    const onSilenceDetectedRef = useRef(onSilenceDetected);
    const languageRef = useRef(language);
    const vadConfigRef = useRef({ vadEnabled, silenceThreshold, silenceDuration });

    // Keep refs up to date on every render
    useEffect(() => { onTranscriptionRef.current = onTranscription; }, [onTranscription]);
    useEffect(() => { onErrorRef.current = onError; }, [onError]);
    useEffect(() => { onSilenceDetectedRef.current = onSilenceDetected; }, [onSilenceDetected]);
    useEffect(() => { languageRef.current = language; }, [language]);
    useEffect(() => {
        vadConfigRef.current = { vadEnabled, silenceThreshold, silenceDuration };
    }, [vadEnabled, silenceThreshold, silenceDuration]);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        // Close AudioContext to prevent resource leak (browsers limit to ~6 concurrent)
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        audioChunksRef.current = [];
        silenceStartRef.current = null;
        hasSpokenRef.current = false;
        speechStartRef.current = null;
        frameCountRef.current = 0;
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return cleanup;
    }, [cleanup]);

    // Audio level + VAD loop — uses refs only (no stale closures)
    const updateAudioLevel = useCallback(() => {
        if (!analyserRef.current) return;
        const isStillRecording =
            mediaRecorderRef.current?.state === 'recording';

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalizedLevel = Math.min(average / 128, 1);

        setState(prev => ({ ...prev, audioLevel: normalizedLevel }));

        // Log audio level periodically (every ~60 frames ≈ 1 second)
        frameCountRef.current++;
        if (frameCountRef.current % 60 === 0) {
            const { vadEnabled: vad, silenceThreshold: threshold } = vadConfigRef.current;
            console.log(`[VoiceRecording] audioLevel=${normalizedLevel.toFixed(3)} threshold=${threshold} hasSpoken=${hasSpokenRef.current} vad=${vad}`);
        }

        // VAD: Track silence for auto-stop (read config from refs)
        const { vadEnabled: vad, silenceThreshold: threshold, silenceDuration: duration } = vadConfigRef.current;
        if (vad && isStillRecording) {
            const now = Date.now();
            // Grace period: ignore VAD for first 1200ms to avoid echo from TTS triggering false stops
            const elapsedSinceStart = now - recordingStartTimeRef.current;
            if (elapsedSinceStart < 1200) {
                // During grace period, don't track speech or silence
                if (isStillRecording) {
                    animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
                }
                return;
            }
            if (normalizedLevel > threshold) {
                silenceStartRef.current = null;
                if (!hasSpokenRef.current) {
                    // Debounce: require 300ms of sustained audio above threshold to confirm speech
                    // This filters out brief echo bursts from TTS playback
                    if (speechStartRef.current === null) {
                        speechStartRef.current = now;
                    } else if (now - speechStartRef.current >= 300) {
                        hasSpokenRef.current = true;
                        speechStartRef.current = null;
                    }
                }
            } else {
                // Audio dropped below threshold — reset speech start tracking
                speechStartRef.current = null;
            }
            if (!hasSpokenRef.current) {
                // Not yet confirmed as speech — skip silence detection
            } else if (normalizedLevel <= threshold) {
                if (silenceStartRef.current === null) {
                    silenceStartRef.current = now;
                } else if ((now - silenceStartRef.current) / 1000 >= duration) {
                    console.log('[VAD] Silence detected, auto-stopping recording');
                    silenceStartRef.current = null;
                    onSilenceDetectedRef.current?.();
                    // Inline stop to avoid circular dependency
                    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
                    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
                    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { mediaRecorderRef.current.stop(); }
                    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
                    setState(prev => ({ ...prev, isRecording: false, audioLevel: 0 }));
                    return; // Don't schedule next frame
                }
            }
        }

        if (isStillRecording) {
            animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        }
    }, []); // No deps — everything read from refs

    // Transcribe audio — reads callbacks from refs (never stale)
    // Uses FormData upload (not base64 JSON) for reliable binary transfer to Whisper
    const transcribeAudio = useCallback(async (audioBlob: Blob) => {
        setState(prev => ({ ...prev, isTranscribing: true }));

        try {
            // Determine file extension from blob type
            const baseMime = (audioBlob.type || 'audio/webm').split(';')[0].trim();
            const extMap: Record<string, string> = {
                'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a',
                'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/mp3': 'mp3',
            };
            const ext = extMap[baseMime] || 'webm';
            const filename = `audio.${ext}`;

            // Send as FormData for reliable binary transfer (avoids base64 encode/decode corruption)
            const formData = new FormData();
            formData.append('audio', audioBlob, filename);
            if (languageRef.current) {
                formData.append('language', languageRef.current);
            }

            const response = await fetch('/api/audio/transcribe', {
                method: 'POST',
                // Don't set Content-Type — browser sets it with multipart boundary
                body: formData,
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Transcription failed');
            }

            const text = (result.text || '').trim();
            if (text.length < 2) {
                // Empty or single-char transcription — likely noise, skip silently
                console.log('[VoiceRecording] Empty transcription, skipping');
                setState(prev => ({ ...prev, isTranscribing: false }));
                onErrorRef.current?.("__audio_skip__");
                return;
            }

            // Use ref to always call the latest callback
            onTranscriptionRef.current?.(text);
            setState(prev => ({ ...prev, isTranscribing: false, error: null }));

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Transcription failed';
            setState(prev => ({ ...prev, isTranscribing: false, error: message }));
            onErrorRef.current?.(message);
        } finally {
            cleanup();
        }
    }, [cleanup]); // Only depends on cleanup (stable). Callbacks read from refs.

    // Start recording
    const startRecording = useCallback(async () => {
        console.log('[VoiceRecording] startRecording called');
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Your browser does not support audio recording');
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });
            streamRef.current = stream;

            // Close any previous AudioContext to prevent resource leak
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => {});
            }
            const audioContext = new AudioContext();
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            let mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/webm';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'audio/mp4';
                    if (!MediaRecorder.isTypeSupported(mimeType)) {
                        mimeType = '';
                    }
                }
            }

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType || undefined
            });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, {
                    type: mimeType || 'audio/webm'
                });

                const recordingDuration = Date.now() - recordingStartTimeRef.current;
                // Require minimum 1s recording AND 2KB+ to avoid sending corrupt/empty audio to Whisper
                if (audioBlob.size > 2048 && recordingDuration > 1000) {
                    await transcribeAudio(audioBlob);
                } else {
                    console.log(`[VoiceRecording] Audio too short, skipping. Size: ${audioBlob.size}B, Duration: ${recordingDuration}ms`);
                    cleanup();
                    // Signal parent to silently restart listening (not a user-facing error)
                    onErrorRef.current?.("__audio_skip__");
                }
            };

            // Reset VAD state
            silenceStartRef.current = null;
            hasSpokenRef.current = false;
            speechStartRef.current = null;
            recordingStartTimeRef.current = Date.now();

            mediaRecorder.start(100);
            console.log('[VoiceRecording] MediaRecorder started, state:', mediaRecorder.state);

            setState(prev => ({
                ...prev,
                isRecording: true,
                error: null,
                audioLevel: 0,
            }));

            // Start audio level visualization + VAD loop
            setTimeout(() => {
                console.log('[VoiceRecording] Starting animation loop, recorder state:', mediaRecorderRef.current?.state);
                animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
            }, 50);

            // Set max duration timeout
            timeoutRef.current = setTimeout(() => {
                if (mediaRecorderRef.current?.state === 'recording') {
                    stopRecording();
                }
            }, maxDuration * 1000);

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to start recording';
            setState(prev => ({ ...prev, error: message }));
            onErrorRef.current?.(message);
            cleanup();
        }
    }, [maxDuration, cleanup, updateAudioLevel, transcribeAudio]);

    // Stop recording
    const stopRecording = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        setState(prev => ({
            ...prev,
            isRecording: false,
            audioLevel: 0,
        }));
    }, []);

    // Cancel recording without transcribing
    const cancelRecording = useCallback(() => {
        cleanup();
        setState(prev => ({
            ...prev,
            isRecording: false,
            isTranscribing: false,
            audioLevel: 0,
        }));
    }, [cleanup]);

    // Toggle recording
    const toggleRecording = useCallback(() => {
        if (state.isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }, [state.isRecording, startRecording, stopRecording]);

    return {
        ...state,
        startRecording,
        stopRecording,
        cancelRecording,
        toggleRecording,
    };
}
