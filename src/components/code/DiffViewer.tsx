"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    ToggleGroup,
    ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { SplitSquareHorizontal, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import * as Diff from "diff";

interface DiffViewerProps {
    oldCode: string;
    newCode: string;
    oldTitle?: string;
    newTitle?: string;
    language?: string;
    className?: string;
}

type ViewMode = "unified" | "split";

interface DiffLine {
    type: "added" | "removed" | "unchanged";
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
}

function parseDiff(oldCode: string, newCode: string): DiffLine[] {
    const diff = Diff.diffLines(oldCode, newCode);
    const lines: DiffLine[] = [];
    let oldLineNumber = 1;
    let newLineNumber = 1;

    for (const part of diff) {
        const partLines = part.value.split("\n");
        // Remove last empty line if exists
        if (partLines[partLines.length - 1] === "") {
            partLines.pop();
        }

        for (const line of partLines) {
            if (part.added) {
                lines.push({
                    type: "added",
                    content: line,
                    newLineNumber: newLineNumber++,
                });
            } else if (part.removed) {
                lines.push({
                    type: "removed",
                    content: line,
                    oldLineNumber: oldLineNumber++,
                });
            } else {
                lines.push({
                    type: "unchanged",
                    content: line,
                    oldLineNumber: oldLineNumber++,
                    newLineNumber: newLineNumber++,
                });
            }
        }
    }

    return lines;
}

function getStats(lines: DiffLine[]) {
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
        if (line.type === "added") additions++;
        if (line.type === "removed") deletions++;
    }

    return { additions, deletions };
}

export function DiffViewer({
    oldCode,
    newCode,
    oldTitle = "Original",
    newTitle = "Modified",
    language,
    className,
}: DiffViewerProps) {
    const [viewMode, setViewMode] = useState<ViewMode>("unified");
    
    const diffLines = useMemo(() => parseDiff(oldCode, newCode), [oldCode, newCode]);
    const stats = useMemo(() => getStats(diffLines), [diffLines]);

    return (
        <div className={cn("rounded-lg border bg-[#0d1117] overflow-hidden", className)}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
                <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="bg-green-900/30 text-green-400">
                        +{stats.additions}
                    </Badge>
                    <Badge variant="secondary" className="bg-red-900/30 text-red-400">
                        -{stats.deletions}
                    </Badge>
                    {language && (
                        <Badge variant="secondary" className="text-xs bg-[#21262d] text-gray-400">
                            {language}
                        </Badge>
                    )}
                </div>
                <ToggleGroup
                    type="single"
                    value={viewMode}
                    onValueChange={(value) => value && setViewMode(value as ViewMode)}
                    className="bg-[#21262d] rounded-md p-0.5"
                >
                    <ToggleGroupItem
                        value="unified"
                        size="sm"
                        className="h-7 px-2 text-gray-400 data-[state=on]:bg-[#30363d] data-[state=on]:text-white"
                    >
                        <Rows3 className="h-4 w-4 mr-1" />
                        Unified
                    </ToggleGroupItem>
                    <ToggleGroupItem
                        value="split"
                        size="sm"
                        className="h-7 px-2 text-gray-400 data-[state=on]:bg-[#30363d] data-[state=on]:text-white"
                    >
                        <SplitSquareHorizontal className="h-4 w-4 mr-1" />
                        Split
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>

            {/* Content */}
            <ScrollArea className="max-h-[500px]">
                {viewMode === "unified" ? (
                    <UnifiedDiff lines={diffLines} />
                ) : (
                    <SplitDiff 
                        lines={diffLines} 
                        oldTitle={oldTitle} 
                        newTitle={newTitle} 
                    />
                )}
            </ScrollArea>
        </div>
    );
}

