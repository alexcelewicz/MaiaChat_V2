"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSearch } from "@/lib/hooks/useSearch";
import { Search, MessageSquare, FileText, Star, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const router = useRouter();

    const { results, isLoading } = useSearch(query, open);

    // Reset state when dialog opens/closes
    useEffect(() => {
        if (!open) {
            setQuery("");
            setSelectedIndex(0);
        }
    }, [open]);

    // Reset selection when results change
    useEffect(() => {
        setSelectedIndex(0);
    }, [results]);

    // Handle keyboard navigation
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
            } else if (e.key === "Enter" && results.length > 0) {
                e.preventDefault();
                const selected = results[selectedIndex];
                if (selected) {
                    router.push(`/chat/${selected.id}`);
                    onOpenChange(false);
                }
            }
        },
        [results, selectedIndex, router, onOpenChange]
    );

    const handleSelect = (id: string) => {
        router.push(`/chat/${id}`);
        onOpenChange(false);
    };

    // Highlight matching text
    const highlightMatch = (text: string, query: string) => {
        if (!query) return text;
        
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const index = lowerText.indexOf(lowerQuery);
        
        if (index === -1) return text;
        
        return (
            <>
                {text.slice(0, index)}
                <mark className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
                    {text.slice(index, index + query.length)}
                </mark>
                {text.slice(index + query.length)}
            </>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[550px] p-0 gap-0">
                <DialogHeader className="px-4 py-3 border-b">
                    <DialogTitle className="sr-only">Search Conversations</DialogTitle>
                    <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search conversations..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 h-8"
                            autoFocus
                        />
                        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                </DialogHeader>

                <ScrollArea className="max-h-[400px]">
                    {query.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Type to search conversations</p>
                            <p className="text-xs mt-1">Search by title or message content</p>
                        </div>
                    ) : results.length === 0 && !isLoading ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No results found</p>
                            <p className="text-xs mt-1">Try different keywords</p>
                        </div>
                    ) : (
                        <div className="py-2">
                            {results.map((result, index) => (
                                <button
                                    key={result.id}
                                    onClick={() => handleSelect(result.id)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    className={cn(
                                        "w-full px-4 py-3 text-left flex items-start gap-3 transition-colors",
                                        index === selectedIndex
                                            ? "bg-accent"
                                            : "hover:bg-accent/50"
                                    )}
                                >
                                    <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium truncate">
                                                {highlightMatch(result.title, query)}
                                            </span>
                                            {result.isFavorite && (
                                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />
                                            )}
                                        </div>
                                        {result.matchType === "content" && result.snippet && (
                                            <p className="text-sm text-muted-foreground truncate mt-0.5">
                                                {highlightMatch(result.snippet, query)}
                                            </p>
                                        )}
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {result.matchType === "title" ? "Title match" : "Content match"} •{" "}
                                            {new Date(result.updatedAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                <div className="px-4 py-2 border-t text-xs text-muted-foreground flex items-center gap-4">
                    <span>
                        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↑↓</kbd> navigate
                    </span>
                    <span>
                        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↵</kbd> select
                    </span>
                    <span>
                        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">esc</kbd> close
                    </span>
                </div>
            </DialogContent>
        </Dialog>
    );
}
