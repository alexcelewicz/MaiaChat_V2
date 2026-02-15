"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
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
} from "@/components/ui/alert-dialog";
import {
    Flag,
    Plus,
    Loader2,
    RefreshCw,
    Trash2,
    CheckCircle,
    XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface FeatureFlag {
    id: string;
    key: string;
    isEnabled: boolean;
    rules: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

export default function AdminFeaturesPage() {
    const [features, setFeatures] = useState<FeatureFlag[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [deletingKey, setDeletingKey] = useState<string | null>(null);
    const [newKey, setNewKey] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        fetchFeatures();
    }, []);

    const fetchFeatures = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/admin/features");
            if (!response.ok) throw new Error("Failed to fetch features");
            const data = await response.json();
            setFeatures(data.features || []);
        } catch (error) {
            console.error("Fetch features error:", error);
            toast.error("Failed to load feature flags");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newKey.trim()) {
            toast.error("Key is required");
            return;
        }

        try {
            setIsCreating(true);
            const response = await fetch("/api/admin/features", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    key: newKey.toLowerCase().replace(/\s+/g, "_"),
                    isEnabled: false,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to create");
            }

            toast.success("Feature flag created");
            setIsCreateOpen(false);
            setNewKey("");
            fetchFeatures();
        } catch (error) {
            console.error("Create feature error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to create");
        } finally {
            setIsCreating(false);
        }
    };

    const handleToggle = async (key: string, isEnabled: boolean) => {
        try {
            const response = await fetch("/api/admin/features", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key, isEnabled }),
            });

            if (!response.ok) throw new Error("Failed to update");

            setFeatures(features.map(f =>
                f.key === key ? { ...f, isEnabled } : f
            ));
            toast.success(`Feature ${isEnabled ? "enabled" : "disabled"}`);
        } catch (error) {
            console.error("Toggle feature error:", error);
            toast.error("Failed to update feature");
        }
    };

    const handleDelete = async () => {
        if (!deletingKey) return;

        try {
            const response = await fetch(`/api/admin/features?key=${deletingKey}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error("Failed to delete");

            toast.success("Feature flag deleted");
            setDeletingKey(null);
            fetchFeatures();
        } catch (error) {
            console.error("Delete feature error:", error);
            toast.error("Failed to delete feature");
        }
    };

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Feature Flags</h1>
                    <p className="text-muted-foreground mt-1">
                        Control feature availability across the application
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={fetchFeatures}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                New Flag
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create Feature Flag</DialogTitle>
                                <DialogDescription>
                                    Add a new feature flag to control functionality
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="key">Flag Key</Label>
                                    <Input
                                        id="key"
                                        placeholder="new_feature"
                                        value={newKey}
                                        onChange={(e) => setNewKey(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Use lowercase letters, numbers, and underscores
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleCreate} disabled={isCreating}>
                                    {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    Create
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Feature Flags */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : features.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <Flag className="h-12 w-12 text-muted-foreground mb-4" />
                        <CardTitle className="text-xl mb-2">No Feature Flags</CardTitle>
                        <CardDescription className="mb-4 max-w-md">
                            Create feature flags to control functionality across the application.
                        </CardDescription>
                        <Button onClick={() => setIsCreateOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Create Your First Flag
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {features.map((feature) => (
                        <Card key={feature.id}>
                            <CardContent className="flex items-center justify-between py-4">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 rounded-lg bg-muted">
                                        {feature.isEnabled ? (
                                            <CheckCircle className="h-5 w-5 text-green-500" />
                                        ) : (
                                            <XCircle className="h-5 w-5 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-mono font-medium">{feature.key}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge
                                                variant={feature.isEnabled ? "default" : "secondary"}
                                            >
                                                {feature.isEnabled ? "Enabled" : "Disabled"}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                Updated {new Date(feature.updatedAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <Switch
                                        checked={feature.isEnabled}
                                        onCheckedChange={(checked) => handleToggle(feature.key, checked)}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setDeletingKey(feature.key)}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingKey} onOpenChange={() => setDeletingKey(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Feature Flag</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{deletingKey}&quot;?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
