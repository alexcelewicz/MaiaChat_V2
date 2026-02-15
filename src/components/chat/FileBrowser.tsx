"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
    FolderOpen,
    File,
    FileCode,
    FileText,
    FileJson,
    ChevronRight,
    ChevronLeft,
    Download,
    Eye,
    RefreshCw,
    Home,
    Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FileAttachment, type FileInfo } from "./FileAttachment";

// ============================================================================
// Types
// ============================================================================

interface DirectoryInfo {
    name: string;
    path: string;
}

interface WorkspaceFile {
    name: string;
    path: string;
    size: number;
    modified: string;
    isText: boolean;
}

// ============================================================================
// Utilities
// ============================================================================

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays === 1) {
        return "Yesterday";
    }
    if (diffDays < 7) {
        return `${diffDays} days ago`;
    }
    return date.toLocaleDateString();
}

function getFileIcon(filename: string): React.ReactNode {
    const ext = filename.split(".").pop()?.toLowerCase() || "";

    const codeExtensions = ["js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "cs", "php", "swift"];
    const jsonExtensions = ["json", "yaml", "yml", "toml"];
    const textExtensions = ["txt", "md", "markdown", "rst"];

    if (codeExtensions.includes(ext)) {
        return <FileCode className="w-4 h-4 text-blue-500" />;
    }
    if (jsonExtensions.includes(ext)) {
        return <FileJson className="w-4 h-4 text-yellow-500" />;
    }
    if (textExtensions.includes(ext)) {
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
    return <File className="w-4 h-4 text-gray-400" />;
}

// ============================================================================
// FileBrowser Component
// ============================================================================

interface FileBrowserProps {
    onFileSelect?: (filePath: string) => void;
    trigger?: React.ReactNode | null;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function FileBrowser({ onFileSelect, trigger, open, onOpenChange }: FileBrowserProps) {
    const [internalOpen, setInternalOpen] = useState(false);

    // Support both controlled and uncontrolled modes
    const isOpen = open !== undefined ? open : internalOpen;
    const setIsOpen = onOpenChange || setInternalOpen;
    const [currentPath, setCurrentPath] = useState("/");
    const [files, setFiles] = useState<WorkspaceFile[]>([]);
    const [directories, setDirectories] = useState<DirectoryInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [workspacePath, setWorkspacePath] = useState("");
    const [pathHistory, setPathHistory] = useState<string[]>([]);

    const loadDirectory = useCallback(async (subdir: string = "") => {
        setIsLoading(true);
        try {
            const res = await fetch(
                `/api/files?action=list&subdir=${encodeURIComponent(subdir)}`,
                { credentials: "include" }
            );

            if (res.ok) {
                const data = await res.json();
                setFiles(data.files || []);
                setDirectories(data.directories || []);
                setCurrentPath(data.path || "/");
                setWorkspacePath(data.workspacePath || "");
            } else {
                toast.error("Failed to load directory");
            }
        } catch (error) {
            console.error("Failed to load directory:", error);
            toast.error("Failed to load directory");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadDirectory();
        }
    }, [isOpen, loadDirectory]);

    const navigateTo = useCallback((path: string) => {
        setPathHistory((prev) => [...prev, currentPath]);
        loadDirectory(path);
    }, [currentPath, loadDirectory]);

    const navigateBack = useCallback(() => {
        if (pathHistory.length > 0) {
            const previousPath = pathHistory[pathHistory.length - 1];
            setPathHistory((prev) => prev.slice(0, -1));
            loadDirectory(previousPath === "/" ? "" : previousPath);
        }
    }, [pathHistory, loadDirectory]);

    const navigateHome = useCallback(() => {
        setPathHistory([]);
        loadDirectory("");
    }, [loadDirectory]);

    const handleFileClick = useCallback((file: WorkspaceFile) => {
        if (onFileSelect) {
            onFileSelect(file.path);
            setIsOpen(false);
        }
    }, [onFileSelect, setIsOpen]);

    const handleDownload = useCallback((file: WorkspaceFile, e: React.MouseEvent) => {
        e.stopPropagation();
        window.open(`/api/files?path=${encodeURIComponent(file.path)}&action=download`, "_blank");
    }, []);

    const breadcrumbs = currentPath === "/" ? [] : currentPath.split("/").filter(Boolean);

    const shouldRenderTrigger = trigger !== null;

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            {shouldRenderTrigger && (
                <SheetTrigger asChild>
                    {trigger || (
                        <Button variant="outline" size="sm">
                            <FolderOpen className="w-4 h-4 mr-2" />
                            Browse Files
                        </Button>
                    )}
                </SheetTrigger>
            )}
            <SheetContent className="w-[500px] sm:max-w-[500px]">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <FolderOpen className="w-5 h-5" />
                        Workspace Files
                    </SheetTitle>
                    <SheetDescription className="text-xs font-mono truncate">
                        {workspacePath}
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-4 space-y-4">
                    {/* Navigation */}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={navigateBack}
                            disabled={pathHistory.length === 0}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={navigateHome}
                            disabled={currentPath === "/"}
                        >
                            <Home className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => loadDirectory(currentPath === "/" ? "" : currentPath)}
                        >
                            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                        </Button>

                        {/* Breadcrumbs */}
                        <div className="flex-1 flex items-center gap-1 text-sm text-muted-foreground overflow-x-auto">
                            <button
                                onClick={navigateHome}
                                className="hover:text-foreground transition-colors"
                            >
                                workspace
                            </button>
                            {breadcrumbs.map((crumb, index) => (
                                <div key={index} className="flex items-center gap-1">
                                    <ChevronRight className="w-3 h-3" />
                                    <button
                                        onClick={() => navigateTo(breadcrumbs.slice(0, index + 1).join("/"))}
                                        className="hover:text-foreground transition-colors"
                                    >
                                        {crumb}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* File List */}
                    <ScrollArea className="h-[calc(100vh-200px)]">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-32">
                                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : directories.length === 0 && files.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                                <FolderOpen className="w-12 h-12 mb-2 opacity-30" />
                                <p>No files in this directory</p>
                            </div>
                        ) : (
                            <div className="space-y-1 pr-4">
                                {/* Directories */}
                                {directories.map((dir) => (
                                    <button
                                        key={dir.path}
                                        onClick={() => navigateTo(dir.path)}
                                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
                                    >
                                        <Folder className="w-5 h-5 text-blue-500" />
                                        <span className="flex-1 font-medium">{dir.name}</span>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                    </button>
                                ))}

                                {/* Files */}
                                {files.map((file) => (
                                    <div
                                        key={file.path}
                                        onClick={() => handleFileClick(file)}
                                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors cursor-pointer group"
                                    >
                                        {getFileIcon(file.name)}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate">
                                                {file.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatFileSize(file.size)} • {formatDate(file.modified)}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {file.isText && (
                                                <Badge variant="outline" className="text-xs">
                                                    Text
                                                </Badge>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={(e) => handleDownload(file, e)}
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>

                    {/* Stats */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                        <span>
                            {directories.length} folder{directories.length !== 1 ? "s" : ""},{" "}
                            {files.length} file{files.length !== 1 ? "s" : ""}
                        </span>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

export default FileBrowser;
