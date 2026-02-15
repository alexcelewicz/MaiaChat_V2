"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, Settings2, Puzzle, Zap, Search, Calculator, Clock, AlertCircle, RefreshCw, FolderOpen, Bot, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Skill {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    version: string;
    icon: string | null;
    category: string;
    isBuiltin: boolean;
    permissions: string[];
    configSchema: Record<string, ConfigField> | null;
    toolDefinitions: Array<{ name: string; description: string }> | null;
    isEnabled: boolean;
    userConfig: Record<string, unknown> | null;
    usageCount: number;
    lastUsedAt: string | null;
}

interface ConfigField {
    type: "string" | "number" | "boolean" | "select" | "secret";
    label: string;
    description?: string;
    required?: boolean;
    default?: unknown;
    options?: Array<{ value: string; label: string }>;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    search: <Search className="h-4 w-4" />,
    utility: <Calculator className="h-4 w-4" />,
    productivity: <Clock className="h-4 w-4" />,
    other: <Puzzle className="h-4 w-4" />,
};

interface ClawdbotConfig {
    enabled: boolean;
    sourcePath: string;
    availableSkillCount?: number;
}

export default function SkillsPage() {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(true);
    const [configDialogOpen, setConfigDialogOpen] = useState(false);
    const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
    const [configValues, setConfigValues] = useState<Record<string, unknown>>({});
    const [saving, setSaving] = useState(false);
    const [canLoadCustomSkills, setCanLoadCustomSkills] = useState(false);
    const [reloading, setReloading] = useState(false);

    // Clawdbot integration state - enabled by default
    const [clawdbotConfig, setClawdbotConfig] = useState<ClawdbotConfig>({
        enabled: true,
        sourcePath: "./clawdbot-source",
    });
    const [savingClawdbot, setSavingClawdbot] = useState(false);

    useEffect(() => {
        fetchSkills();
    }, []);

    const fetchSkills = async () => {
        try {
            setLoading(true);
            const [skillsRes, configRes] = await Promise.all([
                fetch("/api/skills"),
                fetch("/api/admin/config"),
            ]);

            if (skillsRes.ok) {
                const data = await skillsRes.json();
                setSkills(data.skills || []);
                setCanLoadCustomSkills(data.canLoadCustomSkills || false);
            }

            if (configRes.ok) {
                const configData = await configRes.json();
                if (configData.skills) {
                    setClawdbotConfig({
                        enabled: configData.skills.clawdbotSkillsEnabled || false,
                        sourcePath: configData.skills.clawdbotSourcePath || "../clawdbot-source",
                        availableSkillCount: configData.skills.availableClawdbotSkillCount,
                    });
                }
            }
        } catch (error) {
            console.error("Fetch skills error:", error);
            toast.error("Failed to load skills");
        } finally {
            setLoading(false);
        }
    };

    const handleReloadSkills = async () => {
        try {
            setReloading(true);
            const response = await fetch("/api/skills/reload", { method: "POST" });
            if (!response.ok) throw new Error("Failed to reload skills");
            const data = await response.json();
            toast.success(`Reloaded: ${data.customPlugins} custom skill(s) found`);
            await fetchSkills();
        } catch (error) {
            console.error("Reload error:", error);
            toast.error("Failed to reload skills from disk");
        } finally {
            setReloading(false);
        }
    };

    const handleSyncFromGitHub = async () => {
        try {
            setSavingClawdbot(true);
            const response = await fetch("/api/admin/clawdbot-sync", {
                method: "POST",
                credentials: "include",
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "Failed to sync from GitHub");
            }

            const data = await response.json();

            if (data.success) {
                toast.success(`Synced ${data.skillsAdded + data.skillsUpdated} skills from GitHub`);
                setClawdbotConfig(prev => ({
                    ...prev,
                    availableSkillCount: data.skillsTotal,
                }));
                await fetchSkills();
            } else {
                throw new Error(data.message || "Sync failed");
            }
        } catch (error) {
            console.error("Sync error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to sync from GitHub");
        } finally {
            setSavingClawdbot(false);
        }
    };

    const handleSaveClawdbotConfig = async () => {
        try {
            setSavingClawdbot(true);
            const response = await fetch("/api/admin/config", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    skills: {
                        clawdbotSkillsEnabled: clawdbotConfig.enabled,
                        clawdbotSourcePath: clawdbotConfig.sourcePath,
                    },
                }),
            });

            if (!response.ok) throw new Error("Failed to save configuration");

            toast.success(clawdbotConfig.enabled
                ? "Clawdbot skills enabled - reload to apply"
                : "Clawdbot skills disabled");

            // Automatically reload skills if enabling
            if (clawdbotConfig.enabled) {
                await handleReloadSkills();
            }
        } catch (error) {
            console.error("Save clawdbot config error:", error);
            toast.error("Failed to save Clawdbot configuration");
        } finally {
            setSavingClawdbot(false);
        }
    };

    const handleToggleSkill = async (skill: Skill, enabled: boolean) => {
        try {
            const response = await fetch(`/api/skills/${skill.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isEnabled: enabled }),
            });

            if (!response.ok) throw new Error("Failed to update skill");

            setSkills((prev) =>
                prev.map((s) => (s.id === skill.id ? { ...s, isEnabled: enabled } : s))
            );

            toast.success(enabled ? `${skill.name} enabled` : `${skill.name} disabled`);
        } catch (error) {
            console.error("Toggle error:", error);
            toast.error("Failed to update skill");
        }
    };

    const openConfigDialog = (skill: Skill) => {
        setSelectedSkill(skill);
        setConfigValues(skill.userConfig || {});
        setConfigDialogOpen(true);
    };

    const handleSaveConfig = async () => {
        if (!selectedSkill) return;

        try {
            setSaving(true);
            const response = await fetch(`/api/skills/${selectedSkill.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ config: configValues }),
            });

            if (!response.ok) throw new Error("Failed to save configuration");

            setSkills((prev) =>
                prev.map((s) =>
                    s.id === selectedSkill.id ? { ...s, userConfig: configValues } : s
                )
            );

            setConfigDialogOpen(false);
            toast.success("Configuration saved");
        } catch (error) {
            console.error("Save config error:", error);
            toast.error("Failed to save configuration");
        } finally {
            setSaving(false);
        }
    };

    const renderConfigField = (key: string, field: ConfigField) => {
        const value = configValues[key] ?? field.default ?? "";

        switch (field.type) {
            case "boolean":
                return (
                    <div key={key} className="flex items-center justify-between">
                        <div>
                            <Label>{field.label}</Label>
                            {field.description && (
                                <p className="text-xs text-muted-foreground">{field.description}</p>
                            )}
                        </div>
                        <Switch
                            checked={Boolean(value)}
                            onCheckedChange={(checked) =>
                                setConfigValues({ ...configValues, [key]: checked })
                            }
                        />
                    </div>
                );

            case "select":
                return (
                    <div key={key} className="grid gap-2">
                        <Label>{field.label}</Label>
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                        <Select
                            value={String(value)}
                            onValueChange={(v) => setConfigValues({ ...configValues, [key]: v })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {field.options?.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                );

            case "secret":
                return (
                    <div key={key} className="grid gap-2">
                        <Label>{field.label}</Label>
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                        <Input
                            type="password"
                            placeholder="••••••••"
                            value={String(value)}
                            onChange={(e) =>
                                setConfigValues({ ...configValues, [key]: e.target.value })
                            }
                        />
                    </div>
                );

            case "number":
                return (
                    <div key={key} className="grid gap-2">
                        <Label>{field.label}</Label>
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                        <Input
                            type="number"
                            value={String(value)}
                            onChange={(e) =>
                                setConfigValues({ ...configValues, [key]: Number(e.target.value) })
                            }
                        />
                    </div>
                );

            default:
                return (
                    <div key={key} className="grid gap-2">
                        <Label>{field.label}</Label>
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                        <Input
                            value={String(value)}
                            onChange={(e) =>
                                setConfigValues({ ...configValues, [key]: e.target.value })
                            }
                        />
                    </div>
                );
        }
    };

    const enabledSkills = skills.filter((s) => s.isEnabled);
    const availableSkills = skills.filter((s) => !s.isEnabled);

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">AI Skills</h1>
                <p className="text-muted-foreground mt-1">
                    Enable skills to give your AI assistant additional capabilities
                </p>
            </div>

            {/* Clawdbot Community Skills - Sync from GitHub */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        Community Skills
                    </CardTitle>
                    <CardDescription>
                        Sync 50+ community skills directly from GitHub
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">
                                Skills are synced from the Clawdbot GitHub repository.
                                Click sync to fetch the latest skills.
                            </p>
                            {clawdbotConfig.availableSkillCount !== undefined && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    Currently synced: {clawdbotConfig.availableSkillCount} skills
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={handleSyncFromGitHub}
                            disabled={savingClawdbot}
                        >
                            {savingClawdbot ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Sync from GitHub
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                            <a
                                href="https://github.com/nickarino/clawdbot"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1"
                            >
                                <ExternalLink className="h-3 w-3" />
                                View on GitHub
                            </a>
                        </Button>
                    </div>

                    <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                        <p className="font-medium mb-1">Available community skills include:</p>
                        <p className="text-xs">
                            weather, github, summarize, openai-image-gen, openai-whisper,
                            nano-pdf, notion, obsidian, trello, and more.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Custom Skills - Always visible for self-hosted users */}
            <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FolderOpen className="h-5 w-5" />
                            Custom Skills
                        </CardTitle>
                        <CardDescription>
                            Load custom SKILL.md files from your local filesystem
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                <p>Skills are loaded from:</p>
                                <code className="text-xs bg-muted px-2 py-1 rounded mt-1 inline-block">
                                    ./skills/
                                </code>
                                <span className="text-xs block mt-0.5">
                                    (or set <code className="bg-muted px-1 rounded">MAIACHAT_SKILLS_DIR</code> env var)
                                </span>
                                <p className="text-xs mt-1">
                                    Each subdirectory with a <code className="bg-muted px-1 rounded">SKILL.md</code> file becomes a skill.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                onClick={handleReloadSkills}
                                disabled={reloading}
                            >
                                {reloading ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                )}
                                Reload from Disk
                            </Button>
                        </div>
                    </CardContent>
                </Card>

            {/* Enabled Skills */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        Enabled Skills
                    </CardTitle>
                    <CardDescription>
                        These skills are active and can be used by your AI assistant
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : enabledSkills.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No skills enabled yet.</p>
                            <p className="text-sm">Enable a skill below to get started.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {enabledSkills.map((skill) => (
                                <div
                                    key={skill.id}
                                    className="flex items-center justify-between p-4 rounded-lg border bg-muted/30"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">
                                            {skill.icon || CATEGORY_ICONS[skill.category] || "🔧"}
                                        </div>
                                        <div>
                                            <div className="font-medium flex items-center gap-2">
                                                {skill.name}
                                                <Badge variant="secondary" className="text-xs">
                                                    v{skill.version}
                                                </Badge>
                                                {skill.isBuiltin && (
                                                    <Badge variant="outline" className="text-xs">
                                                        Built-in
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {skill.description}
                                            </div>
                                            {skill.usageCount > 0 && (
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    Used {skill.usageCount} times
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {skill.configSchema && Object.keys(skill.configSchema).length > 0 && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openConfigDialog(skill)}
                                            >
                                                <Settings2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <Switch
                                            checked={skill.isEnabled}
                                            onCheckedChange={(checked) =>
                                                handleToggleSkill(skill, checked)
                                            }
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Available Skills */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Puzzle className="h-5 w-5" />
                        Available Skills
                    </CardTitle>
                    <CardDescription>
                        Enable additional skills to expand your AI&apos;s capabilities
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : availableSkills.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <p>All available skills are enabled!</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {availableSkills.map((skill) => (
                                <div
                                    key={skill.id}
                                    className="flex items-start justify-between p-4 rounded-lg border"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-lg">
                                            {skill.icon || CATEGORY_ICONS[skill.category] || "🔧"}
                                        </div>
                                        <div>
                                            <div className="font-medium">{skill.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {skill.description}
                                            </div>
                                            {skill.toolDefinitions && skill.toolDefinitions.length > 0 && (
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    {skill.toolDefinitions.length} tool
                                                    {skill.toolDefinitions.length !== 1 ? "s" : ""}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => handleToggleSkill(skill, true)}
                                    >
                                        Enable
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Configuration Dialog */}
            <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Configure {selectedSkill?.name}</DialogTitle>
                        <DialogDescription>
                            Customize how this skill works for you.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        {selectedSkill?.configSchema &&
                            Object.entries(selectedSkill.configSchema).map(([key, field]) =>
                                renderConfigField(key, field)
                            )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveConfig} disabled={saving}>
                            {saving ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Saving...
                                </>
                            ) : (
                                "Save Configuration"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">About Skills</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>• Skills give your AI assistant new capabilities and tools</p>
                    <p>• Some skills require API keys or configuration to work</p>
                    <p>• Built-in skills are maintained by MaiaChat and always available</p>
                    <p>• Skills are used automatically when the AI determines they&apos;re needed</p>
                    <p>• Usage statistics help you understand which skills are most useful</p>
                </CardContent>
            </Card>
        </div>
    );
}
