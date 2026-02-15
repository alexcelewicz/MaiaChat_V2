"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    FileText,
    FileCode,
    FileJson,
    File,
    Download,
    Eye,
    Copy,
    Check,
    ExternalLink,
    FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

export interface FileInfo {
    path: string;
    name: string;
    size?: number;
    language?: string;
    content?: string;
    isNew?: boolean;
}

interface FileAttachmentProps {
    file: FileInfo;
    className?: string;
}

interface FilePreviewDialogProps {
    file: FileInfo;
    children: React.ReactNode;
}

// ============================================================================
// Utilities
// ============================================================================

function formatFileSize(bytes?: number): string {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileIcon(filename: string): React.ReactNode {
    const ext = filename.split(".").pop()?.toLowerCase() || "";

    const codeExtensions = ["js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "cs", "php", "swift"];
    const jsonExtensions = ["json", "yaml", "yml", "toml"];
    const textExtensions = ["txt", "md", "markdown", "rst"];

    if (codeExtensions.includes(ext)) {
        return <FileCode className="w-4 h-4" />;
    }
    if (jsonExtensions.includes(ext)) {
        return <FileJson className="w-4 h-4" />;
    }
    if (textExtensions.includes(ext)) {
        return <FileText className="w-4 h-4" />;
    }
    return <File className="w-4 h-4" />;
}

function getLanguageFromFilename(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const languageMap: Record<string, string> = {
        js: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        py: "python",
        rb: "ruby",
        go: "go",
        rs: "rust",
        java: "java",
        c: "c",
        cpp: "cpp",
        h: "c",
        hpp: "cpp",
        cs: "csharp",
        php: "php",
        swift: "swift",
        kt: "kotlin",
        scala: "scala",
        json: "json",
        yaml: "yaml",
        yml: "yaml",
        md: "markdown",
        html: "html",
        css: "css",
        scss: "scss",
        sql: "sql",
        sh: "bash",
        bash: "bash",
        zsh: "bash",
    };
    return languageMap[ext] || "plaintext";
}

// ============================================================================
// File Preview Dialog
// ============================================================================

function FilePreviewDialog({ file, children }: FilePreviewDialogProps) {
    const [content, setContent] = useState<string | null>(file.content || null);
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const loadPreview = useCallback(async () => {
        if (content || isLoading) return;

        setIsLoading(true);
        try {
            const res = await fetch(
                `/api/files?path=${encodeURIComponent(file.path)}&action=preview`,
                { credentials: "include" }
            );

            if (res.ok) {
                const data = await res.json();
                setContent(data.content || null);
            } else {
                toast.error("Failed to load file preview");
            }
        } catch (error) {
            console.error("Failed to load preview:", error);
            toast.error("Failed to load file preview");
        } finally {
            setIsLoading(false);
        }
    }, [file.path, content, isLoading]);

    const handleCopy = useCallback(async () => {
        if (!content) return;
        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            toast.success("Copied to clipboard");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Failed to copy");
        }
    }, [content]);

    const handleDownload = useCallback(() => {
        window.open(`/api/files?path=${encodeURIComponent(file.path)}&action=download`, "_blank");
    }, [file.path]);

    const language = file.language || getLanguageFromFilename(file.name);

    return (
        <Dialog>
            <DialogTrigger asChild onClick={loadPreview}>
                {children}
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {getFileIcon(file.name)}
                            <DialogTitle className="font-mono text-sm">
                                {file.name}
                            </DialogTitle>
                            {file.isNew && (
                                <Badge variant="outline" className="text-green-600 border-green-600">
                                    New
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCopy}
                                disabled={!content}
                            >
                                {copied ? (
                                    <Check className="w-4 h-4 mr-1" />
                                ) : (
                                    <Copy className="w-4 h-4 mr-1" />
                                )}
                                Copy
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDownload}
                            >
                                <Download className="w-4 h-4 mr-1" />
                                Download
                            </Button>
                        </div>
                    </div>
                    <DialogDescription className="text-xs font-mono text-muted-foreground">
                        {file.path}
                        {file.size && ` • ${formatFileSize(file.size)}`}
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 mt-4 border rounded-lg bg-muted/30">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-32">
                            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                        </div>
                    ) : content ? (
                        <pre className="p-4 text-sm font-mono overflow-x-auto">
                            <code className={`language-${language}`}>{content}</code>
                        </pre>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                            <File className="w-8 h-8 mb-2 opacity-50" />
                            <p>Preview not available</p>
                            <Button
                                variant="link"
                                size="sm"
                                onClick={handleDownload}
                                className="mt-2"
                            >
                                Download file instead
                            </Button>
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================================
// Single File Attachment
// ============================================================================

export function FileAttachment({ file, className }: FileAttachmentProps) {
    const handleDownload = useCallback(() => {
        window.open(`/api/files?path=${encodeURIComponent(file.path)}&action=download`, "_blank");
    }, [file.path]);

    return (
        <div
            className={cn(
                "flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors group",
                className
            )}
        >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                {getFileIcon(file.name)}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{file.name}</span>
                    {file.isNew && (
                        <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                            New
                        </Badge>
                    )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                    {file.path}
                    {file.size && ` • ${formatFileSize(file.size)}`}
                </div>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <FilePreviewDialog file={file}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="w-4 h-4" />
                    </Button>
                </FilePreviewDialog>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleDownload}
                >
                    <Download className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}

// ============================================================================
// Multiple Files List
// ============================================================================

interface FileListProps {
    files: FileInfo[];
    title?: string;
    className?: string;
    maxVisible?: number;
}

export function FileList({ files, title, className, maxVisible = 5 }: FileListProps) {
    const [showAll, setShowAll] = useState(false);

    if (files.length === 0) return null;

    const visibleFiles = showAll ? files : files.slice(0, maxVisible);
    const hiddenCount = files.length - maxVisible;

    return (
        <div className={cn("space-y-2", className)}>
            {title && (
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <FolderOpen className="w-4 h-4" />
                    {title} ({files.length})
                </div>
            )}

            <div className="space-y-1">
                {visibleFiles.map((file, index) => (
                    <FileAttachment key={`${file.path}-${index}`} file={file} />
                ))}
            </div>

            {hiddenCount > 0 && !showAll && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAll(true)}
                    className="w-full text-muted-foreground"
                >
                    Show {hiddenCount} more file{hiddenCount > 1 ? "s" : ""}
                </Button>
            )}

            {showAll && files.length > maxVisible && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAll(false)}
                    className="w-full text-muted-foreground"
                >
                    Show less
                </Button>
            )}
        </div>
    );
}

// ============================================================================
// Compact File Badge (for inline display)
// ============================================================================

interface FileBadgeProps {
    file: FileInfo;
    className?: string;
}

export function FileBadge({ file, className }: FileBadgeProps) {
    return (
        <FilePreviewDialog file={file}>
            <Badge
                variant="outline"
                className={cn(
                    "cursor-pointer hover:bg-accent gap-1.5 py-1 px-2",
                    className
                )}
            >
                {getFileIcon(file.name)}
                <span className="font-mono text-xs">{file.name}</span>
                {file.isNew && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                )}
            </Badge>
        </FilePreviewDialog>
    );
}

export default FileAttachment;
