"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Folder,
    FolderOpen,
    File,
    FileText,
    FileCode,
    FileJson,
    FileImage,
    ChevronRight,
    ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileTreeNode, ParsedFile } from "@/lib/code/parser";

interface FileTreeProps {
    tree: FileTreeNode;
    selectedPath?: string;
    onSelectFile?: (file: ParsedFile) => void;
    className?: string;
}

// Get icon for file type
function getFileIcon(filename: string) {
    const ext = filename.split(".").pop()?.toLowerCase();
    
    switch (ext) {
        case "ts":
        case "tsx":
        case "js":
        case "jsx":
        case "py":
        case "rs":
        case "go":
        case "java":
        case "cpp":
        case "c":
        case "h":
            return FileCode;
        case "json":
            return FileJson;
        case "md":
        case "txt":
            return FileText;
        case "png":
        case "jpg":
        case "jpeg":
        case "gif":
        case "svg":
        case "ico":
            return FileImage;
        default:
            return File;
    }
}

// Get color for file type
function getFileColor(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    
    switch (ext) {
        case "ts":
        case "tsx":
            return "text-blue-400";
        case "js":
        case "jsx":
            return "text-yellow-400";
        case "py":
            return "text-green-400";
        case "rs":
            return "text-orange-400";
        case "go":
            return "text-cyan-400";
        case "json":
            return "text-yellow-300";
        case "css":
        case "scss":
            return "text-purple-400";
        case "html":
            return "text-red-400";
        case "md":
            return "text-gray-400";
        default:
            return "text-gray-400";
    }
}

interface TreeNodeProps {
    node: FileTreeNode;
    depth: number;
    selectedPath?: string;
    onSelectFile?: (file: ParsedFile) => void;
    defaultExpanded?: boolean;
}

function TreeNode({
    node,
    depth,
    selectedPath,
    onSelectFile,
    defaultExpanded = true,
}: TreeNodeProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const isSelected = node.path === selectedPath;

    if (node.type === "file") {
        const Icon = getFileIcon(node.name);
        const colorClass = getFileColor(node.name);

        return (
            <Button
                variant="ghost"
                className={cn(
                    "w-full justify-start h-7 px-2 hover:bg-muted",
                    isSelected && "bg-primary/10 text-primary"
                )}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={() => node.file && onSelectFile?.(node.file)}
            >
                <Icon className={cn("h-4 w-4 mr-2 flex-shrink-0", colorClass)} />
                <span className="truncate text-sm">{node.name}</span>
            </Button>
        );
    }

    // Directory
    return (
        <div>
            <Button
                variant="ghost"
                className="w-full justify-start h-7 px-2 hover:bg-muted"
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {isExpanded ? (
                    <ChevronDown className="h-4 w-4 mr-1 flex-shrink-0 text-muted-foreground" />
                ) : (
                    <ChevronRight className="h-4 w-4 mr-1 flex-shrink-0 text-muted-foreground" />
                )}
                {isExpanded ? (
                    <FolderOpen className="h-4 w-4 mr-2 flex-shrink-0 text-yellow-500" />
                ) : (
                    <Folder className="h-4 w-4 mr-2 flex-shrink-0 text-yellow-500" />
                )}
                <span className="truncate text-sm font-medium">{node.name}</span>
            </Button>
            {isExpanded && node.children && (
                <div>
                    {node.children.map((child) => (
                        <TreeNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            selectedPath={selectedPath}
                            onSelectFile={onSelectFile}
                            defaultExpanded={depth < 2}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export function FileTree({
    tree,
    selectedPath,
    onSelectFile,
    className,
}: FileTreeProps) {
    // Count total files
    const countFiles = (node: FileTreeNode): number => {
        if (node.type === "file") return 1;
        return (node.children || []).reduce((sum, child) => sum + countFiles(child), 0);
    };

    const fileCount = countFiles(tree);

    return (
        <div className={cn("rounded-lg border bg-card", className)}>
            <div className="px-3 py-2 border-b bg-muted/50">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{tree.name}</span>
                    <span className="text-xs text-muted-foreground">
                        {fileCount} file{fileCount !== 1 ? "s" : ""}
                    </span>
                </div>
            </div>
            <ScrollArea className="h-[300px]">
                <div className="py-1">
                    {tree.children?.map((child) => (
                        <TreeNode
                            key={child.path}
                            node={child}
                            depth={0}
                            selectedPath={selectedPath}
                            onSelectFile={onSelectFile}
                        />
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
