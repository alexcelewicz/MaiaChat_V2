"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Trash2, ShieldCheck, ShieldX, RefreshCw, FolderOpen, Terminal, Server, Zap, Rocket, MessageSquare, Bot, Brain, Sparkles, Download, Upload, FileJson, CheckCircle2, AlertTriangle, Code, XCircle, Plus, Plug, X } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";

type AdminSettings = {
    autoStartChannels: boolean;
    ipFilteringEnabled: boolean;
    visitorRetentionDays: number;
    localFileAccessEnabled: boolean;
    commandExecutionEnabled: boolean;
    fileAccessBaseDir: string | null;
    // Background Agent settings
    backgroundAgentEnabled: boolean;
    backgroundAgentAutoStart: boolean;
    defaultAgentModel: string | null;
    proactiveMessagingEnabled: boolean;
    eventTriggersEnabled: boolean;
    bootScriptsEnabled: boolean;
    defaultProactiveMaxPerHour: number;
    defaultProactiveMaxPerDay: number;
    defaultTriggerMaxPerHour: number;
    // Memory & Retrieval settings
    geminiRetrievalModel: string | null;
    userProfileMemoryEnabled: boolean;
    memoryMaxChars: number;
    // Channel settings
    defaultMaxTokens: number;
    // Workspace quota (hosted mode)
    workspaceQuotaMb: number;
};

type Model = {
    id: string;
    name: string;
    provider: string;
};

type IpBlock = {
    id: string;
    ipAddress: string;
    label: string | null;
    isActive: boolean;
    createdAt: string;
};

type ConfigStatus = {
    loaded: boolean;
    version?: string;
    source?: string;
    lastModified?: string;
    hasFileOverride?: boolean;
};

type IntegrationsSettings = {
    google: { enabled: boolean; scopes: string[] };
    hubspot: { enabled: boolean };
    asana: { enabled: boolean };
    twitter: {
        enabled: boolean;
        tier1Enabled: boolean;
        tier2Enabled: boolean;
        tier3Enabled: boolean;
        tier4Enabled: boolean;
        fxTwitterEnabled: boolean;
        twitterApiIoKey: string | null;
        xApiBearerToken: string | null;
        xAiApiKey: string | null;
    };
    httpRequest: { enabled: boolean; allowedDomains: string[] };
};

type EnvStatus = {
    google: { clientIdSet: boolean; clientSecretSet: boolean };
    hubspot: { clientIdSet: boolean; clientSecretSet: boolean };
    asana: { clientIdSet: boolean; clientSecretSet: boolean };
};

const GOOGLE_SCOPES = [
    { id: "gmail.readonly", label: "Gmail Read" },
    { id: "gmail.send", label: "Gmail Send" },
    { id: "gmail.modify", label: "Gmail Modify" },
    { id: "calendar.readonly", label: "Calendar Read" },
    { id: "calendar.events", label: "Calendar Events" },
    { id: "drive.file", label: "Drive Files" },
] as const;

const DEFAULT_INTEGRATIONS: IntegrationsSettings = {
    google: { enabled: false, scopes: [] },
    hubspot: { enabled: false },
    asana: { enabled: false },
    twitter: {
        enabled: false,
        tier1Enabled: false,
        tier2Enabled: false,
        tier3Enabled: false,
        tier4Enabled: false,
        fxTwitterEnabled: false,
        twitterApiIoKey: null,
        xApiBearerToken: null,
        xAiApiKey: null,
    },
    httpRequest: { enabled: false, allowedDomains: [] },
};

