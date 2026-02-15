"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
    FileText,
    FileSpreadsheet,
    FileJson,
    ChevronDown,
    ChevronUp,
    ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface RAGSource {
    documentId: string;
    chunkId: string;
    filename?: string;
    score?: number;
}

interface SourceCitationProps {
    sources: RAGSource[];
    className?: string;
}

function getFileIcon(filename?: string) {
    if (!filename) return FileText;
    const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
    if ([".xlsx", ".csv"].includes(ext)) return FileSpreadsheet;
    if (ext === ".json") return FileJson;
    return FileText;
}

function formatScore(score?: number): string {
    if (!score) return "";
    return `${Math.round(score * 100)}%`;
}

export function SourceCitation({ sources, className }: SourceCitationProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!sources || sources.length === 0) {
        return null;
    }

    // Group sources by document
    const groupedSources = sources.reduce((acc, source) => {
        const key = source.documentId;
        if (!acc[key]) {
            acc[key] = {
                documentId: source.documentId,
                filename: source.filename,
                chunks: [],
            };
        }
        acc[key].chunks.push(source);
        return acc;
    }, {} as Record<string, { documentId: string; filename?: string; chunks: RAGSource[] }>);

    const documents = Object.values(groupedSources);

    return (
        <div className={cn("mt-3 border-t pt-3", className)}>
            <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <FileText className="h-3 w-3 mr-1" />
                {sources.length} source{sources.length !== 1 ? "s" : ""} used
                {isExpanded ? (
                    <ChevronUp className="h-3 w-3 ml-1" />
                ) : (
                    <ChevronDown className="h-3 w-3 ml-1" />
                )}
            </Button>

            {isExpanded && (
                <div className="mt-2 space-y-2">
                    {documents.map((doc) => {
                        const FileIcon = getFileIcon(doc.filename);
                        
                        return (
                            <div
                                key={doc.documentId}
                                className="flex items-start gap-2 p-2 rounded-md bg-muted/50"
                            >
                                <FileIcon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">
                                        {doc.filename || "Document"}
                                    </p>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {doc.chunks.map((chunk, index) => (
                                            <Badge
                                                key={chunk.chunkId}
                                                variant="secondary"
                                                className="text-[10px] h-5"
                                            >
                                                Chunk {index + 1}
                                                {chunk.score && (
                                                    <span className="ml-1 text-muted-foreground">
                                                        {formatScore(chunk.score)}
                                                    </span>
                                                )}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// Inline citation marker component
export function CitationMarker({
    sourceIndex,
    source,
}: {
    sourceIndex: number;
    source: RAGSource;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    className="inline-flex items-center justify-center h-4 min-w-4 px-1 text-[10px] font-medium rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                    {sourceIndex}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" side="top">
                <div className="space-y-2">
                    <p className="text-sm font-medium">
                        {source.filename || "Document"}
                    </p>
                    {source.score && (
                        <p className="text-xs text-muted-foreground">
                            Relevance: {formatScore(source.score)}
                        </p>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
