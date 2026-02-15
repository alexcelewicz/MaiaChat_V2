"use client";

import { Button } from "@/components/ui/button";
import { SendHorizontal, Paperclip, Mic, MicOff, Upload, Files, FileSearch, Loader2, Wrench, Settings2, X, Zap, ChevronDown, Phone, MessageSquare, Check, FolderOpen, ImageIcon } from "lucide-react";
import type { FileUIPart } from "ai";
import { SkillsPanel } from "./SkillsPanel";
import { FileBrowser } from "./FileBrowser";
import { useRef, useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ModelSelector } from "./ModelSelector";
import { AgentSelector } from "./AgentSelector";
import { Switch } from "@/components/ui/switch";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { FileUpload } from "@/components/documents/FileUpload";
import { StoreSelector } from "@/components/gemini/StoreSelector";
import { useVoiceRecording } from "@/lib/hooks/useVoiceRecording";
import type { AgentConfig, OrchestrationMode } from "@/types/agent";
import { cn } from "@/lib/utils";

interface ChatInputProps {
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    isLoading: boolean;
    selectedModel: string;
    onModelChange: (modelId: string) => void;
    conversationId?: string | null;
    onConversationCreated?: (id: string) => void;
    onAgentsChanged?: (agents: AgentConfig[], mode: OrchestrationMode, maxRounds: number, synthesizerAgentId?: string) => void;
    onRagEnabledChanged?: (enabled: boolean) => void;
    ragEnabled?: boolean;
    geminiFileSearchEnabled?: boolean;
    selectedGeminiStoreIds?: string[];
    onGeminiStoreIdsChanged?: (ids: string[]) => void;
    toolsEnabled?: boolean;
    onToolsEnabledChanged?: (enabled: boolean) => void;
    skillsEnabled?: boolean;
    onSkillsEnabledChanged?: (enabled: boolean) => void;
    onEnabledSkillsChange?: (slugs: string[]) => void;
    voiceModeActive?: boolean;
    onVoiceModeToggle?: (enabled: boolean) => void;
    memoryEnabled?: boolean;
    autonomousMode?: boolean;
    onAutonomousModeChanged?: (enabled: boolean) => void;
    pendingImages?: FileUIPart[];
    onImagesSelected?: (files: FileUIPart[]) => void;
    onRemoveImage?: (index: number) => void;
}

