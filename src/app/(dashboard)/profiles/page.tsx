"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    User,
    Plus,
    Loader2,
    MoreVertical,
    Pencil,
    Trash2,
    Copy,
    Code,
    BookOpen,
    Search,
    Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { ProfileForm } from "@/components/profiles/ProfileForm";
import { cn } from "@/lib/utils";

interface Profile {
    id: string;
    name: string;
    agentConfigs: unknown[];
    ragConfig: {
        enabled?: boolean;
        documentIds?: string[];
        topK?: number;
    };
    orchestrationConfig: {
        mode?: string;
        enableDebug?: boolean;
    };
    createdAt: string;
    updatedAt: string;
}

// Profile templates
const PROFILE_TEMPLATES = [
    {
        name: "Research Assistant",
        icon: Search,
        description: "Optimized for in-depth research with RAG enabled",
        config: {
            ragConfig: { enabled: true, topK: 7 },
            orchestrationConfig: { mode: "single" },
        },
    },
    {
        name: "Code Helper",
        icon: Code,
        description: "Specialized for coding tasks with detailed explanations",
        config: {
            ragConfig: { enabled: false },
            orchestrationConfig: { mode: "single" },
        },
    },
    {
        name: "Writing Assistant",
        icon: BookOpen,
        description: "Focused on creative and professional writing",
        config: {
            ragConfig: { enabled: false },
            orchestrationConfig: { mode: "single" },
        },
    },
];

function formatDate(date: string): string {
    return new Date(date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default function ProfilesPage() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
    const [deletingProfile, setDeletingProfile] = useState<Profile | null>(null);

    useEffect(() => {
        fetchProfiles();
    }, []);

    const fetchProfiles = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/profiles");
            if (!response.ok) throw new Error("Failed to fetch profiles");
            const data = await response.json();
            setProfiles(data.profiles || []);
        } catch (error) {
            console.error("Fetch profiles error:", error);
            toast.error("Failed to load profiles");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateFromTemplate = async (template: typeof PROFILE_TEMPLATES[0]) => {
        try {
            const response = await fetch("/api/profiles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: template.name,
                    ...template.config,
                }),
            });

            if (!response.ok) throw new Error("Failed to create profile");

            toast.success(`Profile "${template.name}" created`);
            fetchProfiles();
        } catch (error) {
            console.error("Create profile error:", error);
            toast.error("Failed to create profile");
        }
    };

    const handleDelete = async () => {
        if (!deletingProfile) return;

        try {
            const response = await fetch(`/api/profiles/${deletingProfile.id}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error("Failed to delete profile");

            toast.success("Profile deleted");
            setDeletingProfile(null);
            fetchProfiles();
        } catch (error) {
            console.error("Delete profile error:", error);
            toast.error("Failed to delete profile");
        }
    };

    const handleDuplicate = async (profile: Profile) => {
        try {
            const response = await fetch("/api/profiles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: `${profile.name} (Copy)`,
                    agentConfigs: profile.agentConfigs,
                    ragConfig: profile.ragConfig,
                    orchestrationConfig: profile.orchestrationConfig,
                }),
            });

            if (!response.ok) throw new Error("Failed to duplicate profile");

            toast.success("Profile duplicated");
            fetchProfiles();
        } catch (error) {
            console.error("Duplicate profile error:", error);
            toast.error("Failed to duplicate profile");
        }
    };

    const handleFormSuccess = () => {
        setIsCreateOpen(false);
        setEditingProfile(null);
        fetchProfiles();
    };

    return (
        <div className="container max-w-6xl mx-auto py-8 px-4 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Profiles</h1>
                    <p className="text-muted-foreground mt-1">
                        Save and manage your chat configurations
                    </p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            New Profile
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px]">
                        <DialogHeader>
                            <DialogTitle>Create Profile</DialogTitle>
                            <DialogDescription>
                                Configure your profile settings
                            </DialogDescription>
                        </DialogHeader>
                        <ProfileForm onSuccess={handleFormSuccess} />
                    </DialogContent>
                </Dialog>
            </div>

            {/* Quick Templates */}
            <div>
                <h2 className="text-lg font-semibold mb-3">Quick Start Templates</h2>
                <div className="grid gap-4 md:grid-cols-3">
                    {PROFILE_TEMPLATES.map((template) => {
                        const Icon = template.icon;
                        return (
                            <Card
                                key={template.name}
                                className="cursor-pointer hover:border-primary/50 transition-colors"
                                onClick={() => handleCreateFromTemplate(template)}
                            >
                                <CardContent className="pt-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-primary/10">
                                            <Icon className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-medium">{template.name}</h3>
                                            <p className="text-xs text-muted-foreground">
                                                {template.description}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* User Profiles */}
            <div>
                <h2 className="text-lg font-semibold mb-3">Your Profiles</h2>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : profiles.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <User className="h-12 w-12 text-muted-foreground mb-4" />
                            <CardTitle className="text-xl mb-2">No Profiles Yet</CardTitle>
                            <CardDescription className="mb-4 max-w-md">
                                Create a profile to save your preferred settings for different use cases.
                            </CardDescription>
                            <Button onClick={() => setIsCreateOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" />
                                Create Your First Profile
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {profiles.map((profile) => (
                            <Card key={profile.id}>
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-muted">
                                                <Sparkles className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-base">
                                                    {profile.name}
                                                </CardTitle>
                                                <CardDescription className="text-xs">
                                                    Updated {formatDate(profile.updatedAt)}
                                                </CardDescription>
                                            </div>
                                        </div>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => setEditingProfile(profile)}>
                                                    <Pencil className="mr-2 h-4 w-4" />
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleDuplicate(profile)}>
                                                    <Copy className="mr-2 h-4 w-4" />
                                                    Duplicate
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => setDeletingProfile(profile)}
                                                    className="text-destructive"
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <div className="flex flex-wrap gap-2">
                                        {profile.ragConfig?.enabled && (
                                            <Badge variant="secondary" className="text-xs">
                                                RAG Enabled
                                            </Badge>
                                        )}
                                        <Badge variant="outline" className="text-xs">
                                            {profile.orchestrationConfig?.mode || "single"} mode
                                        </Badge>
                                        <Badge variant="outline" className="text-xs">
                                            {profile.agentConfigs?.length || 0} agent(s)
                                        </Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Edit Dialog */}
            <Dialog open={!!editingProfile} onOpenChange={() => setEditingProfile(null)}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Edit Profile</DialogTitle>
                        <DialogDescription>
                            Update your profile settings
                        </DialogDescription>
                    </DialogHeader>
                    {editingProfile && (
                        <ProfileForm
                            profile={editingProfile}
                            onSuccess={handleFormSuccess}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingProfile} onOpenChange={() => setDeletingProfile(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{deletingProfile?.name}&quot;?
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