export default function AdminSettingsPage() {
    const [settings, setSettings] = useState<AdminSettings | null>(null);
    const [ipBlocks, setIpBlocks] = useState<IpBlock[]>([]);
    const [models, setModels] = useState<Model[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [newIp, setNewIp] = useState("");
    const [newLabel, setNewLabel] = useState("");

    // Config import/export state
    const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // CLI Tools state
    const [cliStatus, setCliStatus] = useState<{
        claudeAvailable: boolean;
        geminiAvailable: boolean;
        defaultCli: string | null;
        workspaceRoot: string;
    } | null>(null);
    const [cliSettings, setCliSettings] = useState({
        enabled: false,
        defaultCli: "claude" as "claude" | "gemini",
        skipPermissions: true,
        workspaceRoot: "./workspace",
    });
    const [savingCli, setSavingCli] = useState(false);

    // Integrations state
    const [integrationsSettings, setIntegrationsSettings] = useState<IntegrationsSettings>(DEFAULT_INTEGRATIONS);
    const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
    const [savingIntegrations, setSavingIntegrations] = useState(false);
    const [newDomain, setNewDomain] = useState("");

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [settingsRes, blocksRes, modelsRes, configRes, cliRes, intEnvRes] = await Promise.all([
                fetch("/api/admin/settings", { credentials: "include" }),
                fetch("/api/admin/ip-blocks", { credentials: "include" }),
                fetch("/api/models", { credentials: "include" }),
                fetch("/api/admin/config?include_sources=true", { credentials: "include" }),
                fetch("/api/admin/cli/status", { credentials: "include" }),
                fetch("/api/admin/integrations/status", { credentials: "include" }),
            ]);

            if (settingsRes.ok) {
                const data = await settingsRes.json();
                setSettings(data.settings);
            }

            if (blocksRes.ok) {
                const data = await blocksRes.json();
                setIpBlocks(data.blocks || []);
            }

            if (modelsRes.ok) {
                const data = await modelsRes.json();
                if (Array.isArray(data.models)) {
                    setModels(data.models.map((m: { id: string; name: string; provider?: string }) => ({
                        id: m.id,
                        name: m.name,
                        provider: m.provider || "unknown",
                    })));
                }
            }

            if (configRes.ok) {
                const data = await configRes.json();
                const configData = data.config ?? data;
                const sources: Record<string, string> = data.sources || {};
                const sourceValues = Object.values(sources);
                const hasFileOverride = sourceValues.includes("file");
                const sourceLabel = hasFileOverride
                    ? "file"
                    : sourceValues[0] || data.source || "defaults";

                setConfigStatus({
                    loaded: true,
                    version: configData.version,
                    source: sourceLabel,
                    lastModified: data.lastModified,
                    hasFileOverride,
                });
                // Also load CLI settings from config
                if (configData.cli) {
                    setCliSettings({
                        enabled: configData.cli.enabled ?? false,
                        defaultCli: configData.cli.defaultCli ?? "claude",
                        skipPermissions: configData.cli.skipPermissions ?? true,
                        workspaceRoot: configData.cli.workspaceRoot ?? "./workspace",
                    });
                }
                // Load integrations settings from config
                if (configData.integrations) {
                    setIntegrationsSettings({
                        ...DEFAULT_INTEGRATIONS,
                        ...configData.integrations,
                        google: { ...DEFAULT_INTEGRATIONS.google, ...configData.integrations.google },
                        twitter: { ...DEFAULT_INTEGRATIONS.twitter, ...configData.integrations.twitter },
                        httpRequest: { ...DEFAULT_INTEGRATIONS.httpRequest, ...configData.integrations.httpRequest },
                    });
                }
            }

            if (cliRes.ok) {
                const data = await cliRes.json();
                setCliStatus({
                    claudeAvailable: data.claudeAvailable,
                    geminiAvailable: data.geminiAvailable,
                    defaultCli: data.defaultCli,
                    workspaceRoot: data.workspaceRoot,
                });
            }

            if (intEnvRes.ok) {
                const data = await intEnvRes.json();
                setEnvStatus(data);
            }
        } catch {
            toast.error("Failed to load admin settings");
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportConfig = async () => {
        setIsExporting(true);
        try {
            const response = await fetch("/api/admin/config", {
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error("Failed to export configuration");
            }

            const data = await response.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `maiachat-config-${new Date().toISOString().split("T")[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("Configuration exported successfully");
        } catch {
            toast.error("Failed to export configuration");
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setImportError(null);

        try {
            const text = await file.text();
            let config;
            try {
                config = JSON.parse(text);
            } catch {
                throw new Error("Invalid JSON file");
            }

            // First validate
            const validateRes = await fetch("/api/admin/config/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(config),
            });

            const validateData = await validateRes.json();
            if (!validateRes.ok || !validateData.valid) {
                throw new Error(validateData.error || "Invalid configuration format");
            }

            // Then import
            const importRes = await fetch("/api/admin/config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(config),
            });

            if (!importRes.ok) {
                const errorData = await importRes.json();
                throw new Error(errorData.error || "Failed to import configuration");
            }

            const importData = await importRes.json();
            setConfigStatus({
                loaded: true,
                version: importData.version,
                source: "imported",
                lastModified: new Date().toISOString(),
            });

            toast.success("Configuration imported successfully");
            await loadData(); // Reload all data
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to import configuration";
            setImportError(message);
            toast.error(message);
        } finally {
            setIsImporting(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleSaveCli = async () => {
        setSavingCli(true);
        try {
            const response = await fetch("/api/admin/config", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ cli: cliSettings }),
            });

            if (!response.ok) {
                throw new Error("Failed to save CLI settings");
            }

            toast.success("CLI settings saved");
        } catch {
            toast.error("Failed to save CLI settings");
        } finally {
            setSavingCli(false);
        }
    };

    const handleSaveIntegrations = async () => {
        setSavingIntegrations(true);
        try {
            const response = await fetch("/api/admin/config", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ integrations: integrationsSettings }),
            });

            if (!response.ok) {
                throw new Error("Failed to save integration settings");
            }

            toast.success("Integration settings saved");
        } catch {
            toast.error("Failed to save integration settings");
        } finally {
            setSavingIntegrations(false);
        }
    };

    const handleAddDomain = () => {
        const domain = newDomain.trim();
        if (!domain) return;
        if (integrationsSettings.httpRequest.allowedDomains.includes(domain)) {
            toast.error("Domain already added");
            return;
        }
        setIntegrationsSettings((prev) => ({
            ...prev,
            httpRequest: {
                ...prev.httpRequest,
                allowedDomains: [...prev.httpRequest.allowedDomains, domain],
            },
        }));
        setNewDomain("");
    };

    const handleRemoveDomain = (domain: string) => {
        setIntegrationsSettings((prev) => ({
            ...prev,
            httpRequest: {
                ...prev.httpRequest,
                allowedDomains: prev.httpRequest.allowedDomains.filter((d) => d !== domain),
            },
        }));
    };

    useEffect(() => {
        void loadData();
    }, []);

    const handleSave = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            const response = await fetch("/api/admin/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });

            if (!response.ok) {
                throw new Error("Failed to update settings");
            }

            const data = await response.json();
            setSettings(data.settings);
            toast.success("Settings updated");
        } catch {
            toast.error("Failed to update settings");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddIp = async () => {
        const ipAddress = newIp.trim();
        if (!ipAddress) return;

        try {
            const response = await fetch("/api/admin/ip-blocks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ipAddress,
                    label: newLabel.trim() || null,
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to add IP block");
            }

            const data = await response.json();
            setIpBlocks((prev) => [data.block, ...prev]);
            setNewIp("");
            setNewLabel("");
            toast.success("IP blocked");
        } catch {
            toast.error("Failed to add IP block");
        }
    };

    const handleToggleIp = async (block: IpBlock) => {
        try {
            const response = await fetch(`/api/admin/ip-blocks/${block.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !block.isActive }),
            });

            if (!response.ok) {
                throw new Error("Failed to update IP block");
            }

            const data = await response.json();
            setIpBlocks((prev) => prev.map((item) => item.id === block.id ? data.block : item));
        } catch {
            toast.error("Failed to update IP block");
        }
    };

    const handleDeleteIp = async (block: IpBlock) => {
        try {
            const response = await fetch(`/api/admin/ip-blocks/${block.id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                throw new Error("Failed to remove IP block");
            }

            setIpBlocks((prev) => prev.filter((item) => item.id !== block.id));
            toast.success("IP block removed");
        } catch {
            toast.error("Failed to remove IP block");
        }
    };

    if (isLoading || !settings) {
        return (
            <div className="p-8">
                <p className="text-muted-foreground">Loading admin settings...</p>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Admin Settings</h1>
                    <p className="text-muted-foreground mt-1">
                        Operational controls and security settings
                    </p>
                </div>
                <Button variant="outline" onClick={loadData}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Runtime Controls</CardTitle>
                    <CardDescription>Configure startup behavior for background services</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-base">Auto-start channels on boot</Label>
                            <p className="text-sm text-muted-foreground">
                                Run startAllChannels() when the server starts
                            </p>
                        </div>
                        <Switch
                            checked={settings.autoStartChannels}
                            onCheckedChange={(value) =>
                                setSettings((prev) => prev ? { ...prev, autoStartChannels: value } : prev)
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-base">IP filtering</Label>
                            <p className="text-sm text-muted-foreground">
                                Block requests from listed IP addresses
                            </p>
                        </div>
                        <Switch
                            checked={settings.ipFilteringEnabled}
                            onCheckedChange={(value) =>
                                setSettings((prev) => prev ? { ...prev, ipFilteringEnabled: value } : prev)
                            }
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-base">Default Max Output Tokens</Label>
                        <Input
                            type="number"
                            min={256}
                            max={128000}
                            value={settings.defaultMaxTokens ?? 4096}
                            onChange={(e) =>
                                setSettings((prev) => prev ? { ...prev, defaultMaxTokens: parseInt(e.target.value) || 4096 } : prev)
                            }
                        />
                        <p className="text-sm text-muted-foreground">
                            Default max output tokens for channel responses when not set per-channel. Prevents credit exhaustion. Range: 256-128000. Override per-channel with /maxtokens command.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-base">Visitor retention (days)</Label>
                        <Input
                            type="number"
                            min={30}
                            value={settings.visitorRetentionDays}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                setSettings((prev) => prev ? { ...prev, visitorRetentionDays: value } : prev);
                            }}
                        />
                        <p className="text-sm text-muted-foreground">
                            Minimum 30 days. Longer retention increases storage usage.
                        </p>
                    </div>

                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save settings"}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FolderOpen className="h-5 w-5" />
                        Agent Capabilities
                    </CardTitle>
                    <CardDescription>
                        Control global local-access capabilities. Access is still restricted to admins allowlisted in Users.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-base">Local file access</Label>
                            <p className="text-sm text-muted-foreground">
                                Allow the agent to list and read files on the server
                            </p>
                        </div>
                        <Switch
                            checked={settings.localFileAccessEnabled}
                            onCheckedChange={(value) =>
                                setSettings((prev) => prev ? { ...prev, localFileAccessEnabled: value } : prev)
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-base flex items-center gap-2">
                                <Terminal className="h-4 w-4" />
                                Command execution
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Allow the agent to execute shell commands on the server
                            </p>
                        </div>
                        <Switch
                            checked={settings.commandExecutionEnabled}
                            onCheckedChange={(value) =>
                                setSettings((prev) => prev ? { ...prev, commandExecutionEnabled: value } : prev)
                            }
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-base">File access base directory</Label>
                        <Input
                            placeholder="e.g. /home/user/projects (empty = no restriction)"
                            value={settings.fileAccessBaseDir || ""}
                            onChange={(event) => {
                                const value = event.target.value.trim();
                                setSettings((prev) => prev ? { ...prev, fileAccessBaseDir: value || null } : prev);
                            }}
                        />
                        <p className="text-sm text-muted-foreground">
                            Restrict file access to this directory. Leave empty to allow access anywhere (when file access is enabled).
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-base">Workspace Quota (MB)</Label>
                        <Input
                            type="number"
                            min={10}
                            max={10000}
                            value={settings.workspaceQuotaMb ?? 100}
                            onChange={(e) =>
                                setSettings((prev) => prev ? { ...prev, workspaceQuotaMb: parseInt(e.target.value) || 100 } : prev)
                            }
                        />
                        <p className="text-sm text-muted-foreground">
                            Per-user disk quota for hosted mode workspaces. Each user gets their own isolated directory with this storage limit. Default: 100 MB. Range: 10-10000 MB.
                        </p>
                    </div>

                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save settings"}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Server className="h-5 w-5" />
                        Background Agent
                    </CardTitle>
                    <CardDescription>
                        Enable always-on AI capabilities: scheduled tasks, event triggers, proactive messaging
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-base">Enable Background Agent</Label>
                            <p className="text-sm text-muted-foreground">
                                Master switch for all background agent features
                            </p>
                        </div>
                        <Switch
                            checked={settings.backgroundAgentEnabled}
                            onCheckedChange={(value) =>
                                setSettings((prev) => prev ? { ...prev, backgroundAgentEnabled: value } : prev)
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-base">Auto-start on boot</Label>
                            <p className="text-sm text-muted-foreground">
                                Automatically start the background agent daemon when server starts
                            </p>
                        </div>
                        <Switch
                            checked={settings.backgroundAgentAutoStart}
                            onCheckedChange={(value) =>
                                setSettings((prev) => prev ? { ...prev, backgroundAgentAutoStart: value } : prev)
                            }
                            disabled={!settings.backgroundAgentEnabled}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-base flex items-center gap-2">
                            <Bot className="h-4 w-4" />
                            Default Agent Model
                        </Label>
                        <Select
                            value={settings.defaultAgentModel || "__auto__"}
                            onValueChange={(value) =>
                                setSettings((prev) => prev ? { ...prev, defaultAgentModel: value === "__auto__" ? null : value } : prev)
                            }
                            disabled={!settings.backgroundAgentEnabled}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Auto-select based on API keys" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__auto__">Auto-select (based on API keys)</SelectItem>
                                {models.map((model) => (
                                    <SelectItem key={model.id} value={model.id}>
                                        {model.name} ({model.provider})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                            Default model for scheduled tasks and background agent operations. Can be overridden per-task.
                        </p>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-base flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" />
                                Proactive Messaging
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Allow AI to send messages without user prompting
                            </p>
                        </div>
                        <Switch
                            checked={settings.proactiveMessagingEnabled}
                            onCheckedChange={(value) =>
                                setSettings((prev) => prev ? { ...prev, proactiveMessagingEnabled: value } : prev)
                            }
                            disabled={!settings.backgroundAgentEnabled}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-base flex items-center gap-2">
                                <Zap className="h-4 w-4" />
                                Event Triggers
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                React to webhooks and external events
                            </p>
                        </div>
                        <Switch
                            checked={settings.eventTriggersEnabled}
                            onCheckedChange={(value) =>
                                setSettings((prev) => prev ? { ...prev, eventTriggersEnabled: value } : prev)
                            }
                            disabled={!settings.backgroundAgentEnabled}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-base flex items-center gap-2">
                                <Rocket className="h-4 w-4" />
                                Boot Scripts
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Run startup scripts when daemon starts
                            </p>
                        </div>
                        <Switch
                            checked={settings.bootScriptsEnabled}
                            onCheckedChange={(value) =>
                                setSettings((prev) => prev ? { ...prev, bootScriptsEnabled: value } : prev)
                            }
                            disabled={!settings.backgroundAgentEnabled}
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label>Proactive messages/hour</Label>
                            <Input
                                type="number"
                                min={1}
                                value={settings.defaultProactiveMaxPerHour}
                                onChange={(e) =>
                                    setSettings((prev) => prev ? { ...prev, defaultProactiveMaxPerHour: parseInt(e.target.value) || 10 } : prev)
                                }
                                disabled={!settings.backgroundAgentEnabled}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Proactive messages/day</Label>
                            <Input
                                type="number"
                                min={1}
                                value={settings.defaultProactiveMaxPerDay}
                                onChange={(e) =>
                                    setSettings((prev) => prev ? { ...prev, defaultProactiveMaxPerDay: parseInt(e.target.value) || 100 } : prev)
                                }
                                disabled={!settings.backgroundAgentEnabled}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Triggers/hour limit</Label>
                            <Input
                                type="number"
                                min={1}
                                value={settings.defaultTriggerMaxPerHour}
                                onChange={(e) =>
                                    setSettings((prev) => prev ? { ...prev, defaultTriggerMaxPerHour: parseInt(e.target.value) || 60 } : prev)
                                }
                                disabled={!settings.backgroundAgentEnabled}
                            />
                        </div>
                    </div>

                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save settings"}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5" />
                        Memory & Retrieval
                    </CardTitle>
                    <CardDescription>
                        Configure AI memory systems and document retrieval settings
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label className="text-base flex items-center gap-2">
                            <Sparkles className="h-4 w-4" />
                            Gemini Retrieval Model
                        </Label>
                        <Select
                            value={settings.geminiRetrievalModel || "gemini-3-flash-preview"}
                            onValueChange={(value) =>
                                setSettings((prev) => prev ? { ...prev, geminiRetrievalModel: value } : prev)
                            }
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select Gemini model for retrieval" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="gemini-3-flash-preview">Gemini 3 Flash (Recommended - Fast & Affordable)</SelectItem>
                                <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash (Legacy)</SelectItem>
                                <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash (Legacy)</SelectItem>
                                <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro (More capable, slower)</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                            Model used for Gemini File Search retrieval (RAG, memory search). Gemini 3 Flash offers best speed/cost ratio.
                        </p>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-base">User Profile Memory (Global)</Label>
                            <p className="text-sm text-muted-foreground">
                                Master switch for profile learning. When enabled, agents can remember personal information about users.
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Users can view and delete their data in Settings → My Data (GDPR compliant)
                            </p>
                        </div>
                        <Switch
                            checked={settings.userProfileMemoryEnabled ?? true}
                            onCheckedChange={(value) =>
                                setSettings((prev) => prev ? { ...prev, userProfileMemoryEnabled: value } : prev)
                            }
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-base">Memory Context Limit (chars)</Label>
                        <Input
                            type="number"
                            min={500}
                            max={32000}
                            value={settings.memoryMaxChars ?? 4000}
                            onChange={(e) =>
                                setSettings((prev) => prev ? { ...prev, memoryMaxChars: parseInt(e.target.value) || 4000 } : prev)
                            }
                        />
                        <p className="text-sm text-muted-foreground">
                            Maximum characters of memory context injected into channel prompts. Lower values save tokens. Range: 500-32000.
                        </p>
                    </div>

                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save settings"}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Code className="h-5 w-5" />
                        CLI Tools (Claude Code / Gemini)
                    </CardTitle>
                    <CardDescription>
                        Enable AI coding assistants for code generation tasks
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* CLI Availability Status */}
                    {cliStatus && (
                        <div className="rounded-lg border p-4 bg-muted/30">
                            <div className="text-sm font-medium mb-2">CLI Availability</div>
                            <div className="grid gap-2 text-sm">
                                <div className="flex items-center gap-2">
                                    {cliStatus.claudeAvailable ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <XCircle className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <span>Claude Code: {cliStatus.claudeAvailable ? "Installed" : "Not found"}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {cliStatus.geminiAvailable ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <XCircle className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <span>Gemini CLI: {cliStatus.geminiAvailable ? "Installed" : "Not found"}</span>
                                </div>
                            </div>
                            {!cliStatus.claudeAvailable && !cliStatus.geminiAvailable && (
                                <p className="text-xs text-muted-foreground mt-2">
                                    Install Claude Code or Gemini CLI to enable coding features.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-base">Enable CLI Tools</Label>
                            <p className="text-sm text-muted-foreground">
                                Allow AI to use coding CLIs for code generation
                            </p>
                            {!cliStatus?.claudeAvailable && !cliStatus?.geminiAvailable && (
                                <p className="text-xs text-amber-500 mt-1">
                                    Install a CLI tool to enable this feature
                                </p>
                            )}
                        </div>
                        <Switch
                            checked={cliSettings.enabled && (cliStatus?.claudeAvailable || cliStatus?.geminiAvailable || false)}
                            onCheckedChange={(value) =>
                                setCliSettings((prev) => ({ ...prev, enabled: value }))
                            }
                            disabled={!cliStatus?.claudeAvailable && !cliStatus?.geminiAvailable}
                        />
                    </div>

                    {cliSettings.enabled && (
                        <>
                            <div className="space-y-2">
                                <Label className="text-base">Default CLI</Label>
                                <Select
                                    value={cliSettings.defaultCli}
                                    onValueChange={(value: "claude" | "gemini") =>
                                        setCliSettings((prev) => ({ ...prev, defaultCli: value }))
                                    }
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="claude" disabled={!cliStatus?.claudeAvailable}>
                                            Claude Code {!cliStatus?.claudeAvailable && "(not installed)"}
                                        </SelectItem>
                                        <SelectItem value="gemini" disabled={!cliStatus?.geminiAvailable}>
                                            Gemini CLI {!cliStatus?.geminiAvailable && "(not installed)"}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="text-base">Skip Permission Prompts</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Use --dangerously-skip-permissions for unattended execution
                                    </p>
                                </div>
                                <Switch
                                    checked={cliSettings.skipPermissions}
                                    onCheckedChange={(value) =>
                                        setCliSettings((prev) => ({ ...prev, skipPermissions: value }))
                                    }
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-base">Workspace Directory</Label>
                                <Input
                                    placeholder="./workspace"
                                    value={cliSettings.workspaceRoot}
                                    onChange={(e) =>
                                        setCliSettings((prev) => ({ ...prev, workspaceRoot: e.target.value }))
                                    }
                                />
                                <p className="text-xs text-muted-foreground">
                                    Directory where CLI-generated files will be saved. Relative to project root.
                                </p>
                            </div>
                        </>
                    )}

                    <Button onClick={handleSaveCli} disabled={savingCli}>
                        {savingCli ? "Saving..." : "Save CLI settings"}
                    </Button>
                </CardContent>
            </Card>

            {/* Integrations Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Plug className="h-5 w-5" />
                        Integrations
                    </CardTitle>
                    <CardDescription>
                        Configure third-party service integrations and API access
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* A. Google */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-base">Google (Gmail, Calendar, Drive)</Label>
                                <p className="text-sm text-muted-foreground">
                                    OAuth integration for Google Workspace services
                                </p>
                            </div>
                            <Switch
                                checked={integrationsSettings.google.enabled}
                                onCheckedChange={(value) =>
                                    setIntegrationsSettings((prev) => ({
                                        ...prev,
                                        google: { ...prev.google, enabled: value },
                                    }))
                                }
                            />
                        </div>
                        {envStatus && (
                            <div className="rounded-lg border p-3 bg-muted/30 space-y-1.5">
                                <div className="text-xs font-medium text-muted-foreground mb-1">OAuth Credentials</div>
                                <div className="flex items-center gap-2 text-sm">
                                    {envStatus.google.clientIdSet ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    <span>Client ID</span>
                                    {!envStatus.google.clientIdSet && (
                                        <span className="text-xs text-muted-foreground ml-auto font-mono">GOOGLE_OAUTH_CLIENT_ID</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    {envStatus.google.clientSecretSet ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    <span>Client Secret</span>
                                    {!envStatus.google.clientSecretSet && (
                                        <span className="text-xs text-muted-foreground ml-auto font-mono">GOOGLE_OAUTH_CLIENT_SECRET</span>
                                    )}
                                </div>
                            </div>
                        )}
                        {integrationsSettings.google.enabled && (
                            <div className="space-y-2 pl-1">
                                <Label className="text-sm text-muted-foreground">Scopes</Label>
                                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                                    {GOOGLE_SCOPES.map((scope) => (
                                        <div key={scope.id} className="flex items-center gap-2">
                                            <Checkbox
                                                id={`scope-${scope.id}`}
                                                checked={integrationsSettings.google.scopes.includes(scope.id)}
                                                onCheckedChange={(checked) => {
                                                    setIntegrationsSettings((prev) => ({
                                                        ...prev,
                                                        google: {
                                                            ...prev.google,
                                                            scopes: checked
                                                                ? [...prev.google.scopes, scope.id]
                                                                : prev.google.scopes.filter((s) => s !== scope.id),
                                                        },
                                                    }));
                                                }}
                                            />
                                            <Label htmlFor={`scope-${scope.id}`} className="text-sm font-normal cursor-pointer">
                                                {scope.label}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <Separator />

                    {/* B. HubSpot CRM */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-base">HubSpot CRM</Label>
                                <p className="text-sm text-muted-foreground">
                                    CRM integration for contacts and deals
                                </p>
                            </div>
                            <Switch
                                checked={integrationsSettings.hubspot.enabled}
                                onCheckedChange={(value) =>
                                    setIntegrationsSettings((prev) => ({
                                        ...prev,
                                        hubspot: { enabled: value },
                                    }))
                                }
                            />
                        </div>
                        {envStatus && (
                            <div className="rounded-lg border p-3 bg-muted/30 space-y-1.5">
                                <div className="text-xs font-medium text-muted-foreground mb-1">OAuth Credentials</div>
                                <div className="flex items-center gap-2 text-sm">
                                    {envStatus.hubspot.clientIdSet ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    <span>Client ID</span>
                                    {!envStatus.hubspot.clientIdSet && (
                                        <span className="text-xs text-muted-foreground ml-auto font-mono">HUBSPOT_CLIENT_ID</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    {envStatus.hubspot.clientSecretSet ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    <span>Client Secret</span>
                                    {!envStatus.hubspot.clientSecretSet && (
                                        <span className="text-xs text-muted-foreground ml-auto font-mono">HUBSPOT_CLIENT_SECRET</span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <Separator />

                    {/* C. Asana */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-base">Asana</Label>
                                <p className="text-sm text-muted-foreground">
                                    Project management integration
                                </p>
                            </div>
                            <Switch
                                checked={integrationsSettings.asana.enabled}
                                onCheckedChange={(value) =>
                                    setIntegrationsSettings((prev) => ({
                                        ...prev,
                                        asana: { enabled: value },
                                    }))
                                }
                            />
                        </div>
                        {envStatus && (
                            <div className="rounded-lg border p-3 bg-muted/30 space-y-1.5">
                                <div className="text-xs font-medium text-muted-foreground mb-1">OAuth Credentials</div>
                                <div className="flex items-center gap-2 text-sm">
                                    {envStatus.asana.clientIdSet ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    <span>Client ID</span>
                                    {!envStatus.asana.clientIdSet && (
                                        <span className="text-xs text-muted-foreground ml-auto font-mono">ASANA_CLIENT_ID</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    {envStatus.asana.clientSecretSet ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    <span>Client Secret</span>
                                    {!envStatus.asana.clientSecretSet && (
                                        <span className="text-xs text-muted-foreground ml-auto font-mono">ASANA_CLIENT_SECRET</span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <Separator />

                    {/* D. Twitter / X */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-base">Twitter / X</Label>
                                <p className="text-sm text-muted-foreground">
                                    Social media monitoring and posting
                                </p>
                            </div>
                            <Switch
                                checked={integrationsSettings.twitter.enabled}
                                onCheckedChange={(value) =>
                                    setIntegrationsSettings((prev) => ({
                                        ...prev,
                                        twitter: { ...prev.twitter, enabled: value },
                                    }))
                                }
                            />
                        </div>
                        {integrationsSettings.twitter.enabled && (
                            <div className="space-y-4 pl-1">
                                <div className="space-y-2">
                                    <Label className="text-sm text-muted-foreground">Tiers</Label>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {[
                                            { key: "tier1Enabled" as const, label: "Tier 1: Free (scraping)" },
                                            { key: "tier2Enabled" as const, label: "Tier 2: TwitterAPI.io" },
                                            { key: "tier3Enabled" as const, label: "Tier 3: X API v2" },
                                            { key: "tier4Enabled" as const, label: "Tier 4: xAI Grok" },
                                            { key: "fxTwitterEnabled" as const, label: "FXTwitter (embeds)" },
                                        ].map((tier) => (
                                            <div key={tier.key} className="flex items-center justify-between rounded-lg border p-3">
                                                <Label className="text-sm font-normal">{tier.label}</Label>
                                                <Switch
                                                    checked={integrationsSettings.twitter[tier.key]}
                                                    onCheckedChange={(value) =>
                                                        setIntegrationsSettings((prev) => ({
                                                            ...prev,
                                                            twitter: { ...prev.twitter, [tier.key]: value },
                                                        }))
                                                    }
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <Label className="text-sm text-muted-foreground">API Keys</Label>
                                    {[
                                        { key: "twitterApiIoKey" as const, label: "TwitterAPI.io Key" },
                                        { key: "xApiBearerToken" as const, label: "X API Bearer Token" },
                                        { key: "xAiApiKey" as const, label: "xAI API Key" },
                                    ].map((field) => (
                                        <div key={field.key} className="space-y-1">
                                            <Label className="text-sm">{field.label}</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="password"
                                                    placeholder={`Enter ${field.label}`}
                                                    value={integrationsSettings.twitter[field.key] || ""}
                                                    onChange={(e) =>
                                                        setIntegrationsSettings((prev) => ({
                                                            ...prev,
                                                            twitter: { ...prev.twitter, [field.key]: e.target.value || null },
                                                        }))
                                                    }
                                                />
                                                {integrationsSettings.twitter[field.key] && (
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={() =>
                                                            setIntegrationsSettings((prev) => ({
                                                                ...prev,
                                                                twitter: { ...prev.twitter, [field.key]: null },
                                                            }))
                                                        }
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <Separator />

                    {/* E. HTTP Request Tool */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-base">HTTP Request Tool</Label>
                                <p className="text-sm text-muted-foreground">
                                    Allow the agent to make HTTP requests to specified domains
                                </p>
                            </div>
                            <Switch
                                checked={integrationsSettings.httpRequest.enabled}
                                onCheckedChange={(value) =>
                                    setIntegrationsSettings((prev) => ({
                                        ...prev,
                                        httpRequest: { ...prev.httpRequest, enabled: value },
                                    }))
                                }
                            />
                        </div>
                        {integrationsSettings.httpRequest.enabled && (
                            <div className="space-y-3 pl-1">
                                <Label className="text-sm text-muted-foreground">Allowed Domains</Label>
                                {integrationsSettings.httpRequest.allowedDomains.includes("*") && (
                                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                                        <div className="flex items-center gap-2 text-sm text-amber-200">
                                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                                            Wildcard (*) allows requests to any domain. Use with caution.
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {integrationsSettings.httpRequest.allowedDomains.map((domain) => (
                                        <Badge key={domain} variant="secondary" className="gap-1 pr-1">
                                            <span className="font-mono text-xs">{domain}</span>
                                            <button
                                                onClick={() => handleRemoveDomain(domain)}
                                                className="ml-1 rounded-sm hover:bg-muted-foreground/20 p-0.5"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                    {integrationsSettings.httpRequest.allowedDomains.length === 0 && (
                                        <p className="text-xs text-muted-foreground">No domains configured. Add domains or use * for all.</p>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="api.example.com or *"
                                        value={newDomain}
                                        onChange={(e) => setNewDomain(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
                                    />
                                    <Button variant="outline" onClick={handleAddDomain}>
                                        <Plus className="h-4 w-4 mr-1" />
                                        Add
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* F. Save button */}
                    <Button onClick={handleSaveIntegrations} disabled={savingIntegrations}>
                        {savingIntegrations ? "Saving..." : "Save integration settings"}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileJson className="h-5 w-5" />
                        Configuration Management
                    </CardTitle>
                    <CardDescription>
                        Import and export your MaiaChat configuration as JSON
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {configStatus?.hasFileOverride && (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                                <div>
                                    <div className="font-medium text-amber-200">Config file overrides DB</div>
                                    <p className="text-sm text-amber-200/80">
                                        Admin settings are synced to the database, but the config file takes precedence on load.
                                        If you edit config.json manually, it will override these toggles until they are re-saved.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Config Status */}
                    {configStatus && (
                        <div className="rounded-lg border p-4 bg-muted/30">
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                <span className="font-medium">Configuration Loaded</span>
                            </div>
                            <div className="grid gap-1 text-sm text-muted-foreground">
                                <div>Version: <code className="bg-muted px-1 rounded">{configStatus.version || "1.0.0"}</code></div>
                                <div>Source: {configStatus.source || "defaults"}</div>
                            </div>
                        </div>
                    )}

                    {/* Import Error */}
                    {importError && (
                        <div className="rounded-lg border border-destructive/50 p-4 bg-destructive/10">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-destructive" />
                                <span className="text-sm text-destructive">{importError}</span>
                            </div>
                        </div>
                    )}

                    {/* Export/Import Buttons */}
                    <div className="flex flex-wrap gap-4">
                        <Button
                            variant="outline"
                            onClick={handleExportConfig}
                            disabled={isExporting}
                        >
                            {isExporting ? (
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Download className="mr-2 h-4 w-4" />
                            )}
                            Export Configuration
                        </Button>

                        <div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
                                onChange={handleImportConfig}
                                className="hidden"
                                id="config-import"
                            />
                            <Button
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isImporting}
                            >
                                {isImporting ? (
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Upload className="mr-2 h-4 w-4" />
                                )}
                                Import Configuration
                            </Button>
                        </div>
                    </div>

                    <div className="text-sm text-muted-foreground space-y-1">
                        <p>Export saves all configurable settings including:</p>
                        <ul className="list-disc list-inside ml-2 space-y-0.5">
                            <li>Task execution settings (retry count, timeouts)</li>
                            <li>Notification preferences</li>
                            <li>Memory and retrieval settings</li>
                            <li>Skills configuration</li>
                            <li>CLI tool settings</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>IP Block List</CardTitle>
                    <CardDescription>Manage blocked IP addresses</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-[2fr_3fr_auto] items-end">
                        <div className="space-y-2">
                            <Label>IP address</Label>
                            <Input
                                placeholder="203.0.113.12"
                                value={newIp}
                                onChange={(event) => setNewIp(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Label (optional)</Label>
                            <Input
                                placeholder="Suspicious activity"
                                value={newLabel}
                                onChange={(event) => setNewLabel(event.target.value)}
                            />
                        </div>
                        <Button onClick={handleAddIp}>Block IP</Button>
                    </div>

                    {ipBlocks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No blocked IPs yet.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>IP</TableHead>
                                    <TableHead>Label</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Added</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ipBlocks.map((block) => (
                                    <TableRow key={block.id}>
                                        <TableCell className="font-mono">{block.ipAddress}</TableCell>
                                        <TableCell>{block.label || "—"}</TableCell>
                                        <TableCell>
                                            <Badge variant={block.isActive ? "default" : "secondary"}>
                                                {block.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{new Date(block.createdAt).toLocaleString()}</TableCell>
                                        <TableCell className="text-right space-x-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleToggleIp(block)}
                                            >
                                                {block.isActive ? (
                                                    <ShieldX className="h-4 w-4" />
                                                ) : (
                                                    <ShieldCheck className="h-4 w-4" />
                                                )}
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => handleDeleteIp(block)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