export function ChatInput({
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    selectedModel,
    onModelChange,
    conversationId,
    onConversationCreated,
    onAgentsChanged,
    onRagEnabledChanged,
    ragEnabled = false,
    geminiFileSearchEnabled = false,
    selectedGeminiStoreIds = [],
    onGeminiStoreIdsChanged,
    toolsEnabled = true,
    onToolsEnabledChanged,
    skillsEnabled = true,
    onSkillsEnabledChanged,
    onEnabledSkillsChange,
    voiceModeActive = false,
    onVoiceModeToggle,
    memoryEnabled = false,
    autonomousMode = false,
    onAutonomousModeChanged,
    pendingImages = [],
    onImagesSelected,
    onRemoveImage,
}: ChatInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
    const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);
    const [isDraggingImage, setIsDraggingImage] = useState(false);

    // Voice input mode: "conversation" (full voice chat) or "dictation" (speech-to-text)
    // Using lazy initialization to load from localStorage without triggering effect warnings
    const [voiceInputMode, setVoiceInputMode] = useState<"conversation" | "dictation">(() => {
        if (typeof window === "undefined") return "conversation";
        const saved = localStorage.getItem("maiachat-voice-input-mode");
        return saved === "dictation" ? "dictation" : "conversation";
    });
    const [voiceModeDropdownOpen, setVoiceModeDropdownOpen] = useState(false);

    const handleVoiceInputModeChange = (mode: "conversation" | "dictation") => {
        setVoiceInputMode(mode);
        localStorage.setItem("maiachat-voice-input-mode", mode);
        setVoiceModeDropdownOpen(false);
    };

    // Voice recording hook
    const {
        isRecording,
        isTranscribing,
        audioLevel,
        toggleRecording,
        cancelRecording,
    } = useVoiceRecording({
        onTranscription: (text) => {
            // Create a synthetic event to update the input
            const event = {
                target: { value: input ? `${input} ${text}` : text }
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(event);
            toast.success('Voice transcribed!');
        },
        onError: (error) => {
            toast.error('Voice input failed', { description: error });
        },
        maxDuration: 60,
    });

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto"; // Reset height
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [input]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const form = e.currentTarget.closest("form");
            if (form) form.requestSubmit();
        }
    };

    const handleUploadDocument = () => {
        setIsUploadDialogOpen(true);
    };

    const handleViewDocuments = () => {
        router.push("/documents");
    };

    const handleBrowseWorkspace = () => {
        setIsFileBrowserOpen(true);
    };

    const handleFileSelect = (filePath: string) => {
        // Insert file path into the input
        const fileRef = `[file: ${filePath}]`;
        const event = {
            target: { value: input ? `${input}\n${fileRef}` : fileRef }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        handleInputChange(event);
        setIsFileBrowserOpen(false);
        toast.success("File reference added to message");
    };

    const handleUploadComplete = () => {
        setIsUploadDialogOpen(false);
        toast.success("Document uploaded!", {
            description: "You can now enable RAG to use this document in your conversations.",
            action: {
                label: "View Documents",
                onClick: () => router.push("/documents"),
            },
        });
    };

    const handleVoiceClick = () => {
        if (isTranscribing) return;

        if (voiceInputMode === "conversation") {
            // Start voice conversation mode (full duplex with Deepgram)
            onVoiceModeToggle?.(true);
        } else {
            // Dictation mode - just transcribe to text input
            toggleRecording();
        }
    };

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const MAX_IMAGES = 5;
    const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

    const processImageFiles = (fileList: File[]) => {
        const currentCount = pendingImages.length;
        const imageFiles = fileList.filter(f => ACCEPTED_IMAGE_TYPES.includes(f.type));
        const nonImages = fileList.length - imageFiles.length;

        if (nonImages > 0) {
            toast.error(`${nonImages} file(s) skipped — only PNG, JPEG, GIF, WebP allowed`);
        }

        const oversized = imageFiles.filter(f => f.size > MAX_IMAGE_SIZE);
        if (oversized.length > 0) {
            toast.error(`${oversized.length} image(s) exceed 10MB limit`);
        }

        const valid = imageFiles.filter(f => f.size <= MAX_IMAGE_SIZE);
        const available = MAX_IMAGES - currentCount;
        if (valid.length > available) {
            toast.error(`Max ${MAX_IMAGES} images per message — ${valid.length - available} dropped`);
        }

        const toAdd = valid.slice(0, available);
        if (toAdd.length === 0) return;

        // Convert to data URLs and create FileUIPart[]
        Promise.all(
            toAdd.map(
                (file) =>
                    new Promise<FileUIPart>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            resolve({
                                type: "file",
                                mediaType: file.type,
                                filename: file.name,
                                url: reader.result as string,
                            });
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    })
            )
        ).then((parts) => {
            onImagesSelected?.(parts);
        });
    };

    const handleAttachImage = () => {
        imageInputRef.current?.click();
    };

    const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            processImageFiles(Array.from(e.target.files));
            e.target.value = ""; // Reset so the same file can be re-selected
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes("Files")) {
            setIsDraggingImage(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingImage(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingImage(false);
        if (e.dataTransfer.files) {
            processImageFiles(Array.from(e.dataTransfer.files));
        }
    };

    // Count active features for the mobile badge (only features shown in mobile settings)
    const activeFeatureCount = [ragEnabled, toolsEnabled, skillsEnabled, autonomousMode].filter(Boolean).length;
    const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

    // Toggle item component for mobile settings
    const ToggleItem = ({
        icon: Icon,
        label,
        description,
        checked,
        onCheckedChange
    }: {
        icon: React.ElementType;
        label: string;
        description: string;
        checked: boolean;
        onCheckedChange?: (checked: boolean) => void;
    }) => (
        <div
            className="flex items-center justify-between py-3 px-1 border-b border-border/50 last:border-0"
            onClick={() => onCheckedChange?.(!checked)}
        >
            <div className="flex items-center gap-3">
                <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center",
                    checked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                    <Icon className="h-4 w-4" />
                </div>
                <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
            </div>
            <Switch
                checked={checked}
                onCheckedChange={onCheckedChange}
                className="scale-90"
            />
        </div>
    );

    return (
        <div className="w-full bg-background border-t px-3 sm:px-4 py-2 sm:py-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:pb-3">
            <form
                onSubmit={handleSubmit}
                className="relative max-w-5xl mx-auto"
                suppressHydrationWarning
            >
                {/* Hidden image file input */}
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleImageInputChange}
                />

                {/* Desktop: Full toolbar | Mobile: Compact toolbar */}
                <div className="flex items-center justify-between mb-2 px-1">
                    {/* Mobile compact toolbar */}
                    <div className="flex md:hidden items-center gap-1.5">
                        <ModelSelector
                            selectedModel={selectedModel}
                            onModelChange={onModelChange}
                            disabled={isLoading}
                            compact
                        />
                        <AgentSelector
                            conversationId={conversationId || null}
                            onConversationCreated={onConversationCreated}
                            onAgentsChanged={onAgentsChanged}
                        />
                        {/* Mobile settings popover */}
                        <Popover open={mobileSettingsOpen} onOpenChange={setMobileSettingsOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-2 gap-1.5 relative"
                                >
                                    <Settings2 className="h-4 w-4" />
                                    {activeFeatureCount > 0 && (
                                        <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                                            {activeFeatureCount}
                                        </span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-[calc(100vw-2rem)] max-w-sm p-0"
                                align="end"
                                sideOffset={8}
                            >
                                <div className="flex items-center justify-between p-3 border-b">
                                    <h3 className="font-semibold text-sm">Chat Settings</h3>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 -mr-2"
                                        onClick={() => setMobileSettingsOpen(false)}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="p-3 max-h-[60vh] overflow-y-auto">
                                    <ToggleItem
                                        icon={FileSearch}
                                        label="RAG Search"
                                        description="Search your uploaded documents for context"
                                        checked={ragEnabled}
                                        onCheckedChange={onRagEnabledChanged}
                                    />
                                    <ToggleItem
                                        icon={Wrench}
                                        label="Tools"
                                        description="Web search, file access, code execution"
                                        checked={toolsEnabled}
                                        onCheckedChange={onToolsEnabledChanged}
                                    />
                                    <ToggleItem
                                        icon={Zap}
                                        label="Autonomous"
                                        description="AI works continuously until task complete"
                                        checked={autonomousMode}
                                        onCheckedChange={onAutonomousModeChanged}
                                    />
                                    {/* Store Selector (shows when Gemini or Memory is enabled) */}
                                    {(geminiFileSearchEnabled || memoryEnabled) && onGeminiStoreIdsChanged && (
                                        <div className="py-2 px-1 border-b border-border/50">
                                            <StoreSelector
                                                selectedStoreIds={selectedGeminiStoreIds}
                                                onStoreChange={onGeminiStoreIdsChanged}
                                                multiSelect={true}
                                                compact={false}
                                            />
                                        </div>
                                    )}
                                    <div className="pt-3">
                                        <SkillsPanel
                                            skillsEnabled={skillsEnabled}
                                            onToggleSkills={onSkillsEnabledChanged || (() => { })}
                                            onEnabledSkillsChange={onEnabledSkillsChange}
                                        />
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Desktop full toolbar */}
                    <div className="hidden md:flex items-center gap-2">
                        <ModelSelector
                            selectedModel={selectedModel}
                            onModelChange={onModelChange}
                            disabled={isLoading}
                            compact
                        />
                        <AgentSelector
                            conversationId={conversationId || null}
                            onConversationCreated={onConversationCreated}
                            onAgentsChanged={onAgentsChanged}
                        />
                        {/* Feature Toggles - RAG, Tools, Auto (Memory & Gemini moved to Settings) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/50 cursor-pointer">
                                        <FileSearch className={`h-4 w-4 ${ragEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <span className="text-xs font-medium">RAG</span>
                                        <Switch
                                            checked={ragEnabled}
                                            onCheckedChange={onRagEnabledChanged}
                                            className="scale-75"
                                        />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                    <p className="font-medium">Retrieval-Augmented Generation</p>
                                    <p className="text-xs mt-1">Search your uploaded documents to provide relevant context for AI responses. Upload documents via the paperclip icon first.</p>
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/50 cursor-pointer">
                                        <Wrench className={`h-4 w-4 ${toolsEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <span className="text-xs font-medium">Tools</span>
                                        <Switch
                                            checked={toolsEnabled}
                                            onCheckedChange={onToolsEnabledChanged}
                                            className="scale-75"
                                        />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                    <p className="font-medium">AI Tools</p>
                                    <p className="text-xs mt-1">Allow AI to search the web, analyze files, execute code, and use external services during responses.</p>
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/50 cursor-pointer">
                                        <Zap className={`h-4 w-4 ${autonomousMode ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <span className="text-xs font-medium">Auto</span>
                                        <Switch
                                            checked={autonomousMode}
                                            onCheckedChange={onAutonomousModeChanged}
                                            className="scale-75"
                                        />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                    <p className="font-medium">Autonomous Mode</p>
                                    <p className="text-xs mt-1">AI works continuously on complex tasks without pausing for confirmation at each step. Ideal for multi-step workflows.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <SkillsPanel
                            skillsEnabled={skillsEnabled}
                            onToggleSkills={onSkillsEnabledChanged || (() => { })}
                            onEnabledSkillsChange={onEnabledSkillsChange}
                        />
                        {/* Store Selector (shows when Gemini or Memory is enabled) */}
                        {(geminiFileSearchEnabled || memoryEnabled) && onGeminiStoreIdsChanged && (
                            <StoreSelector
                                selectedStoreIds={selectedGeminiStoreIds}
                                onStoreChange={onGeminiStoreIdsChanged}
                                multiSelect={true}
                                compact={true}
                            />
                        )}
                    </div>

                    {/* Desktop keyboard hint - hidden on mobile */}
                    <div className="hidden md:block text-xs text-muted-foreground">
                        Press Enter to send, Shift+Enter for new line
                    </div>
                </div>

                {/* Input row */}
                <div className="flex items-end gap-1.5 sm:gap-2">
                    {/* File attachment dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 min-w-[44px] min-h-[44px] shrink-0 text-muted-foreground hover:text-foreground"
                                disabled={isLoading}
                            >
                                <Paperclip className="h-5 w-5" />
                                <span className="sr-only">Attach file</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={handleAttachImage} className="min-h-[44px]">
                                <ImageIcon className="mr-2 h-4 w-4" />
                                Attach Image
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleUploadDocument} className="min-h-[44px]">
                                <Upload className="mr-2 h-4 w-4" />
                                Upload Document
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleViewDocuments} className="min-h-[44px]">
                                <Files className="mr-2 h-4 w-4" />
                                View Documents
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleBrowseWorkspace} className="min-h-[44px]">
                                <FolderOpen className="mr-2 h-4 w-4" />
                                Browse Workspace
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div
                        className={cn(
                            "relative flex-1 rounded-md border bg-transparent shadow-sm focus-within:ring-1 focus-within:ring-ring transition-colors",
                            isDraggingImage
                                ? "border-primary border-dashed bg-primary/5"
                                : "border-input"
                        )}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        {/* Image preview strip */}
                        {pendingImages.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 px-3 pt-2">
                                {pendingImages.map((img, idx) => (
                                    <div key={idx} className="relative group/thumb">
                                        <img
                                            src={img.url}
                                            alt={img.filename || "Attached image"}
                                            className="h-12 w-12 rounded object-cover border"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => onRemoveImage?.(idx)}
                                            className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                                        >
                                            <X className="h-2.5 w-2.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {isDraggingImage && (
                            <div className="absolute inset-0 flex items-center justify-center bg-primary/5 rounded-md z-10 pointer-events-none">
                                <span className="text-sm text-primary font-medium">Drop images here</span>
                            </div>
                        )}
                        <textarea
                            ref={textareaRef}
                            className="flex min-h-[44px] w-full rounded-md bg-transparent px-3 py-3 text-base sm:text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-y-auto max-h-[200px]"
                            placeholder={pendingImages.length > 0 ? "Add a message about the image(s)..." : "Type a message..."}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={onKeyDown}
                            rows={1}
                            disabled={isLoading}
                            suppressHydrationWarning
                            enterKeyHint="send"
                            autoComplete="off"
                            autoCorrect="on"
                            autoCapitalize="sentences"
                        />
                    </div>

                    {/* Voice input button with dropdown */}
                    <div className="flex items-center shrink-0">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant={isRecording || voiceModeActive ? "destructive" : "ghost"}
                                        size="icon"
                                        className={cn(
                                            "h-11 w-9 min-h-[44px] rounded-r-none border-r-0 transition-all",
                                            isRecording
                                                ? "animate-pulse bg-red-500 hover:bg-red-600 text-white"
                                                : voiceModeActive
                                                    ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                                                    : isTranscribing
                                                        ? "text-primary"
                                                        : "text-muted-foreground hover:text-foreground"
                                        )}
                                        style={isRecording ? {
                                            boxShadow: `0 0 ${Math.round(audioLevel * 20)}px ${Math.round(audioLevel * 10)}px rgba(239, 68, 68, ${audioLevel * 0.5})`
                                        } : undefined}
                                        onClick={handleVoiceClick}
                                        disabled={isLoading || isTranscribing}
                                        aria-label={
                                            isTranscribing ? "Transcribing..."
                                            : isRecording ? "Stop recording"
                                            : voiceModeActive ? "Voice conversation active"
                                            : voiceInputMode === "conversation" ? "Start voice conversation"
                                            : "Start dictation"
                                        }
                                    >
                                        {isTranscribing ? (
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        ) : isRecording ? (
                                            <MicOff className="h-5 w-5" />
                                        ) : voiceInputMode === "conversation" ? (
                                            <Phone className="h-5 w-5" />
                                        ) : (
                                            <Mic className="h-5 w-5" />
                                        )}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {voiceInputMode === "conversation"
                                        ? "Voice Conversation: Click to start a hands-free conversation with AI using voice input and output"
                                        : "Dictation: Click to transcribe your speech into the text input"
                                    }
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {/* Dropdown for voice mode selection */}
                        <DropdownMenu open={voiceModeDropdownOpen} onOpenChange={setVoiceModeDropdownOpen}>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant={isRecording || voiceModeActive ? "destructive" : "ghost"}
                                    size="icon"
                                    className={cn(
                                        "h-11 w-5 min-h-[44px] rounded-l-none px-0 transition-all",
                                        isRecording
                                            ? "bg-red-500 hover:bg-red-600 text-white"
                                            : voiceModeActive
                                                ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                                                : "text-muted-foreground hover:text-foreground"
                                    )}
                                    disabled={isLoading || isTranscribing || isRecording}
                                >
                                    <ChevronDown className="h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                                <DropdownMenuItem
                                    onClick={() => handleVoiceInputModeChange("conversation")}
                                    className="flex items-start gap-3 py-3"
                                >
                                    <Phone className="h-4 w-4 mt-0.5 shrink-0" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">Voice Conversation</span>
                                            {voiceInputMode === "conversation" && <Check className="h-3 w-3 text-primary" />}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Full hands-free conversation with voice input and AI speech output
                                        </p>
                                    </div>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => handleVoiceInputModeChange("dictation")}
                                    className="flex items-start gap-3 py-3"
                                >
                                    <MessageSquare className="h-4 w-4 mt-0.5 shrink-0" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">Dictation</span>
                                            {voiceInputMode === "dictation" && <Check className="h-3 w-3 text-primary" />}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Transcribe speech to text - type messages by speaking
                                        </p>
                                    </div>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <Button
                        type="submit"
                        size="icon"
                        disabled={isLoading || (!input.trim() && pendingImages.length === 0)}
                        className="h-11 w-11 min-w-[44px] min-h-[44px] shrink-0"
                        aria-label="Send message"
                    >
                        <SendHorizontal className="h-5 w-5" />
                    </Button>
                </div>
            </form>
            {/* Disclaimer - smaller on mobile */}
            <div className="text-center text-[10px] sm:text-xs text-muted-foreground mt-1.5 sm:mt-2">
                MAIAChat can make mistakes. Check important info.
            </div>

            {/* Upload Document Dialog */}
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Upload Document</DialogTitle>
                        <DialogDescription>
                            Upload a document to use in your conversations with RAG-powered context.
                        </DialogDescription>
                    </DialogHeader>
                    <FileUpload onUploadComplete={handleUploadComplete} />
                </DialogContent>
            </Dialog>

            {/* Workspace File Browser */}
            <FileBrowser
                open={isFileBrowserOpen}
                onOpenChange={setIsFileBrowserOpen}
                onFileSelect={handleFileSelect}
                trigger={null}
            />
        </div>
    );
}
