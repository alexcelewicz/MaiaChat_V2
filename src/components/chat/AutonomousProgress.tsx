"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Square,
    Zap,
    Wrench,
    MessageSquare,
    Send,
    Loader2,
    ChevronDown,
    ChevronRight,
    FileCode,
    FolderOpen,
    Terminal,
    CheckCircle2,
    XCircle,
    Copy,
    ExternalLink,
    Eye,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileInfo, ActivityLogEntry } from "@/lib/autonomous/types";

export interface AutonomousProgressState {
    step: number;
    maxSteps: number;
    summary: string;
    toolCalls: number;
    tokens: number;
    isComplete: boolean;
    currentTool?: string;
    // Enhanced tracking
    filesCreated?: FileInfo[];
    filesModified?: FileInfo[];
    commandsExecuted?: number;
    activityLog?: ActivityLogEntry[];
    error?: string;
}

interface AutonomousProgressProps {
    taskKey: string;
    progress: AutonomousProgressState;
    onAbort: () => void;
    onSteer?: (message: string) => void;
    onDismiss?: () => void;
    className?: string;
}

export function AutonomousProgress({
    taskKey,
    progress,
    onAbort,
    onSteer,
    onDismiss,
    className,
}: AutonomousProgressProps) {
    const [steerMessage, setSteerMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [showActivityLog, setShowActivityLog] = useState(true);
    const [showFilePreview, setShowFilePreview] = useState<FileInfo | null>(null);
    const [copiedPath, setCopiedPath] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const activityLogRef = useRef<HTMLDivElement>(null);

    const progressPercent = progress.maxSteps > 0
        ? Math.min((progress.step / progress.maxSteps) * 100, 100)
        : 0;

    const handleSteer = async () => {
        if (!steerMessage.trim() || !onSteer || isSending) return;

        setIsSending(true);
        try {
            await onSteer(steerMessage.trim());
            setSteerMessage("");
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSteer();
        }
    };

    const copyToClipboard = async (text: string, path?: string) => {
        await navigator.clipboard.writeText(text);
        if (path) {
            setCopiedPath(path);
            setTimeout(() => setCopiedPath(null), 2000);
        }
    };

    // Auto-scroll activity log to bottom
    useEffect(() => {
        if (activityLogRef.current && !progress.isComplete) {
            activityLogRef.current.scrollTop = activityLogRef.current.scrollHeight;
        }
    }, [progress.activityLog, progress.isComplete]);

    const getActivityIcon = (entry: ActivityLogEntry) => {
        if (entry.status === 'running') {
            return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
        }
        if (entry.status === 'error') {
            return <XCircle className="h-3 w-3 text-red-500" />;
        }
        switch (entry.type) {
            case 'file_created':
                return <FileCode className="h-3 w-3 text-green-500" />;
            case 'file_read':
                return <FolderOpen className="h-3 w-3 text-blue-500" />;
            case 'command':
                return <Terminal className="h-3 w-3 text-purple-500" />;
            case 'tool_call':
            case 'tool_result':
                return <Wrench className="h-3 w-3 text-orange-500" />;
            default:
                return <CheckCircle2 className="h-3 w-3 text-green-500" />;
        }
    };

    const filesCreated = progress.filesCreated || [];
    const hasFiles = filesCreated.length > 0;

    return (
        <div
            className={cn(
                "border rounded-lg bg-muted/30 overflow-hidden",
                progress.isComplete && !progress.error ? "border-green-500/30" : "",
                progress.error ? "border-red-500/30" : "",
                className
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b bg-muted/50">
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                        progress.isComplete && !progress.error
                            ? "bg-green-500/20 text-green-500"
                            : progress.error
                                ? "bg-red-500/20 text-red-500"
                                : progress.currentTool
                                    ? "bg-orange-500/20 text-orange-500"
                                    : "bg-primary/20 text-primary animate-pulse"
                    )}>
                        {progress.error ? (
                            <XCircle className="h-4 w-4" />
                        ) : progress.isComplete ? (
                            <CheckCircle2 className="h-4 w-4" />
                        ) : progress.currentTool ? (
                            <Wrench className="h-4 w-4 animate-spin" />
                        ) : (
                            <Zap className="h-4 w-4" />
                        )}
                    </div>
                    <div>
                        <h4 className="text-sm font-medium">
                            {progress.error
                                ? "Task Failed"
                                : progress.isComplete
                                    ? "Task Complete"
                                    : progress.currentTool
                                        ? `Running: ${progress.currentTool}`
                                        : "Autonomous Mode"}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                            {taskKey.slice(0, 8)}...
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {progress.isComplete && onDismiss && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onDismiss}
                            className="h-8 gap-1.5"
                        >
                            <X className="h-3 w-3" />
                            Dismiss
                        </Button>
                    )}
                    {!progress.isComplete && (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={onAbort}
                            className="h-8 gap-1.5"
                        >
                            <Square className="h-3 w-3" />
                            Stop
                        </Button>
                    )}
                </div>
            </div>

            {/* Progress bar - only show when not complete */}
            {!progress.isComplete && (
                <div className="px-3 pt-3 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                            Step {progress.step} of {progress.maxSteps}
                        </span>
                        <span className="text-muted-foreground">
                            {Math.round(progressPercent)}%
                        </span>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
                </div>
            )}

            {/* Current Summary */}
            {progress.summary && !progress.isComplete && (
                <div className="px-3 pt-2">
                    <div className="text-sm text-muted-foreground bg-background/50 rounded-md p-2">
                        {progress.summary}
                    </div>
                </div>
            )}

            {/* Files Created Section */}
            {hasFiles && (
                <div className="px-3 pt-3">
                    <div className="border rounded-md overflow-hidden">
                        <div className="bg-green-500/10 px-3 py-2 border-b flex items-center gap-2">
                            <FileCode className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                Files Created ({filesCreated.length})
                            </span>
                        </div>
                        <div className="divide-y">
                            {filesCreated.map((file, idx) => (
                                <div key={idx} className="px-3 py-2 flex items-center justify-between hover:bg-muted/50">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <FileCode className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-mono truncate">{file.name}</p>
                                            <p className="text-xs text-muted-foreground truncate">{file.path}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {file.size && (
                                            <span className="text-xs text-muted-foreground mr-2">
                                                {file.size > 1024 ? `${(file.size / 1024).toFixed(1)}KB` : `${file.size}B`}
                                            </span>
                                        )}
                                        {file.content && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0"
                                                onClick={() => setShowFilePreview(file)}
                                                title="Preview"
                                            >
                                                <Eye className="h-3 w-3" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0"
                                            onClick={() => copyToClipboard(file.path, file.path)}
                                            title="Copy path"
                                        >
                                            {copiedPath === file.path ? (
                                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                                            ) : (
                                                <Copy className="h-3 w-3" />
                                            )}
                                        </Button>
                                        {file.path.endsWith('.html') && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0"
                                                onClick={() => window.open(`file://${file.path}`, '_blank')}
                                                title="Open in browser"
                                            >
                                                <ExternalLink className="h-3 w-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Activity Log */}
            {progress.activityLog && progress.activityLog.length > 0 && (
                <div className="px-3 pt-3">
                    <button
                        onClick={() => setShowActivityLog(!showActivityLog)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
                    >
                        {showActivityLog ? (
                            <ChevronDown className="h-3 w-3" />
                        ) : (
                            <ChevronRight className="h-3 w-3" />
                        )}
                        Activity Log ({progress.activityLog.length})
                    </button>
                    {showActivityLog && (
                        <div
                            ref={activityLogRef}
                            className="mt-2 max-h-40 overflow-y-auto border rounded-md bg-background/50"
                        >
                            <div className="divide-y">
                                {progress.activityLog.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className={cn(
                                            "px-2 py-1.5 flex items-start gap-2 text-xs",
                                            entry.status === 'running' && "bg-blue-500/5",
                                            entry.status === 'error' && "bg-red-500/5"
                                        )}
                                    >
                                        <div className="mt-0.5 flex-shrink-0">
                                            {getActivityIcon(entry)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className={cn(
                                                "truncate",
                                                entry.status === 'error' && "text-red-600 dark:text-red-400"
                                            )}>
                                                {entry.summary}
                                            </p>
                                            {entry.details && (
                                                <p className="text-muted-foreground truncate">
                                                    {entry.details}
                                                </p>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                            {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground px-3 py-2">
                <div className="flex items-center gap-1">
                    <Wrench className="h-3 w-3" />
                    <span>{progress.toolCalls} tools</span>
                </div>
                <div className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    <span>{progress.tokens.toLocaleString()} tokens</span>
                </div>
                {hasFiles && (
                    <div className="flex items-center gap-1">
                        <FileCode className="h-3 w-3" />
                        <span>{filesCreated.length} files</span>
                    </div>
                )}
                {progress.commandsExecuted !== undefined && progress.commandsExecuted > 0 && (
                    <div className="flex items-center gap-1">
                        <Terminal className="h-3 w-3" />
                        <span>{progress.commandsExecuted} commands</span>
                    </div>
                )}
            </div>

            {/* Steering Input - only show when task is running */}
            {!progress.isComplete && onSteer && (
                <div className="px-3 pb-3 pt-2 border-t">
                    <div className="flex items-center gap-2">
                        <Input
                            ref={inputRef}
                            placeholder="Send a correction or follow-up..."
                            value={steerMessage}
                            onChange={(e) => setSteerMessage(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isSending}
                            className="h-9 text-sm"
                        />
                        <Button
                            size="sm"
                            onClick={handleSteer}
                            disabled={!steerMessage.trim() || isSending}
                            className="h-9 px-3"
                        >
                            {isSending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                        Send a message to redirect the task mid-execution
                    </p>
                </div>
            )}

            {/* File Preview Modal */}
            {showFilePreview && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-background border rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between p-3 border-b">
                            <div className="flex items-center gap-2">
                                <FileCode className="h-4 w-4" />
                                <span className="font-medium">{showFilePreview.name}</span>
                                <span className="text-xs text-muted-foreground">
                                    ({showFilePreview.language})
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => showFilePreview.content && copyToClipboard(showFilePreview.content)}
                                >
                                    <Copy className="h-4 w-4 mr-1" />
                                    Copy
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowFilePreview(null)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <ScrollArea className="flex-1 p-4">
                            <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                                <code>{showFilePreview.content || 'Content not available'}</code>
                            </pre>
                        </ScrollArea>
                    </div>
                </div>
            )}
        </div>
    );
}
