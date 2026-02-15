"use client";

import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Mic,
    Pause,
    Play,
    Square,
    SkipForward,
    Loader2,
    Volume2,
    Settings2,
} from "lucide-react";
import { useState } from "react";
import type { VoiceConversationState, VoiceProvider } from "@/lib/hooks/useVoiceConversation";
import { DEEPGRAM_VOICES } from "@/lib/voice/deepgram-tts";

const OPENAI_VOICES = [
    { id: "alloy", name: "Alloy" },
    { id: "echo", name: "Echo" },
    { id: "fable", name: "Fable" },
    { id: "onyx", name: "Onyx" },
    { id: "nova", name: "Nova" },
    { id: "shimmer", name: "Shimmer" },
];

interface VoiceOverlayProps {
    state: VoiceConversationState;
    audioLevel: number;
    interimText: string;
    isPaused: boolean;
    provider: VoiceProvider;
    voice: string;
    speed: number;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onSkipSpeaking: () => void;
    onProviderChange: (provider: VoiceProvider) => void;
    onVoiceChange: (voice: string) => void;
    onSpeedChange: (speed: number) => void;
}

export function VoiceOverlay({
    state,
    audioLevel,
    interimText,
    isPaused,
    provider,
    voice,
    speed,
    onPause,
    onResume,
    onStop,
    onSkipSpeaking,
    onProviderChange,
    onVoiceChange,
    onSpeedChange,
}: VoiceOverlayProps) {
    const [showSettings, setShowSettings] = useState(false);

    const voices = provider === "deepgram" ? DEEPGRAM_VOICES : OPENAI_VOICES;

    return (
        <div className="w-full bg-background/95 backdrop-blur-sm border-t px-4 py-4">
            <div className="max-w-3xl mx-auto space-y-3">
                {/* State Indicator */}
                <div className="flex items-center justify-center gap-3">
                    {state === "listening" && (
                        <>
                            <div className="relative flex items-center justify-center">
                                <div
                                    className="absolute w-12 h-12 rounded-full bg-red-500/20 animate-ping"
                                    style={{ transform: `scale(${1 + audioLevel * 2})` }}
                                />
                                <div
                                    className="relative w-10 h-10 rounded-full bg-red-500 flex items-center justify-center"
                                    style={{
                                        boxShadow: `0 0 ${Math.round(audioLevel * 30)}px ${Math.round(audioLevel * 15)}px rgba(239, 68, 68, ${audioLevel * 0.6})`,
                                    }}
                                >
                                    <Mic className="h-5 w-5 text-white" />
                                </div>
                            </div>
                            <div className="text-sm font-medium">
                                {interimText ? (
                                    <span className="text-foreground italic">{interimText}</span>
                                ) : (
                                    <span className="text-muted-foreground">Listening...</span>
                                )}
                            </div>
                        </>
                    )}

                    {state === "transcribing" && (
                        <div className="flex items-center gap-2 text-sm">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            <span className="text-muted-foreground">Transcribing...</span>
                        </div>
                    )}

                    {state === "thinking" && (
                        <div className="flex items-center gap-2 text-sm">
                            <div className="flex gap-1">
                                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                                <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                                <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
                            </div>
                            <span className="text-muted-foreground">AI is thinking...</span>
                        </div>
                    )}

                    {state === "speaking" && (
                        <div className="flex items-center gap-2 text-sm">
                            <div className="flex items-end gap-0.5 h-5">
                                <span className="w-1 bg-primary rounded-full animate-pulse" style={{ height: "60%" }} />
                                <span className="w-1 bg-primary rounded-full animate-pulse [animation-delay:0.1s]" style={{ height: "100%" }} />
                                <span className="w-1 bg-primary rounded-full animate-pulse [animation-delay:0.2s]" style={{ height: "40%" }} />
                                <span className="w-1 bg-primary rounded-full animate-pulse [animation-delay:0.3s]" style={{ height: "80%" }} />
                                <span className="w-1 bg-primary rounded-full animate-pulse [animation-delay:0.15s]" style={{ height: "50%" }} />
                            </div>
                            <span className="text-muted-foreground">Speaking...</span>
                        </div>
                    )}

                    {state === "idle" && isPaused && (
                        <div className="text-sm text-muted-foreground">
                            Voice conversation paused
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-2">
                    <TooltipProvider>
                        {/* Pause/Resume */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={isPaused ? onResume : onPause}
                                    className="h-9 w-9"
                                >
                                    {isPaused ? (
                                        <Play className="h-4 w-4" />
                                    ) : (
                                        <Pause className="h-4 w-4" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {isPaused ? "Resume" : "Pause"}
                            </TooltipContent>
                        </Tooltip>

                        {/* Stop */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    onClick={onStop}
                                    className="h-9 w-9"
                                >
                                    <Square className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Stop voice mode</TooltipContent>
                        </Tooltip>

                        {/* Skip Speaking */}
                        {state === "speaking" && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={onSkipSpeaking}
                                        className="h-9 w-9"
                                    >
                                        <SkipForward className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Skip response</TooltipContent>
                            </Tooltip>
                        )}

                        {/* Settings Toggle */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowSettings(!showSettings)}
                                    className="h-9 w-9"
                                >
                                    <Settings2 className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Voice settings</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>

                {/* Settings Panel */}
                {showSettings && (
                    <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                        <div className="grid grid-cols-3 gap-3">
                            {/* Provider */}
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Provider</label>
                                <Select value={provider} onValueChange={(v) => onProviderChange(v as VoiceProvider)}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="whisper">Whisper (OpenAI)</SelectItem>
                                        <SelectItem value="deepgram">Deepgram</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Voice */}
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Voice</label>
                                <Select value={voice} onValueChange={onVoiceChange}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {voices.map((v) => (
                                            <SelectItem key={v.id} value={v.id}>
                                                {v.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Speed (only for Whisper/OpenAI TTS) */}
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                    <Volume2 className="h-3 w-3" />
                                    Speed: {speed.toFixed(1)}x
                                </label>
                                <Slider
                                    value={[speed]}
                                    onValueChange={([v]) => onSpeedChange(v)}
                                    min={0.5}
                                    max={2.0}
                                    step={0.1}
                                    className="mt-2"
                                    disabled={provider === "deepgram"}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
