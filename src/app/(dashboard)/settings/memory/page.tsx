"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Brain, Trash2, Loader2, Database, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface MemoryDocument {
    name: string;
    displayName?: string;
    state?: string;
    createTime?: string;
    sizeBytes?: string;
}

interface StoreInfo {
    exists: boolean;
    documentCount: number;
    storeId?: string;
}

export default function MemorySettingsPage() {
    const [memories, setMemories] = useState<MemoryDocument[]>([]);
    const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [isClearing, setIsClearing] = useState(false);

    const fetchMemories = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/memory");
            if (!response.ok) throw new Error("Failed to fetch memories");
            const data = await response.json();
            setMemories(data.memories || []);
            setStoreInfo(data.storeInfo || null);
        } catch (error) {
            console.error("Fetch memories error:", error);
            toast.error("Failed to load memories");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchMemories();
    }, []);

    const handleDeleteMemory = async (documentName: string) => {
        try {
            setIsDeleting(documentName);
            const response = await fetch(`/api/memory?documentName=${encodeURIComponent(documentName)}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to delete memory");
            }

            toast.success("Memory deleted");
            fetchMemories();
        } catch (error) {
            console.error("Delete memory error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to delete memory");
        } finally {
            setIsDeleting(null);
        }
    };

    const handleClearAll = async () => {
        try {
            setIsClearing(true);
            const response = await fetch("/api/memory?clearAll=true", {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to clear memories");
            }

            toast.success("All memories cleared");
            setMemories([]);
            setStoreInfo({ exists: false, documentCount: 0 });
        } catch (error) {
            console.error("Clear memories error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to clear memories");
        } finally {
            setIsClearing(false);
        }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return "Unknown";
        return new Date(dateStr).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const formatSize = (bytes?: string) => {
        if (!bytes) return "";
        const kb = parseInt(bytes, 10) / 1024;
        return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(1)} KB`;
    };

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Conversation Memory</h1>
                <p className="text-muted-foreground mt-1">
                    Manage your stored conversation memories. Memories help the AI remember context from past conversations.
                </p>
            </div>

            {/* Memory Store Status */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Memory Store
                    </CardTitle>
                    <CardDescription>
                        Status of your conversation memory store
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading store info...
                        </div>
                    ) : storeInfo ? (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Badge variant={storeInfo.exists ? "default" : "secondary"}>
                                    {storeInfo.exists ? "Active" : "Not Created"}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                    {storeInfo.documentCount} {storeInfo.documentCount === 1 ? "memory" : "memories"} stored
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={fetchMemories}>
                                    <RefreshCw className="h-4 w-4 mr-1" />
                                    Refresh
                                </Button>
                                {storeInfo.exists && memories.length > 0 && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="sm" disabled={isClearing}>
                                                {isClearing ? (
                                                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4 mr-1" />
                                                )}
                                                Clear All
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Clear All Memories</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will permanently delete all stored conversation memories.
                                                    The AI will no longer have access to any past conversation context.
                                                    This action cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={handleClearAll}
                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                >
                                                    Delete All Memories
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">
                            Unable to load store info
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Saved Memories List */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5" />
                        Saved Memories
                    </CardTitle>
                    <CardDescription>
                        Each memory is a summarized version of a past conversation.
                        Enable the Memory toggle in the chat to use these during conversations.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : memories.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No memories saved yet.</p>
                            <p className="text-sm mt-1">
                                Enable the Memory toggle in the chat toolbar to start building conversation memory.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {memories.map((memory) => (
                                <div
                                    key={memory.name}
                                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm truncate">
                                                {memory.displayName || memory.name?.split("/").pop() || "Unknown"}
                                            </span>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    memory.state === "STATE_ACTIVE"
                                                        ? "text-green-600 border-green-300"
                                                        : memory.state === "STATE_PENDING"
                                                            ? "text-yellow-600 border-yellow-300"
                                                            : "text-muted-foreground"
                                                }
                                            >
                                                {memory.state === "STATE_ACTIVE"
                                                    ? "Active"
                                                    : memory.state === "STATE_PENDING"
                                                        ? "Processing"
                                                        : memory.state === "STATE_FAILED"
                                                            ? "Failed"
                                                            : memory.state || "Unknown"}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                            <span>{formatDate(memory.createTime)}</span>
                                            {memory.sizeBytes && (
                                                <span>{formatSize(memory.sizeBytes)}</span>
                                            )}
                                        </div>
                                    </div>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive flex-shrink-0"
                                                disabled={isDeleting === memory.name}
                                            >
                                                {isDeleting === memory.name ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Delete Memory</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Are you sure you want to delete this memory?
                                                    The AI will no longer have access to this conversation context.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => handleDeleteMemory(memory.name)}
                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                >
                                                    Delete
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">About Conversation Memory</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>
                        Conversation memory stores summarized versions of your past conversations
                        in a Gemini File Search store.
                    </p>
                    <p>
                        When the Memory toggle is enabled in the chat, the AI will search
                        your stored memories for relevant context before responding.
                    </p>
                    <p>
                        Requires a Google API key (for Gemini File Search stores).
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
