"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Database,
    Plus,
    Loader2,
    Trash2,
    FileText,
    RefreshCw,
    ChevronDown,
    ChevronRight,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GeminiStore } from "./StoreSelector";

// ============================================================================
// Types
// ============================================================================

interface StoreDocument {
    id: string;
    storeId: string;
    documentId: string | null;
    geminiDocumentName?: string | null;
    geminiState?: string | null;
    uploadedAt: string;
    document?: {
        id: string;
        filename: string;
        mimeType: string;
        size: number;
    } | null;
    /** Display name from Gemini API (for externally uploaded docs) */
    geminiDisplayName?: string | null;
    /** MIME type from Gemini API */
    geminiMimeType?: string | null;
    /** Size in bytes from Gemini API */
    geminiSizeBytes?: number | null;
    /** True if the document exists only in Gemini, not in local DB */
    isGeminiOnly?: boolean;
}

interface StoreWithDocs extends GeminiStore {
    storeDocuments?: StoreDocument[];
}

// ============================================================================
// Component
// ============================================================================

export function StoreManager() {
    const [stores, setStores] = useState<StoreWithDocs[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [newStoreName, setNewStoreName] = useState("");
    const [newStoreDescription, setNewStoreDescription] = useState("");
    const [creating, setCreating] = useState(false);
    const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
    const [loadingDocs, setLoadingDocs] = useState<string | null>(null);

    const fetchStores = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/gemini/stores");
            if (res.ok) {
                const data = await res.json();
                setStores(data.stores || []);
            }
        } catch (error) {
            console.error("Failed to fetch stores:", error);
            toast.error("Failed to load Gemini stores");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStores();
    }, [fetchStores]);

    const handleCreateStore = async () => {
        if (!newStoreName.trim()) return;
        try {
            setCreating(true);
            const res = await fetch("/api/gemini/stores", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    displayName: newStoreName.trim(),
                    description: newStoreDescription.trim() || undefined,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to create store");
            }

            toast.success("Store created successfully");
            setCreateOpen(false);
            setNewStoreName("");
            setNewStoreDescription("");
            fetchStores();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create store");
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteStore = async (storeId: string) => {
        try {
            const res = await fetch(`/api/gemini/stores/${storeId}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete store");
            toast.success("Store deleted");
            setStores((prev) => prev.filter((s) => s.id !== storeId));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete store");
        }
    };

    const handleExpandStore = async (storeId: string) => {
        if (expandedStoreId === storeId) {
            setExpandedStoreId(null);
            return;
        }

        setExpandedStoreId(storeId);

        // Always fetch fresh documents (external docs may have been added)
        try {
            setLoadingDocs(storeId);
            const res = await fetch(`/api/gemini/stores/${storeId}/documents`);
            if (res.ok) {
                const data = await res.json();
                setStores((prev) =>
                    prev.map((s) =>
                        s.id === storeId
                            ? { ...s, storeDocuments: data.documents || [] }
                            : s
                    )
                );
            }
        } catch (error) {
            console.error("Failed to fetch store documents:", error);
        } finally {
            setLoadingDocs(null);
        }
    };

    const handleRemoveDocument = async (storeId: string, sd: StoreDocument) => {
        try {
            if (sd.isGeminiOnly && sd.geminiDocumentName) {
                // For Gemini-only docs, delete via the Gemini document name
                const res = await fetch(`/api/gemini/stores/${storeId}/documents/${encodeURIComponent(sd.geminiDocumentName)}`, {
                    method: "DELETE",
                });
                if (!res.ok) throw new Error("Failed to remove document");
            } else if (sd.documentId) {
                const res = await fetch(`/api/gemini/stores/${storeId}/documents/${sd.documentId}`, {
                    method: "DELETE",
                });
                if (!res.ok) throw new Error("Failed to remove document");
            }

            // Update local state
            setStores((prev) =>
                prev.map((s) => {
                    if (s.id !== storeId) return s;
                    return {
                        ...s,
                        documentCount: Math.max((s.documentCount || 1) - 1, 0),
                        storeDocuments: s.storeDocuments?.filter(
                            (d) => d.id !== sd.id
                        ),
                    };
                })
            );
            toast.success("Document removed from store");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to remove document");
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Gemini File Search Stores</h3>
                    <p className="text-sm text-muted-foreground">
                        Persistent document stores for Gemini-powered retrieval
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={fetchStores}>
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    </Button>
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        New Store
                    </Button>
                </div>
            </div>

            {/* Store List */}
            {stores.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <Database className="h-12 w-12 text-muted-foreground mb-4" />
                        <CardTitle className="text-xl mb-2">No Stores Yet</CardTitle>
                        <CardDescription className="mb-4 max-w-md">
                            Create a Gemini File Search Store to organize documents for persistent,
                            AI-powered retrieval without expiration.
                        </CardDescription>
                        <Button onClick={() => setCreateOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Create Your First Store
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {stores.map((store) => {
                        const isExpanded = expandedStoreId === store.id;
                        return (
                            <Card key={store.id} className="overflow-hidden">
                                <div
                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                                    onClick={() => handleExpandStore(store.id)}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div
                                            className="w-4 h-4 rounded-full shrink-0"
                                            style={{ backgroundColor: store.color || "#6366f1" }}
                                        />
                                        <div className="min-w-0">
                                            <div className="font-medium truncate">
                                                {store.displayName}
                                            </div>
                                            {store.description && (
                                                <div className="text-xs text-muted-foreground truncate">
                                                    {store.description}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Badge variant="secondary" className="text-xs">
                                            {store.documentCount || 0} docs
                                        </Badge>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                "text-[10px]",
                                                store.status === "active" && "text-green-600 border-green-200",
                                                store.status === "creating" && "text-blue-600 border-blue-200",
                                                store.status === "error" && "text-red-600 border-red-200"
                                            )}
                                        >
                                            {store.status}
                                        </Badge>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete Store</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will permanently delete &quot;{store.displayName}&quot; and
                                                        all its documents from Gemini. This cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDeleteStore(store.id)}
                                                        className="bg-destructive text-destructive-foreground"
                                                    >
                                                        Delete
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                        {isExpanded ? (
                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        )}
                                    </div>
                                </div>

                                {/* Expanded documents list */}
                                {isExpanded && (
                                    <div className="border-t bg-muted/10 px-4 py-3">
                                        {loadingDocs === store.id ? (
                                            <div className="flex items-center justify-center py-4">
                                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                            </div>
                                        ) : !store.storeDocuments?.length ? (
                                            <div className="text-center py-4 text-sm text-muted-foreground">
                                                No documents in this store yet. Add documents from the Documents tab.
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {store.storeDocuments.map((sd) => {
                                                    const docName = sd.document?.filename
                                                        || sd.geminiDisplayName
                                                        || "Unknown";
                                                    const docSize = sd.document?.size
                                                        ?? sd.geminiSizeBytes
                                                        ?? null;
                                                    return (
                                                        <div
                                                            key={sd.id}
                                                            className="flex items-center justify-between p-2 rounded-md bg-background border"
                                                        >
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                                                <span className="text-sm truncate">
                                                                    {docName}
                                                                </span>
                                                                {docSize !== null && (
                                                                    <span className="text-xs text-muted-foreground shrink-0">
                                                                        {formatFileSize(docSize)}
                                                                    </span>
                                                                )}
                                                                {sd.isGeminiOnly && (
                                                                    <Badge variant="secondary" className="text-[10px] shrink-0">
                                                                        external
                                                                    </Badge>
                                                                )}
                                                                <Badge
                                                                    variant="outline"
                                                                    className={cn(
                                                                        "text-[10px] shrink-0",
                                                                        sd.geminiState === "active" && "text-green-600",
                                                                        sd.geminiState === "pending" && "text-blue-600",
                                                                        sd.geminiState === "failed" && "text-red-600"
                                                                    )}
                                                                >
                                                                    {sd.geminiState || "pending"}
                                                                </Badge>
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                                                                onClick={() =>
                                                                    handleRemoveDocument(store.id, sd)
                                                                }
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Create Store Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Create Gemini Store</DialogTitle>
                        <DialogDescription>
                            Create a new persistent document store for Gemini file search.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="create-store-name">Store Name</Label>
                            <Input
                                id="create-store-name"
                                value={newStoreName}
                                onChange={(e) => setNewStoreName(e.target.value)}
                                placeholder="e.g., Project Documentation"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="create-store-desc">Description (optional)</Label>
                            <Input
                                id="create-store-desc"
                                value={newStoreDescription}
                                onChange={(e) => setNewStoreDescription(e.target.value)}
                                placeholder="e.g., Technical docs for Project X"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateStore}
                            disabled={!newStoreName.trim() || creating}
                        >
                            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Store
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