function UnifiedDiff({ lines }: { lines: DiffLine[] }) {
    return (
        <div className="font-mono text-sm">
            {lines.map((line, index) => (
                <div
                    key={index}
                    className={cn(
                        "flex leading-6 border-l-4",
                        line.type === "added" && "bg-green-900/20 border-green-500",
                        line.type === "removed" && "bg-red-900/20 border-red-500",
                        line.type === "unchanged" && "border-transparent"
                    )}
                >
                    {/* Line numbers */}
                    <div className="flex-shrink-0 w-16 text-right pr-2 text-gray-500 select-none">
                        <span className="inline-block w-7">
                            {line.oldLineNumber || " "}
                        </span>
                        <span className="inline-block w-7">
                            {line.newLineNumber || " "}
                        </span>
                    </div>
                    {/* Prefix */}
                    <span
                        className={cn(
                            "flex-shrink-0 w-6 text-center select-none",
                            line.type === "added" && "text-green-400",
                            line.type === "removed" && "text-red-400"
                        )}
                    >
                        {line.type === "added" && "+"}
                        {line.type === "removed" && "-"}
                        {line.type === "unchanged" && " "}
                    </span>
                    {/* Content */}
                    <pre className="flex-1 overflow-x-auto px-2">
                        <code
                            className={cn(
                                line.type === "added" && "text-green-300",
                                line.type === "removed" && "text-red-300",
                                line.type === "unchanged" && "text-gray-300"
                            )}
                        >
                            {line.content || " "}
                        </code>
                    </pre>
                </div>
            ))}
        </div>
    );
}

function SplitDiff({
    lines,
    oldTitle,
    newTitle,
}: {
    lines: DiffLine[];
    oldTitle: string;
    newTitle: string;
}) {
    // Build side-by-side view
    const leftLines: (DiffLine | null)[] = [];
    const rightLines: (DiffLine | null)[] = [];

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (!line) break;

        if (line.type === "unchanged") {
            leftLines.push(line);
            rightLines.push(line);
            i++;
        } else if (line.type === "removed") {
            // Collect consecutive removed lines
            const removed: DiffLine[] = [];
            while (i < lines.length && lines[i]?.type === "removed") {
                removed.push(lines[i]!);
                i++;
            }
            // Collect consecutive added lines
            const added: DiffLine[] = [];
            while (i < lines.length && lines[i]?.type === "added") {
                added.push(lines[i]!);
                i++;
            }
            // Pair them up
            const maxLen = Math.max(removed.length, added.length);
            for (let j = 0; j < maxLen; j++) {
                leftLines.push(removed[j] || null);
                rightLines.push(added[j] || null);
            }
        } else {
            // Added without corresponding removed
            leftLines.push(null);
            rightLines.push(line);
            i++;
        }
    }

    return (
        <div className="flex font-mono text-sm">
            {/* Left side (old) */}
            <div className="flex-1 border-r border-[#30363d]">
                <div className="px-3 py-1 bg-[#161b22] border-b border-[#30363d] text-xs text-gray-400">
                    {oldTitle}
                </div>
                {leftLines.map((line, index) => (
                    <div
                        key={index}
                        className={cn(
                            "flex leading-6",
                            line?.type === "removed" && "bg-red-900/20"
                        )}
                    >
                        <div className="flex-shrink-0 w-10 text-right pr-2 text-gray-500 select-none">
                            {line?.oldLineNumber || " "}
                        </div>
                        <pre className="flex-1 overflow-x-auto px-2">
                            <code
                                className={cn(
                                    line?.type === "removed" ? "text-red-300" : "text-gray-300"
                                )}
                            >
                                {line?.content || " "}
                            </code>
                        </pre>
                    </div>
                ))}
            </div>

            {/* Right side (new) */}
            <div className="flex-1">
                <div className="px-3 py-1 bg-[#161b22] border-b border-[#30363d] text-xs text-gray-400">
                    {newTitle}
                </div>
                {rightLines.map((line, index) => (
                    <div
                        key={index}
                        className={cn(
                            "flex leading-6",
                            line?.type === "added" && "bg-green-900/20"
                        )}
                    >
                        <div className="flex-shrink-0 w-10 text-right pr-2 text-gray-500 select-none">
                            {line?.newLineNumber || " "}
                        </div>
                        <pre className="flex-1 overflow-x-auto px-2">
                            <code
                                className={cn(
                                    line?.type === "added" ? "text-green-300" : "text-gray-300"
                                )}
                            >
                                {line?.content || " "}
                            </code>
                        </pre>
                    </div>
                ))}
            </div>
        </div>
    );
}
