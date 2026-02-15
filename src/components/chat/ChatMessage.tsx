"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { User, Sparkles, Copy, Check, RefreshCw, Pencil, X, History, Bot, Volume2, VolumeX } from "lucide-react";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { FileList, type FileInfo } from "@/components/chat/FileAttachment";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState, useRef, useEffect, memo, useCallback } from "react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

// Provider colors for badges
const providerColors: Record<string, string> = {
    openai: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    anthropic: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    google: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    xai: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
    openrouter: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

// Short model names for display
function getShortModelName(model?: string): string {
    if (!model) return "";
    // Map common model IDs to short names
    const modelNames: Record<string, string> = {
        "gpt-4o": "GPT-4o",
        "gpt-4o-mini": "GPT-4o Mini",
        "gpt-4-turbo": "GPT-4 Turbo",
        "o1": "o1",
        "o1-mini": "o1 Mini",
        "o3-mini": "o3 Mini",
        "claude-sonnet-4-20250514": "Sonnet 4",
        "claude-opus-4-20250514": "Opus 4",
        "claude-3-5-sonnet-20241022": "Sonnet 3.5",
        "claude-3-5-haiku-20241022": "Haiku 3.5",
        "gemini-2.5-pro-preview-06-05": "Gemini 2.5 Pro",
        "gemini-2.5-flash-preview-05-20": "Gemini 2.5 Flash",
        "gemini-2.5-flash-preview-image-generation": "Gemini 2.5 Flash (Img)",
        "gemini-2.0-flash": "Gemini 2.0 Flash",
        "grok-3": "Grok 3",
        "grok-3-fast": "Grok 3 Fast",
    };
    return modelNames[model] || model.split("/").pop()?.split("-").slice(0, 2).join(" ") || model;
}

// Generate consistent color for agent based on name/id
function getAgentColor(agentId: string | undefined, agentName: string | undefined): { bg: string; border: string; text: string; avatar: string } {
    if (!agentId && !agentName) {
        return { bg: "bg-muted/50", border: "border-muted", text: "text-foreground", avatar: "bg-muted" };
    }

    // Use a hash of the name/id to get a consistent color
    const seed = agentId || agentName || "";
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }

    const colors = [
        { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800", text: "text-blue-900 dark:text-blue-100", avatar: "bg-blue-500" },
        { bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800", text: "text-purple-900 dark:text-purple-100", avatar: "bg-purple-500" },
        { bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800", text: "text-green-900 dark:text-green-100", avatar: "bg-green-500" },
        { bg: "bg-orange-50 dark:bg-orange-950/30", border: "border-orange-200 dark:border-orange-800", text: "text-orange-900 dark:text-orange-100", avatar: "bg-orange-500" },
        { bg: "bg-pink-50 dark:bg-pink-950/30", border: "border-pink-200 dark:border-pink-800", text: "text-pink-900 dark:text-pink-100", avatar: "bg-pink-500" },
        { bg: "bg-cyan-50 dark:bg-cyan-950/30", border: "border-cyan-200 dark:border-cyan-800", text: "text-cyan-900 dark:text-cyan-100", avatar: "bg-cyan-500" },
        { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", text: "text-amber-900 dark:text-amber-100", avatar: "bg-amber-500" },
        { bg: "bg-indigo-50 dark:bg-indigo-950/30", border: "border-indigo-200 dark:border-indigo-800", text: "text-indigo-900 dark:text-indigo-100", avatar: "bg-indigo-500" },
    ];

    return colors[Math.abs(hash) % colors.length] || colors[0];
}

interface ImagePart {
    mediaType: string;
    url: string;
    filename?: string;
}

interface ChatMessageProps {
    id?: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp?: Date;
    files?: FileInfo[];
    imageParts?: ImagePart[];
    metadata?: {
        lastEditedAt?: string;
        editHistory?: Array<{ content: string; editedAt: string }>;
        model?: string;
        provider?: string;
        inputTokens?: number;
        outputTokens?: number;
        agentName?: string;
        agentId?: string;
    };
    onRegenerate?: () => void;
    isRegenerating?: boolean;
    onEdit?: (id: string, newContent: string) => Promise<void>;
}

export const ChatMessage = memo(function ChatMessage({
    id,
    role,
    content,
    timestamp,
    files,
    imageParts,
    metadata,
    onRegenerate,
    isRegenerating,
    onEdit,
}: ChatMessageProps) {
    const isUser = role === "user";
    const [isCopied, setIsCopied] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState(content);
    const [isSaving, setIsSaving] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isEdited = metadata?.lastEditedAt !== undefined;
    const editHistory = metadata?.editHistory || [];

    // Auto-resize textarea
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(
                textareaRef.current.value.length,
                textareaRef.current.value.length
            );
        }
    }, [isEditing]);

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const onCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(content);
            setIsCopied(true);
            toast.success("Message copied to clipboard");
            setTimeout(() => setIsCopied(false), 2000);
        } catch {
            toast.error("Failed to copy message");
        }
    }, [content]);

    const handleStartEdit = useCallback(() => {
        setEditedContent(content);
        setIsEditing(true);
    }, [content]);

    const handleCancelEdit = useCallback(() => {
        setEditedContent(content);
        setIsEditing(false);
    }, [content]);

    const handleSaveEdit = useCallback(async () => {
        if (!id || !onEdit) return;
        if (editedContent.trim() === content) {
            setIsEditing(false);
            return;
        }

        try {
            setIsSaving(true);
            await onEdit(id, editedContent.trim());
            setIsEditing(false);
            toast.success("Message updated");
        } catch {
            toast.error("Failed to update message");
        } finally {
            setIsSaving(false);
        }
    }, [id, onEdit, editedContent, content]);

    const handleSpeak = useCallback(async () => {
        if (isSpeaking) {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            setIsSpeaking(false);
            return;
        }

        if (!content.trim()) {
            return;
        }

        if (content.length > 4096) {
            toast.error("Message too long for TTS", {
                description: "Please shorten the message before generating speech.",
            });
            return;
        }

        try {
            setIsSpeaking(true);
            let url = audioUrl;
            if (!url) {
                const response = await fetch("/api/audio/speech", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: content }),
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || "Failed to generate speech");
                }
                url = data.audio?.dataUrl;
                if (!url) {
                    throw new Error("No audio returned");
                }
                setAudioUrl(url);
            }

            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => setIsSpeaking(false);
            audio.onerror = () => setIsSpeaking(false);
            await audio.play();
        } catch (error) {
            setIsSpeaking(false);
            toast.error(error instanceof Error ? error.message : "Speech playback failed");
        }
    }, [audioUrl, content, isSpeaking]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            setEditedContent(content);
            setIsEditing(false);
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            // Trigger save - need to call handleSaveEdit logic inline
            if (!id || !onEdit) return;
            if (editedContent.trim() === content) {
                setIsEditing(false);
                return;
            }
            setIsSaving(true);
            onEdit(id, editedContent.trim())
                .then(() => {
                    setIsEditing(false);
                    toast.success("Message updated");
                })
                .catch(() => {
                    toast.error("Failed to update message");
                })
                .finally(() => {
                    setIsSaving(false);
                });
        }
    }, [content, id, onEdit, editedContent]);

    const formatTimestamp = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return "just now";
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;

        return date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    if (!content && !isEditing) return null;

    // Get agent-specific colors for multi-agent conversations
    const agentColors = getAgentColor(metadata?.agentId, metadata?.agentName);
    const isMultiAgent = !!metadata?.agentName;

    // Get initials for agent avatar
    const getAgentInitials = (name: string) => {
        const words = name.split(/\s+/);
        if (words.length >= 2) {
            return (words[0]?.[0] || "") + (words[1]?.[0] || "");
        }
        return name.slice(0, 2);
    };

    return (
        <TooltipProvider>
            <div className={cn("flex w-full group chat-message-item", isUser ? "justify-end" : "justify-start")}>
                <div
                    className={cn(
                        "flex max-w-[95%] sm:max-w-[85%] md:max-w-[75%] gap-2 sm:gap-3 items-start",
                        isUser ? "flex-row-reverse" : "flex-row"
                    )}
                >
                    {/* Avatar - hidden on mobile for user, smaller on mobile for assistant */}
                    <div className={cn(
                        "flex-col items-center gap-1 shrink-0",
                        isUser ? "hidden sm:flex" : "flex"
                    )}>
                        <Avatar className={cn(
                            "border shrink-0",
                            "h-6 w-6 sm:h-8 sm:w-8",
                            isMultiAgent && !isUser && agentColors.avatar
                        )}>
                            <AvatarFallback
                                className={cn(
                                    isUser ? "bg-primary text-primary-foreground" :
                                    isMultiAgent ? `${agentColors.avatar} text-white` : "bg-muted"
                                )}
                            >
                                {isUser ? (
                                    <User className="h-3 w-3 sm:h-4 sm:w-4" />
                                ) : isMultiAgent && metadata?.agentName ? (
                                    <span className="text-[10px] sm:text-xs font-semibold">{getAgentInitials(metadata.agentName)}</span>
                                ) : (
                                    <Sparkles className="h-3 w-3 sm:h-4 sm:w-4" />
                                )}
                            </AvatarFallback>
                        </Avatar>
                        {/* Model/Provider badge for assistant messages - hidden on mobile */}
                        {!isUser && metadata?.provider && !isMultiAgent && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge
                                        variant="secondary"
                                        className={cn(
                                            "hidden sm:flex text-[9px] px-1.5 py-0 h-4 font-normal cursor-help",
                                            providerColors[metadata.provider] || "bg-muted"
                                        )}
                                    >
                                        <Bot className="h-2.5 w-2.5 mr-0.5" />
                                        {getShortModelName(metadata.model)}
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                    <div className="text-xs space-y-1">
                                        <p><strong>Model:</strong> {metadata.model}</p>
                                        <p><strong>Provider:</strong> {metadata.provider}</p>
                                        {metadata.inputTokens !== undefined && (
                                            <p><strong>Input:</strong> {metadata.inputTokens} tokens</p>
                                        )}
                                        {metadata.outputTokens !== undefined && (
                                            <p><strong>Output:</strong> {metadata.outputTokens} tokens</p>
                                        )}
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>

                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                        {/* Agent name header for multi-agent conversations */}
                        {isMultiAgent && !isUser && metadata?.agentName && (
                            <div className={cn("flex items-center gap-2 px-1", agentColors.text)}>
                                <span className="font-semibold text-sm">{metadata.agentName}</span>
                                {metadata.model && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal opacity-70">
                                        {getShortModelName(metadata.model)}
                                    </Badge>
                                )}
                            </div>
                        )}
                        {/* Mobile: Show model badge inline for assistant without agent */}
                        {!isUser && metadata?.provider && !isMultiAgent && (
                            <div className="flex sm:hidden items-center gap-1 px-1">
                                <Badge
                                    variant="secondary"
                                    className={cn(
                                        "text-[9px] px-1.5 py-0 h-4 font-normal",
                                        providerColors[metadata.provider] || "bg-muted"
                                    )}
                                >
                                    <Bot className="h-2.5 w-2.5 mr-0.5" />
                                    {getShortModelName(metadata.model)}
                                </Badge>
                            </div>
                        )}
                        <div
                            className={cn(
                                "rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm relative border",
                                isUser
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : isMultiAgent
                                    ? `${agentColors.bg} ${agentColors.border} ${agentColors.text}`
                                    : "bg-muted/50 border-muted dark:bg-muted/20"
                            )}
                        >
                            {isEditing ? (
                                <div className="space-y-2">
                                    <textarea
                                        ref={textareaRef}
                                        value={editedContent}
                                        onChange={(e) => setEditedContent(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        className={cn(
                                            "w-full min-h-[60px] resize-none bg-transparent border-0 outline-none focus:ring-0 p-0 text-base sm:text-sm",
                                            isUser ? "text-primary-foreground" : ""
                                        )}
                                        disabled={isSaving}
                                    />
                                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-current/20">
                                        <span className="hidden sm:block text-xs opacity-60 mr-auto">
                                            Ctrl+Enter to save • Esc to cancel
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={handleCancelEdit}
                                            disabled={isSaving}
                                            className={cn(
                                                "h-9 min-h-[36px] px-3",
                                                isUser
                                                    ? "text-primary-foreground hover:bg-primary-foreground/20"
                                                    : ""
                                            )}
                                        >
                                            <X className="h-4 w-4 sm:h-3 sm:w-3 sm:mr-1" />
                                            <span className="hidden sm:inline">Cancel</span>
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={handleSaveEdit}
                                            disabled={isSaving || !editedContent.trim()}
                                            className={cn(
                                                "h-9 min-h-[36px] px-3",
                                                isUser
                                                    ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                                                    : ""
                                            )}
                                        >
                                            {isSaving ? "Saving..." : "Save"}
                                        </Button>
                                    </div>
                                </div>
                            ) : isUser ? (
                                <div className="whitespace-pre-wrap">{content}</div>
                            ) : (
                                <MarkdownRenderer content={content} />
                            )}

                            {/* Image attachments */}
                            {imageParts && imageParts.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {imageParts.map((img, idx) => (
                                        <a
                                            key={idx}
                                            href={img.url}
                                            download={img.filename || `image-${idx}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <img
                                                src={img.url}
                                                alt={img.filename || "Image"}
                                                className="max-w-xs max-h-64 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                                            />
                                        </a>
                                    ))}
                                </div>
                            )}

                            {/* File attachments */}
                            {files && files.length > 0 && (
                                <FileList
                                    files={files}
                                    title="Files"
                                    className="mt-3 pt-3 border-t border-current/10"
                                />
                            )}
                        </div>

                        {/* Actions Bar - Always visible on mobile, hover on desktop */}
                        <div
                            className={cn(
                                "flex items-center gap-1 px-1 sm:px-2",
                                isUser ? "flex-row-reverse" : "flex-row"
                            )}
                        >
                            {/* Timestamp and edit indicator */}
                            <div className={cn("flex items-center gap-1", isUser ? "flex-row-reverse" : "flex-row")}>
                                {timestamp && (
                                    <span className="text-[10px] sm:text-xs text-muted-foreground/60 select-none">
                                        {formatTimestamp(timestamp)}
                                    </span>
                                )}
                                {isEdited && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="text-[10px] sm:text-xs text-muted-foreground/60 select-none flex items-center gap-0.5 cursor-help">
                                                <History className="h-3 w-3" />
                                                <span className="hidden sm:inline">(edited)</span>
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Edited {editHistory.length} time(s)</p>
                                            {metadata?.lastEditedAt && (
                                                <p className="text-xs opacity-70">
                                                    Last: {new Date(metadata.lastEditedAt).toLocaleString()}
                                                </p>
                                            )}
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                            </div>

                            {/* Action buttons - always visible on mobile (smaller), hover on desktop */}
                            {!isEditing && (
                                <div
                                    className={cn(
                                        "flex items-center gap-0.5 sm:gap-1",
                                        // Always visible on mobile with lower opacity, hover reveals on desktop
                                        "opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity",
                                        isUser ? "flex-row-reverse" : "flex-row"
                                    )}
                                >
                                    {!isUser && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 sm:h-7 sm:w-7 min-w-[32px] min-h-[32px] text-muted-foreground hover:text-foreground active:scale-95"
                                                    onClick={handleSpeak}
                                                >
                                                    {isSpeaking ? (
                                                        <VolumeX className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                                    ) : (
                                                        <Volume2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                                    )}
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {isSpeaking ? "Stop audio" : "Play audio"}
                                            </TooltipContent>
                                        </Tooltip>
                                    )}
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 sm:h-7 sm:w-7 min-w-[32px] min-h-[32px] text-muted-foreground hover:text-foreground active:scale-95"
                                                onClick={onCopy}
                                            >
                                                {isCopied ? (
                                                    <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                                ) : (
                                                    <Copy className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                                )}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Copy message</TooltipContent>
                                    </Tooltip>

                                    {/* Edit button for user messages */}
                                    {isUser && id && onEdit && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 sm:h-7 sm:w-7 min-w-[32px] min-h-[32px] text-muted-foreground hover:text-foreground active:scale-95"
                                                    onClick={handleStartEdit}
                                                >
                                                    <Pencil className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Edit message</TooltipContent>
                                        </Tooltip>
                                    )}

                                    {/* Regenerate button for assistant messages */}
                                    {!isUser && onRegenerate && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 sm:h-7 sm:w-7 min-w-[32px] min-h-[32px] text-muted-foreground hover:text-foreground active:scale-95"
                                                    onClick={onRegenerate}
                                                    disabled={isRegenerating}
                                                >
                                                    <RefreshCw
                                                        className={cn(
                                                            "h-4 w-4 sm:h-3.5 sm:w-3.5",
                                                            isRegenerating && "animate-spin"
                                                        )}
                                                    />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Regenerate response</TooltipContent>
                                        </Tooltip>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
});
