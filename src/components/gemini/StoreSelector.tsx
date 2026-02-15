"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, ChevronDown, FolderOpen, Plus, Loader2, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

export interface GeminiStore {
    id: string;
    geminiStoreName: string;
    displayName: string;
    description?: string | null;
    color?: string | null;
    documentCount?: number | null;
    status: string;
}

interface StoreSelectorProps {
    stores?: GeminiStore[];
    selectedStoreIds: string[];
    onStoreChange: (ids: string[]) => void;
    onCreateStore?: (store: GeminiStore) => void;
    multiSelect?: boolean;
    loading?: boolean;
    compact?: boolean;
    className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function StoreSelector({
    stores: propStores,
    selectedStoreIds,
    onStoreChange,
    onCreateStore,
    multiSelect = true,
    loading: externalLoading,
    compact = false,
    className,
}: StoreSelectorProps) {
    const [open, setOpen] = useState(false);
    const [stores, setStores] = useState<GeminiStore[]>(propStores || []);
    const [loading, setLoading] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [newStoreName, setNewStoreName] = useState("");
    const [creating, setCreating] = useState(false);

    // Fetch stores if not provided as prop
    const fetchStores = useCallback(async () => {
        if (propStores) return;
        try {
            setLoading(true);
            const res = await fetch("/api/gemini/stores");
            if (res.ok) {
                const data = await res.json();
                setStores(data.stores || []);
            }
        } catch (error) {
            console.error("Failed to fetch Gemini stores:", error);
        } finally {
            setLoading(false);
        }
    }, [propStores]);

    useEffect(() => {
        if (!propStores) {
            fetchStores();
        }
    }, [fetchStores, propStores]);

    useEffect(() => {
        if (propStores) {
            setStores(propStores);
        }
    }, [propStores]);

    const isLoading = externalLoading || loading;

    const handleToggle = (storeId: string) => {
        if (multiSelect) {
            const updated = selectedStoreIds.includes(storeId)
                ? selectedStoreIds.filter((id) => id !== storeId)
                : [...selectedStoreIds, storeId];
            onStoreChange(updated);
        } else {
            onStoreChange(selectedStoreIds.includes(storeId) ? [] : [storeId]);
            setOpen(false);
        }
    };

    const handleCreateStore = async () => {
        if (!newStoreName.trim()) return;
        try {
            setCreating(true);
            const res = await fetch("/api/gemini/stores", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ displayName: newStoreName.trim() }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to create store");
            }

            const data = await res.json();
            const newStore = data.store as GeminiStore;

            setStores((prev) => [...prev, newStore]);
            onStoreChange([...selectedStoreIds, newStore.id]);
            onCreateStore?.(newStore);
            setCreateDialogOpen(false);
            setNewStoreName("");
            toast.success("Store created successfully");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create store");
        } finally {
            setCreating(false);
        }
    };

    const selectedStores = stores.filter((s) => selectedStoreIds.includes(s.id));
    const label = selectedStores.length === 0
        ? "Select stores"
        : selectedStores.length === 1
            ? selectedStores[0].displayName
            : `${selectedStores.length} stores`;

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size={compact ? "sm" : "default"}
                        role="combobox"
                        aria-expanded={open}
                        className={cn(
                            "justify-between",
                            compact ? "h-8 text-xs px-2 gap-1" : "w-full",
                            className
                        )}
                    >
                        <div className="flex items-center gap-1.5 truncate">
                            <Database className={cn("shrink-0", compact ? "h-3 w-3" : "h-4 w-4")} />
                            <span className="truncate">{label}</span>
                        </div>
                        <ChevronDown className={cn("shrink-0 opacity-50", compact ? "h-3 w-3" : "h-4 w-4")} />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            <ScrollArea className="max-h-60">
                                <div className="p-1">
                                    {stores.length === 0 ? (
                                        <div className="py-6 text-center text-sm text-muted-foreground">
                                            No stores yet. Create one to get started.
                                        </div>
                                    ) : (
                                        stores.map((store) => {
                                            const isSelected = selectedStoreIds.includes(store.id);
                                            return (
                                                <button
                                                    key={store.id}
                                                    onClick={() => handleToggle(store.id)}
                                                    className={cn(
                                                        "flex items-center justify-between w-full px-3 py-2 rounded-md text-sm transition-colors",
                                                        isSelected
                                                            ? "bg-primary/10 text-primary"
                                                            : "hover:bg-muted"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div
                                                            className="w-3 h-3 rounded-full shrink-0"
                                                            style={{ backgroundColor: store.color || "#6366f1" }}
                                                        />
                                                        <span className="truncate font-medium">
                                                            {store.displayName}
                                                        </span>
                                                        <Badge variant="secondary" className="text-[10px] px-1 shrink-0">
                                                            {store.documentCount || 0}
                                                        </Badge>
                                                    </div>
                                                    {isSelected && (
                                                        <Check className="h-4 w-4 text-primary shrink-0" />
                                                    )}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </ScrollArea>
                            <div className="border-t p-1">
                                <button
                                    onClick={() => {
                                        setOpen(false);
                                        setCreateDialogOpen(true);
                                    }}
                                    className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-muted text-muted-foreground"
                                >
                                    <Plus className="h-4 w-4" />
                                    Create New Store
                                </button>
                            </div>
                        </>
                    )}
                </PopoverContent>
            </Popover>

            {/* Create Store Dialog */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Create Gemini Store</DialogTitle>
                        <DialogDescription>
                            Create a named store to organize documents for Gemini file search.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="store-name">Store Name</Label>
                            <Input
                                id="store-name"
                                value={newStoreName}
                                onChange={(e) => setNewStoreName(e.target.value)}
                                placeholder="e.g., Project Docs, Research Papers"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleCreateStore();
                                }}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setCreateDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateStore}
                            disabled={!newStoreName.trim() || creating}
                        >
                            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
