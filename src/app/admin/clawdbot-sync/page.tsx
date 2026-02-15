"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    RefreshCw,
    Download,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Search,
    Sparkles,
    GitBranch,
    Package,
    Zap,
    Terminal,
    Globe,
    Filter,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

interface SkillCompatibility {
    compatible: boolean;
    missingBins: string[];
    missingEnv: string[];
    unsupportedPlatform: boolean;
    platformRequired?: string[];
}

interface SkillInfo {
    slug: string;
    name: string;
    description?: string;
    icon?: string;
    category?: string;
    directory: string;
    isEnabled: boolean;
    compatibility: SkillCompatibility;
}

interface SyncStatus {
    clawdbotPath: string;
    exists: boolean;
    isGitRepo: boolean;
    currentBranch?: string;
    lastCommit?: {
        hash: string;
        message: string;
        date: string;
    };
    hasUpdates?: boolean;
    behindCount?: number;
    lastChecked: string;
}

interface SkillStats {
    total: number;
    compatible: number;
    incompatible: number;
    enabled: number;
    byCategory: Record<string, number>;
}

// ============================================================================
// Component
// ============================================================================

export default function ClawdbotSyncPage() {
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const [stats, setStats] = useState<SkillStats | null>(null);
    const [skills, setSkills] = useState<SkillInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPulling, setIsPulling] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterMode, setFilterMode] = useState<"all" | "compatible" | "enabled">("all");

    // Load data
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [statusRes, skillsRes] = await Promise.all([
                fetch("/api/admin/clawdbot-sync", { credentials: "include" }),
                fetch("/api/admin/clawdbot-sync/skills", { credentials: "include" }),
            ]);

            if (statusRes.ok) {
                const data = await statusRes.json();
                setSyncStatus(data.status);
                setStats(data.stats);
            }

            if (skillsRes.ok) {
                const data = await skillsRes.json();
                setSkills(data.skills || []);
            }
        } catch (error) {
            console.error("Failed to load data:", error);
            toast.error("Failed to load Clawdbot data");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Pull updates
    const handlePullUpdates = async () => {
        setIsPulling(true);
        try {
            const res = await fetch("/api/admin/clawdbot-sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "pull" }),
            });

            const data = await res.json();

            if (data.success) {
                toast.success(data.message);
                loadData();
            } else {
                toast.error(data.message || "Failed to pull updates");
            }
        } catch (error) {
            console.error("Failed to pull updates:", error);
            toast.error("Failed to pull updates");
        } finally {
            setIsPulling(false);
        }
    };

    // Toggle skill
    const handleToggleSkill = async (slug: string, currentState: boolean) => {
        try {
            const res = await fetch("/api/admin/clawdbot-sync/skills", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    action: currentState ? "disable" : "enable",
                    slug,
                }),
            });

            const data = await res.json();

            if (data.success) {
                setSkills((prev) =>
                    prev.map((s) =>
                        s.slug === slug ? { ...s, isEnabled: !currentState } : s
                    )
                );
                toast.success(`${currentState ? "Disabled" : "Enabled"} ${slug}`);
            } else {
                toast.error(data.error || "Failed to toggle skill");
            }
        } catch (error) {
            console.error("Failed to toggle skill:", error);
            toast.error("Failed to toggle skill");
        }
    };

    // Enable all compatible
    const handleEnableCompatible = async () => {
        try {
            const res = await fetch("/api/admin/clawdbot-sync/skills", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "enableCompatible" }),
            });

            const data = await res.json();

            if (data.success) {
                toast.success(`Enabled ${data.count} compatible skills`);
                loadData();
            } else {
                toast.error(data.error || "Failed to enable skills");
            }
        } catch (error) {
            console.error("Failed to enable compatible:", error);
            toast.error("Failed to enable compatible skills");
        }
    };

    // Disable all
    const handleDisableAll = async () => {
        try {
            const res = await fetch("/api/admin/clawdbot-sync/skills", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "disableAll" }),
            });

            const data = await res.json();

            if (data.success) {
                toast.success("Disabled all skills");
                loadData();
            } else {
                toast.error(data.error || "Failed to disable skills");
            }
        } catch (error) {
            console.error("Failed to disable all:", error);
            toast.error("Failed to disable all skills");
        }
    };

    // Filter skills
    const filteredSkills = skills.filter((skill) => {
        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchesSearch =
                skill.name.toLowerCase().includes(query) ||
                skill.slug.toLowerCase().includes(query) ||
                skill.description?.toLowerCase().includes(query);
            if (!matchesSearch) return false;
        }

        // Mode filter
        if (filterMode === "compatible" && !skill.compatibility.compatible) {
            return false;
        }
        if (filterMode === "enabled" && !skill.isEnabled) {
            return false;
        }

        return true;
    });

    // Group skills by category
    const skillsByCategory = filteredSkills.reduce((acc, skill) => {
        const category = skill.category || "other";
        if (!acc[category]) acc[category] = [];
        acc[category].push(skill);
        return acc;
    }, {} as Record<string, SkillInfo[]>);

    if (isLoading) {
        return (
            <div className="container mx-auto py-8">
                <div className="flex items-center justify-center h-64">
                    <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Clawdbot Skills</h1>
                    <p className="text-muted-foreground">
                        Manage and sync skills from the Clawdbot repository
                    </p>
                </div>
                <Button onClick={loadData} variant="outline" size="sm">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Status Card */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <GitBranch className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <CardTitle className="text-lg">Repository Status</CardTitle>
                                <CardDescription>
                                    {syncStatus?.clawdbotPath || "Not configured"}
                                </CardDescription>
                            </div>
                        </div>
                        {syncStatus?.isGitRepo && (
                            <Button
                                onClick={handlePullUpdates}
                                disabled={isPulling}
                                variant={syncStatus.hasUpdates ? "default" : "outline"}
                            >
                                {isPulling ? (
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4 mr-2" />
                                )}
                                {syncStatus.hasUpdates
                                    ? `Pull ${syncStatus.behindCount} Updates`
                                    : "Check for Updates"}
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-muted/50 rounded-lg">
                            <div className="text-2xl font-bold">{stats?.total || 0}</div>
                            <div className="text-sm text-muted-foreground">Total Skills</div>
                        </div>
                        <div className="text-center p-4 bg-green-500/10 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">
                                {stats?.compatible || 0}
                            </div>
                            <div className="text-sm text-muted-foreground">Compatible</div>
                        </div>
                        <div className="text-center p-4 bg-amber-500/10 rounded-lg">
                            <div className="text-2xl font-bold text-amber-600">
                                {stats?.incompatible || 0}
                            </div>
                            <div className="text-sm text-muted-foreground">Incompatible</div>
                        </div>
                        <div className="text-center p-4 bg-blue-500/10 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">
                                {stats?.enabled || 0}
                            </div>
                            <div className="text-sm text-muted-foreground">Enabled</div>
                        </div>
                    </div>

                    {syncStatus?.lastCommit && (
                        <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
                            <span className="font-mono">{syncStatus.lastCommit.hash.slice(0, 8)}</span>
                            {" - "}
                            {syncStatus.lastCommit.message}
                            <span className="ml-2 opacity-60">
                                ({new Date(syncStatus.lastCommit.date).toLocaleDateString()})
                            </span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Skills Management */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Package className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <CardTitle className="text-lg">Skills Library</CardTitle>
                                <CardDescription>
                                    Enable skills to make them available to AI agents
                                </CardDescription>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={handleEnableCompatible}
                                variant="outline"
                                size="sm"
                            >
                                <Zap className="w-4 h-4 mr-2" />
                                Enable Compatible
                            </Button>
                            <Button
                                onClick={handleDisableAll}
                                variant="ghost"
                                size="sm"
                            >
                                Disable All
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Search and Filter */}
                    <div className="flex gap-4 mb-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search skills..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Tabs value={filterMode} onValueChange={(v) => setFilterMode(v as typeof filterMode)}>
                            <TabsList>
                                <TabsTrigger value="all">
                                    All ({skills.length})
                                </TabsTrigger>
                                <TabsTrigger value="compatible">
                                    Compatible ({skills.filter((s) => s.compatibility.compatible).length})
                                </TabsTrigger>
                                <TabsTrigger value="enabled">
                                    Enabled ({skills.filter((s) => s.isEnabled).length})
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {/* Skills List */}
                    <ScrollArea className="h-[500px] pr-4">
                        <div className="space-y-6">
                            {Object.entries(skillsByCategory).map(([category, categorySkills]) => (
                                <div key={category}>
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                        {category} ({categorySkills.length})
                                    </h3>
                                    <div className="grid gap-2">
                                        {categorySkills.map((skill) => (
                                            <div
                                                key={skill.slug}
                                                className={`flex items-center justify-between p-3 rounded-lg border ${
                                                    skill.compatibility.compatible
                                                        ? "bg-card hover:bg-accent/50"
                                                        : "bg-muted/30 opacity-60"
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="text-xl">{skill.icon || "📦"}</div>
                                                    <div>
                                                        <div className="font-medium flex items-center gap-2">
                                                            {skill.name}
                                                            {!skill.compatibility.compatible && (
                                                                <Badge variant="outline" className="text-amber-600">
                                                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                                                    Incompatible
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {skill.description || skill.slug}
                                                        </div>
                                                        {!skill.compatibility.compatible && (
                                                            <div className="text-xs text-amber-600 mt-1">
                                                                {skill.compatibility.missingBins.length > 0 && (
                                                                    <span className="flex items-center gap-1">
                                                                        <Terminal className="w-3 h-3" />
                                                                        Missing: {skill.compatibility.missingBins.join(", ")}
                                                                    </span>
                                                                )}
                                                                {skill.compatibility.unsupportedPlatform && (
                                                                    <span className="flex items-center gap-1">
                                                                        <Globe className="w-3 h-3" />
                                                                        Requires: {skill.compatibility.platformRequired?.join(", ")}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <Switch
                                                    checked={skill.isEnabled}
                                                    onCheckedChange={() =>
                                                        handleToggleSkill(skill.slug, skill.isEnabled)
                                                    }
                                                    disabled={!skill.compatibility.compatible}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {filteredSkills.length === 0 && (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
                                    <p>No skills found matching your criteria</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}
