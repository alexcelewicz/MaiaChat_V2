"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Database,
    FileText,
    Loader2,
    Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Document {
    id: string;
    filename: string;
    status: string;
}

export interface RAGConfig {
    enabled: boolean;
    documentIds: string[];
    topK: number;
}

interface RAGToggleProps {
    config: RAGConfig;
    onChange: (config: RAGConfig) => void;
    className?: string;
}

export function RAGToggle({ config, onChange, className }: RAGToggleProps) {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchDocuments();
        }
    }, [isOpen]);

    const fetchDocuments = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/documents?status=processed");
            if (!response.ok) throw new Error("Failed to fetch documents");
            const data = await response.json();
            setDocuments(data.documents || []);
        } catch (error) {
            console.error("Fetch documents error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleDocument = (docId: string) => {
        const newDocIds = config.documentIds.includes(docId)
            ? config.documentIds.filter(id => id !== docId)
            : [...config.documentIds, docId];
        
        onChange({ ...config, documentIds: newDocIds });
    };

    const selectAllDocuments = () => {
        onChange({ ...config, documentIds: documents.map(d => d.id) });
    };

    const clearAllDocuments = () => {
        onChange({ ...config, documentIds: [] });
    };

    const toggleEnabled = (enabled: boolean) => {
        onChange({ ...config, enabled });
    };

    const setTopK = (value: number[]) => {
        onChange({ ...config, topK: value[0] ?? config.topK });
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant={config.enabled ? "default" : "outline"}
                    size="sm"
                    className={cn(
                        "gap-2",
                        config.enabled && "bg-primary text-primary-foreground",
                        className
                    )}
                >
                    <Database className="h-4 w-4" />
                    RAG
                    {config.enabled && config.documentIds.length > 0 && (
                        <span className="ml-1 text-xs bg-primary-foreground/20 px-1.5 py-0.5 rounded">
                            {config.documentIds.length}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Enable RAG</Label>
                            <p className="text-xs text-muted-foreground">
                                Search documents for context
                            </p>
                        </div>
                        <Switch
                            checked={config.enabled}
                            onCheckedChange={toggleEnabled}
                        />
                    </div>

                    {config.enabled && (
                        <>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm">Documents</Label>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-xs"
                                            onClick={selectAllDocuments}
                                        >
                                            All
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-xs"
                                            onClick={clearAllDocuments}
                                        >
                                            None
                                        </Button>
                                    </div>
                                </div>

                                {isLoading ? (
                                    <div className="flex items-center justify-center py-4">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : documents.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                        No processed documents available
                                    </p>
                                ) : (
                                    <ScrollArea className="h-[150px]">
                                        <div className="space-y-2">
                                            {documents.map(doc => (
                                                <div
                                                    key={doc.id}
                                                    className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                                                    onClick={() => toggleDocument(doc.id)}
                                                >
                                                    <Checkbox
                                                        checked={config.documentIds.includes(doc.id)}
                                                        onCheckedChange={() => toggleDocument(doc.id)}
                                                    />
                                                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                    <span className="text-sm truncate flex-1">
                                                        {doc.filename}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                )}
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm">Results per query</Label>
                                    <span className="text-sm text-muted-foreground">
                                        {config.topK}
                                    </span>
                                </div>
                                <Slider
                                    value={[config.topK]}
                                    onValueChange={setTopK}
                                    min={1}
                                    max={10}
                                    step={1}
                                />
                            </div>
                        </>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
