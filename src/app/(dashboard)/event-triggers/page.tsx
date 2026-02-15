"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    ChevronDown,
    ChevronRight,
    Copy,
    Eye,
    EyeOff,
    Loader2,
    Pencil,
    Play,
    RefreshCw,
    ScrollText,
    Trash2,
    Webhook,
    Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface EventTrigger {
    id: string;
    name: string;
    description?: string | null;
    sourceType: string;
    sourceConfig?: {
        webhookPath?: string;
        webhookSecret?: string;
    } | null;
    actionType: string;
    actionConfig?: {
        message?: string;
        channel?: string;
        targetId?: string;
        skillSlug?: string;
        notifyMethod?: "message" | "email";
        emailTo?: string;
        emailSubject?: string;
    } | null;
    isEnabled?: boolean | null;
    maxTriggersPerHour?: number | null;
    cooldownSeconds?: number | null;
    lastTriggeredAt?: string | null;
    triggerCount?: number | null;
    createdAt?: string | null;
}

interface TriggerLog {
    id: string;
    status: string;
    triggeredAt: string;
    durationMs?: number | null;
    error?: string | null;
    output?: string | null;
}

function formatDate(value?: string | null) {
    if (!value) return "Never";
    return new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function statusColor(status: string) {
    switch (status) {
        case "success": return "text-green-600 dark:text-green-400";
        case "error": return "text-red-600 dark:text-red-400";
        case "rate_limited": return "text-yellow-600 dark:text-yellow-400";
        case "skipped": return "text-muted-foreground";
        default: return "text-muted-foreground";
    }
}

export default function EventTriggersPage() {
    const [triggers, setTriggers] = useState<EventTrigger[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
    const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
    const [triggerLogs, setTriggerLogs] = useState<Record<string, TriggerLog[]>>({});
    const [loadingLogs, setLoadingLogs] = useState<Set<string>>(new Set());
    const [editTrigger, setEditTrigger] = useState<EventTrigger | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [editForm, setEditForm] = useState({
        name: "",
        description: "",
        actionMessage: "",
        actionChannel: "",
        actionTargetId: "",
        notifyMethod: "message" as "message" | "email",
        emailTo: "",
        emailSubject: "",
        maxTriggersPerHour: 60,
        cooldownSeconds: 0,
    });
    const [form, setForm] = useState({
        name: "",
        description: "",
        sourceType: "webhook",
        actionType: "agent_turn",
        actionMessage: "",
        actionChannel: "",
        notifyMethod: "message" as "message" | "email",
        emailTo: "",
        emailSubject: "",
        isEnabled: true,
        maxTriggersPerHour: 60,
        cooldownSeconds: 0,
    });

    const fetchTriggers = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/event-triggers", {
                credentials: "include",
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to load triggers");
            }
            setTriggers(data.triggers || []);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load triggers");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTriggers();
    }, []);

    const handleCreate = async () => {
        if (!form.name.trim()) {
            toast.error("Please enter a trigger name");
            return;
        }

        try {
            setIsCreating(true);
            const response = await fetch("/api/event-triggers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name,
                    description: form.description || undefined,
                    sourceType: form.sourceType,
                    actionType: form.actionType,
                    actionConfig: {
                        message: form.actionMessage || undefined,
                        channel: form.actionChannel || undefined,
                        ...(form.actionType === "notify" && {
                            notifyMethod: form.notifyMethod,
                            ...(form.notifyMethod === "email" && {
                                emailTo: form.emailTo || undefined,
                                emailSubject: form.emailSubject || undefined,
                            }),
                        }),
                    },
                    isEnabled: form.isEnabled,
                    maxTriggersPerHour: form.maxTriggersPerHour,
                    cooldownSeconds: form.cooldownSeconds,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to create trigger");
            }

            toast.success("Event trigger created");
            setForm({
                name: "",
                description: "",
                sourceType: "webhook",
                actionType: "agent_turn",
                actionMessage: "",
                actionChannel: "",
                notifyMethod: "message",
                emailTo: "",
                emailSubject: "",
                isEnabled: true,
                maxTriggersPerHour: 60,
                cooldownSeconds: 0,
            });
            fetchTriggers();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create trigger");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (triggerId: string) => {
        try {
            const response = await fetch(`/api/event-triggers/${triggerId}`, {
                method: "DELETE",
                credentials: "include",
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to delete trigger");
            }
            toast.success("Trigger deleted");
            fetchTriggers();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete trigger");
        }
    };

    const handleToggleEnabled = async (trigger: EventTrigger) => {
        try {
            const response = await fetch(`/api/event-triggers/${trigger.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ isEnabled: !trigger.isEnabled }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to update trigger");
            }
            setTriggers((prev) =>
                prev.map((t) => (t.id === trigger.id ? { ...t, isEnabled: !t.isEnabled } : t))
            );
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update trigger");
        }
    };

    const handleTest = async (triggerId: string) => {
        try {
            setTestingId(triggerId);
            const response = await fetch(`/api/event-triggers/${triggerId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    testPayload: { test: true, timestamp: new Date().toISOString() },
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to test trigger");
            }

            if (data.success) {
                toast.success("Trigger executed successfully");
            } else {
                toast.error(data.error || "Trigger execution failed");
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to test trigger");
        } finally {
            setTestingId(null);
        }
    };

    const openEditDialog = (trigger: EventTrigger) => {
        setEditTrigger(trigger);
        setEditForm({
            name: trigger.name,
            description: trigger.description || "",
            actionMessage: trigger.actionConfig?.message || "",
            actionChannel: trigger.actionConfig?.channel || "",
            actionTargetId: trigger.actionConfig?.targetId || "",
            notifyMethod: trigger.actionConfig?.notifyMethod || "message",
            emailTo: trigger.actionConfig?.emailTo || "",
            emailSubject: trigger.actionConfig?.emailSubject || "",
            maxTriggersPerHour: trigger.maxTriggersPerHour ?? 60,
            cooldownSeconds: trigger.cooldownSeconds ?? 0,
        });
    };

    const handleSaveEdit = async () => {
        if (!editTrigger) return;
        try {
            setIsSaving(true);
            const response = await fetch(`/api/event-triggers/${editTrigger.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: editForm.name,
                    description: editForm.description || null,
                    actionConfig: {
                        ...editTrigger.actionConfig,
                        message: editForm.actionMessage || undefined,
                        channel: editForm.actionChannel || undefined,
                        targetId: editForm.actionTargetId || undefined,
                        ...(editTrigger.actionType === "notify" && {
                            notifyMethod: editForm.notifyMethod,
                            emailTo: editForm.notifyMethod === "email" ? (editForm.emailTo || undefined) : undefined,
                            emailSubject: editForm.notifyMethod === "email" ? (editForm.emailSubject || undefined) : undefined,
                        }),
                    },
                    maxTriggersPerHour: editForm.maxTriggersPerHour,
                    cooldownSeconds: editForm.cooldownSeconds,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to update trigger");
            }
            toast.success("Trigger updated");
            setEditTrigger(null);
            fetchTriggers();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update trigger");
        } finally {
            setIsSaving(false);
        }
    };

    const fetchLogs = useCallback(async (triggerId: string) => {
        setLoadingLogs((prev) => new Set(prev).add(triggerId));
        try {
            const response = await fetch(`/api/event-triggers/${triggerId}/logs?limit=20`, {
                credentials: "include",
            });
            const data = await response.json();
            if (response.ok) {
                setTriggerLogs((prev) => ({ ...prev, [triggerId]: data.logs || [] }));
            }
        } catch {
            // silently fail for logs
        } finally {
            setLoadingLogs((prev) => {
                const next = new Set(prev);
                next.delete(triggerId);
                return next;
            });
        }
    }, []);

    const toggleLogs = (triggerId: string) => {
        setExpandedLogs((prev) => {
            const next = new Set(prev);
            if (next.has(triggerId)) {
                next.delete(triggerId);
            } else {
                next.add(triggerId);
                if (!triggerLogs[triggerId]) {
                    fetchLogs(triggerId);
                }
            }
            return next;
        });
    };

    const copyWebhookUrl = (trigger: EventTrigger) => {
        const webhookPath = trigger.sourceConfig?.webhookPath;
        if (!webhookPath) return;

        const baseUrl = window.location.origin;
        const fullUrl = `${baseUrl}/api/webhooks${webhookPath}`;

        navigator.clipboard.writeText(fullUrl);
        toast.success("Webhook URL copied to clipboard");
    };

    const copyWebhookSecret = (trigger: EventTrigger) => {
        const secret = trigger.sourceConfig?.webhookSecret;
        if (!secret) return;

        navigator.clipboard.writeText(secret);
        toast.success("Webhook secret copied to clipboard");
    };

    const toggleSecretVisibility = (triggerId: string) => {
        setRevealedSecrets((prev) => {
            const next = new Set(prev);
            if (next.has(triggerId)) {
                next.delete(triggerId);
            } else {
                next.add(triggerId);
            }
            return next;
        });
    };

    return (
        <div className="container max-w-6xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Event Triggers</h1>
                    <p className="text-muted-foreground mt-1">
                        React to webhooks, file changes, and external events
                    </p>
                </div>
                <Button variant="outline" size="icon" onClick={fetchTriggers}>
                    <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        New Event Trigger
                    </CardTitle>
                    <CardDescription>
                        Create a trigger to automatically respond to external events
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Trigger Name</label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder="GitHub Push Handler"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Source Type</label>
                            <Select
                                value={form.sourceType}
                                onValueChange={(value) => setForm((prev) => ({ ...prev, sourceType: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="webhook">Webhook</SelectItem>
                                    <SelectItem value="schedule">Schedule</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Description (optional)</label>
                        <Input
                            value={form.description}
                            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder="Handles incoming GitHub webhook events"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Action Type</label>
                            <Select
                                value={form.actionType}
                                onValueChange={(value) => setForm((prev) => ({ ...prev, actionType: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="agent_turn">Run AI Agent</SelectItem>
                                    <SelectItem value="notify">Send Notification</SelectItem>
                                    <SelectItem value="skill">Execute Skill</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {form.actionType === "notify" ? (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Notify Method</label>
                                <Select
                                    value={form.notifyMethod}
                                    onValueChange={(value: "message" | "email") => setForm((prev) => ({ ...prev, notifyMethod: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="message">Channel Message</SelectItem>
                                        <SelectItem value="email">Email (Gmail)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Target Channel (optional)</label>
                                <Input
                                    value={form.actionChannel}
                                    onChange={(e) => setForm((prev) => ({ ...prev, actionChannel: e.target.value }))}
                                    placeholder="telegram, discord, slack"
                                />
                            </div>
                        )}
                    </div>

                    {/* Notify: Channel fields */}
                    {form.actionType === "notify" && form.notifyMethod === "message" && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Target Channel</label>
                            <Input
                                value={form.actionChannel}
                                onChange={(e) => setForm((prev) => ({ ...prev, actionChannel: e.target.value }))}
                                placeholder="telegram, discord, slack"
                            />
                        </div>
                    )}

                    {/* Notify: Email fields */}
                    {form.actionType === "notify" && form.notifyMethod === "email" && (
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Email To</label>
                                <Input
                                    value={form.emailTo}
                                    onChange={(e) => setForm((prev) => ({ ...prev, emailTo: e.target.value }))}
                                    placeholder="recipient@example.com"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Comma-separated for multiple recipients
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Email Subject</label>
                                <Input
                                    value={form.emailSubject}
                                    onChange={(e) => setForm((prev) => ({ ...prev, emailSubject: e.target.value }))}
                                    placeholder='Trigger: {{payload}}'
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Action Message / Prompt</label>
                        <Textarea
                            value={form.actionMessage}
                            onChange={(e) => setForm((prev) => ({ ...prev, actionMessage: e.target.value }))}
                            placeholder="Process this webhook event and summarize any important changes: {{payload}}"
                            rows={3}
                        />
                        <p className="text-xs text-muted-foreground">
                            Use {"{{payload}}"} to include the event data in your message
                        </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Max Triggers/Hour</label>
                            <Input
                                type="number"
                                value={form.maxTriggersPerHour}
                                onChange={(e) => setForm((prev) => ({ ...prev, maxTriggersPerHour: parseInt(e.target.value) || 60 }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Cooldown (seconds)</label>
                            <Input
                                type="number"
                                value={form.cooldownSeconds}
                                onChange={(e) => setForm((prev) => ({ ...prev, cooldownSeconds: parseInt(e.target.value) || 0 }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Enabled</label>
                            <div className="flex items-center gap-2 pt-1">
                                <Switch
                                    checked={form.isEnabled}
                                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isEnabled: checked }))}
                                />
                                <span className="text-sm text-muted-foreground">
                                    {form.isEnabled ? "Active" : "Disabled"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <Button onClick={handleCreate} disabled={isCreating}>
                        {isCreating ? "Creating..." : "Create Trigger"}
                    </Button>
                </CardContent>
            </Card>

            <div className="space-y-3">
                <h2 className="text-xl font-semibold">Existing Triggers</h2>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : triggers.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center text-muted-foreground">
                            No event triggers yet.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {triggers.map((trigger) => (
                            <Card key={trigger.id}>
                                <CardHeader className="flex flex-row items-start justify-between pb-2">
                                    <div className="space-y-1">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Webhook className="h-4 w-4" />
                                            {trigger.name}
                                        </CardTitle>
                                        {trigger.description && (
                                            <CardDescription className="text-xs">
                                                {trigger.description}
                                            </CardDescription>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Switch
                                            checked={trigger.isEnabled ?? false}
                                            onCheckedChange={() => handleToggleEnabled(trigger)}
                                            className="mr-2"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditDialog(trigger)}
                                            title="Edit trigger"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleTest(trigger.id)}
                                            disabled={testingId === trigger.id}
                                            title="Test trigger"
                                        >
                                            {testingId === trigger.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Play className="h-4 w-4" />
                                            )}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-destructive"
                                            onClick={() => handleDelete(trigger.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex flex-wrap gap-2">
                                        <Badge variant="outline">{trigger.sourceType}</Badge>
                                        <Badge variant="outline">{trigger.actionType}</Badge>
                                    </div>

                                    {/* Webhook URL */}
                                    {trigger.sourceType === "webhook" && trigger.sourceConfig?.webhookPath && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                                <code className="text-xs flex-1 truncate">
                                                    {window.location.origin}/api/webhooks{trigger.sourceConfig.webhookPath}
                                                </code>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={() => copyWebhookUrl(trigger)}
                                                    title="Copy webhook URL"
                                                >
                                                    <Copy className="h-3 w-3" />
                                                </Button>
                                            </div>

                                            {/* Webhook Secret */}
                                            {trigger.sourceConfig?.webhookSecret && (
                                                <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                                    <span className="text-xs text-muted-foreground font-medium shrink-0">
                                                        Secret:
                                                    </span>
                                                    <code className="text-xs flex-1 truncate font-mono">
                                                        {revealedSecrets.has(trigger.id)
                                                            ? trigger.sourceConfig.webhookSecret
                                                            : "\u2022".repeat(32)}
                                                    </code>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() => toggleSecretVisibility(trigger.id)}
                                                        title={revealedSecrets.has(trigger.id) ? "Hide secret" : "Reveal secret"}
                                                    >
                                                        {revealedSecrets.has(trigger.id) ? (
                                                            <EyeOff className="h-3 w-3" />
                                                        ) : (
                                                            <Eye className="h-3 w-3" />
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() => copyWebhookSecret(trigger)}
                                                        title="Copy secret"
                                                    >
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                                        <div>Last triggered: {formatDate(trigger.lastTriggeredAt)}</div>
                                        <div>Total fires: {trigger.triggerCount ?? 0}</div>
                                        <div>Rate limit: {trigger.maxTriggersPerHour}/hour</div>
                                    </div>

                                    {/* Execution Logs Toggle */}
                                    <button
                                        onClick={() => toggleLogs(trigger.id)}
                                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {expandedLogs.has(trigger.id) ? (
                                            <ChevronDown className="h-3 w-3" />
                                        ) : (
                                            <ChevronRight className="h-3 w-3" />
                                        )}
                                        <ScrollText className="h-3 w-3" />
                                        Execution Logs
                                    </button>

                                    {/* Logs Panel */}
                                    {expandedLogs.has(trigger.id) && (
                                        <div className="border rounded-md overflow-hidden">
                                            {loadingLogs.has(trigger.id) ? (
                                                <div className="flex items-center justify-center py-4">
                                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                </div>
                                            ) : (triggerLogs[trigger.id]?.length ?? 0) === 0 ? (
                                                <div className="py-4 text-center text-xs text-muted-foreground">
                                                    No execution logs yet
                                                </div>
                                            ) : (
                                                <div className="max-h-64 overflow-y-auto">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-muted/50 sticky top-0">
                                                            <tr>
                                                                <th className="text-left px-3 py-1.5 font-medium">Time</th>
                                                                <th className="text-left px-3 py-1.5 font-medium">Status</th>
                                                                <th className="text-right px-3 py-1.5 font-medium">Duration</th>
                                                                <th className="text-left px-3 py-1.5 font-medium">Details</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y">
                                                            {triggerLogs[trigger.id]?.map((log) => (
                                                                <tr key={log.id} className="hover:bg-muted/30">
                                                                    <td className="px-3 py-1.5 whitespace-nowrap">
                                                                        {formatDate(log.triggeredAt)}
                                                                    </td>
                                                                    <td className={cn("px-3 py-1.5 font-medium", statusColor(log.status))}>
                                                                        {log.status}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                                                                        {log.durationMs != null ? `${log.durationMs}ms` : "-"}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 truncate max-w-[200px]">
                                                                        {log.error || log.output || "-"}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                            <div className="border-t px-3 py-1.5 bg-muted/30">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 text-xs"
                                                    onClick={() => fetchLogs(trigger.id)}
                                                >
                                                    <RefreshCw className="h-3 w-3 mr-1" />
                                                    Refresh
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Edit Dialog */}
            <Dialog open={editTrigger !== null} onOpenChange={(open) => !open && setEditTrigger(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Trigger</DialogTitle>
                        <DialogDescription>
                            Update trigger settings. Source type and action type cannot be changed.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Name</label>
                            <Input
                                value={editForm.name}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Description</label>
                            <Input
                                value={editForm.description}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Action Message / Prompt</label>
                            <Textarea
                                value={editForm.actionMessage}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, actionMessage: e.target.value }))}
                                rows={3}
                            />
                        </div>
                        {/* Notify method selector (only for notify action type) */}
                        {editTrigger?.actionType === "notify" && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Notify Method</label>
                                <Select
                                    value={editForm.notifyMethod}
                                    onValueChange={(value: "message" | "email") => setEditForm((prev) => ({ ...prev, notifyMethod: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="message">Channel Message</SelectItem>
                                        <SelectItem value="email">Email (Gmail)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Email fields (notify + email method) */}
                        {editTrigger?.actionType === "notify" && editForm.notifyMethod === "email" ? (
                            <div className="grid gap-4 grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Email To</label>
                                    <Input
                                        value={editForm.emailTo}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, emailTo: e.target.value }))}
                                        placeholder="recipient@example.com"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Comma-separated for multiple
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Email Subject</label>
                                    <Input
                                        value={editForm.emailSubject}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, emailSubject: e.target.value }))}
                                        placeholder='Trigger: {{payload}}'
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="grid gap-4 grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Target Channel</label>
                                    <Input
                                        value={editForm.actionChannel}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, actionChannel: e.target.value }))}
                                        placeholder="telegram, discord"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Target ID</label>
                                    <Input
                                        value={editForm.actionTargetId}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, actionTargetId: e.target.value }))}
                                        placeholder="Thread/channel ID"
                                    />
                                </div>
                            </div>
                        )}
                        <div className="grid gap-4 grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Max Triggers/Hour</label>
                                <Input
                                    type="number"
                                    value={editForm.maxTriggersPerHour}
                                    onChange={(e) => setEditForm((prev) => ({ ...prev, maxTriggersPerHour: parseInt(e.target.value) || 60 }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Cooldown (seconds)</label>
                                <Input
                                    type="number"
                                    value={editForm.cooldownSeconds}
                                    onChange={(e) => setEditForm((prev) => ({ ...prev, cooldownSeconds: parseInt(e.target.value) || 0 }))}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditTrigger(null)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveEdit} disabled={isSaving}>
                            {isSaving ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
