"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Loader2, Pencil, Play, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ScheduledTask {
    id: string;
    name: string;
    prompt: string;
    cron: string;
    timezone?: string | null;
    channelAccountId?: string | null;
    modelId?: string | null;
    executionMode?: "model" | "agent";
    agentId?: string | null;
    isEnabled?: boolean | null;
    lastRunAt?: string | null;
    nextRunAt?: string | null;
    lastError?: string | null;
    lastOutput?: string | null;
    runCount?: number | null;
    createdAt?: string | null;
}

interface Model {
    id: string;
    name: string;
    provider: string;
}

interface ChannelAccount {
    id: string;
    channelType: string;
    channelId: string;
    displayName?: string | null;
    isActive?: boolean | null;
}

interface AgentOption {
    id: string;
    name: string;
    modelId: string;
}

interface ProactiveTemplate {
    id: string;
    name: string;
    description: string;
    category: string;
    icon?: string;
    defaultPrompt: string;
    defaultCron: string;
    defaultTimezone?: string;
}

const cronExamples = [
    { label: "Every day at 9am", value: "0 9 * * *" },
    { label: "Every Monday at 8am", value: "0 8 * * 1" },
    { label: "Every hour", value: "0 * * * *" },
    { label: "Every 15 minutes", value: "*/15 * * * *" },
];

function formatDate(value?: string | null) {
    if (!value) return "—";
    return new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function ScheduledTasksPage() {
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);
    const [channels, setChannels] = useState<ChannelAccount[]>([]);
    const [models, setModels] = useState<Model[]>([]);
    const [agents, setAgents] = useState<AgentOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [runningId, setRunningId] = useState<string | null>(null);
    const [templates, setTemplates] = useState<ProactiveTemplate[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
    const [form, setForm] = useState({
        name: "",
        prompt: "",
        cron: "",
        timezone: "",
        channelAccountId: "",
        modelId: "",
        executionMode: "model" as "model" | "agent",
        agentId: "",
        isEnabled: true,
    });

    const channelMap = useMemo(() => {
        return new Map(channels.map((c) => [c.id, c]));
    }, [channels]);

    const agentMap = useMemo(() => {
        return new Map(agents.map((a) => [a.id, a]));
    }, [agents]);

    const fetchTasks = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/scheduled-tasks", { credentials: "include" });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to load scheduled tasks");
            }
            setTasks(data.tasks || []);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load scheduled tasks");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchChannels = async () => {
        try {
            const response = await fetch("/api/channels", { credentials: "include" });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to load channels");
            }
            setChannels(data.accounts || []);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load channels");
        }
    };

    const fetchModels = async () => {
        try {
            const response = await fetch("/api/models", { credentials: "include" });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to load models");
            }
            // API returns flat array of models with provider field
            const allModels: Model[] = [];
            if (Array.isArray(data.models)) {
                for (const model of data.models) {
                    if (model.id && model.name) {
                        allModels.push({
                            id: model.id,
                            name: model.name,
                            provider: model.provider || "unknown",
                        });
                    }
                }
            }
            setModels(allModels);
        } catch (error) {
            console.error("Failed to load models:", error);
            // Non-critical, don't show toast
        }
    };

    const fetchAgents = async () => {
        try {
            const response = await fetch("/api/agents?templates=true", { credentials: "include" });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to load agents");
            }
            const items: AgentOption[] = Array.isArray(data.agents)
                ? data.agents.map((agent: { id: string; name: string; modelId: string }) => ({
                    id: agent.id,
                    name: agent.name,
                    modelId: agent.modelId,
                }))
                : [];
            setAgents(items);
        } catch (error) {
            console.error("Failed to load agents:", error);
        }
    };

    const fetchTemplates = async () => {
        try {
            setTemplatesLoading(true);
            const response = await fetch("/api/proactive-templates", { credentials: "include" });
            const data = await response.json();
            if (response.ok && data.templates) {
                setTemplates(data.templates);
            }
        } catch (error) {
            console.error("Failed to load templates:", error);
        } finally {
            setTemplatesLoading(false);
        }
    };

    const handleUseTemplate = async (templateId: string) => {
        try {
            const response = await fetch("/api/proactive-templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ templateId }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to create task from template");
            }
            toast.success(`Task created from "${data.template}" template`);
            fetchTasks();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to use template");
        }
    };

    useEffect(() => {
        fetchChannels();
        fetchModels();
        fetchAgents();
        fetchTemplates();
        fetchTasks();
    }, []);

    const handleCreate = async () => {
        if (!form.name.trim() || !form.prompt.trim() || !form.cron.trim()) {
            toast.error("Please fill in name, prompt, and cron expression");
            return;
        }
        if (form.executionMode === "agent" && !form.agentId) {
            toast.error("Please select an agent for agent execution mode");
            return;
        }

        try {
            setIsCreating(true);
            const response = await fetch("/api/scheduled-tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name,
                    prompt: form.prompt,
                    cron: form.cron,
                    timezone: form.timezone || undefined,
                    channelAccountId: form.channelAccountId || undefined,
                    modelId: form.executionMode === "model" ? (form.modelId || undefined) : undefined,
                    executionMode: form.executionMode,
                    agentId: form.executionMode === "agent" ? (form.agentId || undefined) : undefined,
                    isEnabled: form.isEnabled,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to create task");
            }

            toast.success("Scheduled task created");
            setForm({
                name: "",
                prompt: "",
                cron: "",
                timezone: "",
                channelAccountId: "",
                modelId: "",
                executionMode: "model",
                agentId: "",
                isEnabled: true,
            });
            fetchTasks();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create task");
        } finally {
            setIsCreating(false);
        }
    };

    const handleEdit = (task: ScheduledTask) => {
        setEditingTask(task);
        setForm({
            name: task.name,
            prompt: task.prompt,
            cron: task.cron,
            timezone: task.timezone || "",
            channelAccountId: task.channelAccountId || "",
            modelId: task.modelId || "",
            executionMode: task.executionMode || "model",
            agentId: task.agentId || "",
            isEnabled: task.isEnabled ?? true,
        });
        // Scroll to form and focus on name input
        setTimeout(() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            // Focus the name input to make edit mode obvious
            const nameInput = document.getElementById("task-name-input");
            if (nameInput) nameInput.focus();
        }, 50);
        toast.info(`Editing "${task.name}" - see form above`);
    };

    const handleCancelEdit = () => {
        setEditingTask(null);
        setForm({
            name: "",
            prompt: "",
            cron: "",
            timezone: "",
            channelAccountId: "",
            modelId: "",
            executionMode: "model",
            agentId: "",
            isEnabled: true,
        });
    };

    const handleUpdate = async () => {
        if (!editingTask) return;
        if (!form.name.trim() || !form.prompt.trim() || !form.cron.trim()) {
            toast.error("Please fill in name, prompt, and cron expression");
            return;
        }
        if (form.executionMode === "agent" && !form.agentId) {
            toast.error("Please select an agent for agent execution mode");
            return;
        }

        try {
            setIsCreating(true);
            const response = await fetch(`/api/scheduled-tasks/${editingTask.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name,
                    prompt: form.prompt,
                    cron: form.cron,
                    timezone: form.timezone || null,
                    channelAccountId: form.channelAccountId || null,
                    modelId: form.executionMode === "model" ? (form.modelId || null) : null,
                    executionMode: form.executionMode,
                    agentId: form.executionMode === "agent" ? (form.agentId || null) : null,
                    isEnabled: form.isEnabled,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to update task");
            }

            toast.success("Scheduled task updated");
            handleCancelEdit();
            fetchTasks();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update task");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (taskId: string) => {
        try {
            const response = await fetch(`/api/scheduled-tasks/${taskId}`, {
                method: "DELETE",
                credentials: "include",
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to delete task");
            }
            toast.success("Scheduled task deleted");
            fetchTasks();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete task");
        }
    };

    const handleRun = async (taskId: string) => {
        try {
            setRunningId(taskId);
            const response = await fetch(`/api/scheduled-tasks/${taskId}`, {
                method: "POST",
                credentials: "include",
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to run task");
            }

            if (data.success) {
                toast.success("Task executed successfully");
            } else {
                toast.error(data.error || "Task execution failed");
            }
            fetchTasks();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to run task");
        } finally {
            setRunningId(null);
        }
    };

    return (
        <div className="container max-w-6xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Scheduled Tasks</h1>
                    <p className="text-muted-foreground mt-1">
                        Create automated prompts that run on a schedule and post to a channel
                    </p>
                </div>
                <Button variant="outline" size="icon" onClick={fetchTasks}>
                    <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                </Button>
            </div>

            {/* Quick Templates */}
            {templates.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Sparkles className="h-4 w-4" />
                            Quick Templates
                        </CardTitle>
                        <CardDescription>
                            One-click setup for common scheduled tasks
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {templates.map((tmpl) => (
                                <div
                                    key={tmpl.id}
                                    className="border rounded-lg p-3 space-y-2 hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="space-y-1 min-w-0">
                                            <p className="text-sm font-medium leading-tight">{tmpl.name}</p>
                                            <p className="text-xs text-muted-foreground line-clamp-2">{tmpl.description}</p>
                                        </div>
                                        <Badge variant="outline" className="text-[10px] shrink-0">
                                            {tmpl.category}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-[10px] text-muted-foreground">{tmpl.defaultCron}</span>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs"
                                            onClick={() => handleUseTemplate(tmpl.id)}
                                        >
                                            Use Template
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className={cn(editingTask && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <CalendarClock className="h-5 w-5" />
                                {editingTask ? "Edit Scheduled Task" : "New Scheduled Task"}
                            </CardTitle>
                            <CardDescription>
                                {editingTask
                                    ? `Editing: ${editingTask.name}`
                                    : "Define what to send, when to send it, and which channel to use"}
                            </CardDescription>
                        </div>
                        {editingTask && (
                            <Button variant="ghost" size="icon" onClick={handleCancelEdit} title="Cancel editing">
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Task Name</label>
                            <Input
                                id="task-name-input"
                                value={form.name}
                                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder="Daily summary"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Channel (optional)</label>
                            <Select
                                value={form.channelAccountId || "__none__"}
                                onValueChange={(value) => setForm((prev) => ({ ...prev, channelAccountId: value === "__none__" ? "" : value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="No delivery (logs only)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No delivery (logs only)</SelectItem>
                                    {channels.map((channel) => (
                                        <SelectItem key={channel.id} value={channel.id}>
                                            {channel.displayName || channel.channelId} ({channel.channelType})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Execution Mode</label>
                            <Select
                                value={form.executionMode}
                                onValueChange={(value) => setForm((prev) => ({
                                    ...prev,
                                    executionMode: value as "model" | "agent",
                                    modelId: value === "agent" ? "" : prev.modelId,
                                    agentId: value === "model" ? "" : prev.agentId,
                                }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="model">Model</SelectItem>
                                    <SelectItem value="agent">Agent</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                {form.executionMode === "agent" ? "Agent" : "Model (optional)"}
                            </label>
                            <Select
                                value={form.executionMode === "agent" ? (form.agentId || "__none__") : (form.modelId || "__auto__")}
                                onValueChange={(value) => setForm((prev) => (
                                    prev.executionMode === "agent"
                                        ? { ...prev, agentId: value === "__none__" ? "" : value }
                                        : { ...prev, modelId: value === "__auto__" ? "" : value }
                                ))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={form.executionMode === "agent" ? "Select an agent" : "Auto-select"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {form.executionMode === "agent" ? (
                                        <>
                                            <SelectItem value="__none__">Select agent...</SelectItem>
                                            {agents.map((agent) => (
                                                <SelectItem key={agent.id} value={agent.id}>
                                                    {agent.name} ({agent.modelId})
                                                </SelectItem>
                                            ))}
                                        </>
                                    ) : (
                                        <>
                                            <SelectItem value="__auto__">Auto-select (uses your API keys)</SelectItem>
                                            {models.map((model) => (
                                                <SelectItem key={model.id} value={model.id}>
                                                    {model.name} ({model.provider})
                                                </SelectItem>
                                            ))}
                                        </>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Prompt</label>
                        <Textarea
                            value={form.prompt}
                            onChange={(e) => setForm((prev) => ({ ...prev, prompt: e.target.value }))}
                            placeholder="Summarize yesterday's updates and highlight key blockers."
                            rows={4}
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Cron Expression</label>
                            <Input
                                value={form.cron}
                                onChange={(e) => setForm((prev) => ({ ...prev, cron: e.target.value }))}
                                placeholder="0 9 * * *"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Timezone (optional)</label>
                            <Input
                                value={form.timezone}
                                onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
                                placeholder="America/New_York"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Enabled</label>
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={form.isEnabled}
                                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isEnabled: checked }))}
                                />
                                <span className="text-sm text-muted-foreground">
                                    {form.isEnabled ? "Active" : "Paused"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {cronExamples.map((example) => (
                            <button
                                key={example.value}
                                type="button"
                                className="border rounded-full px-3 py-1 hover:bg-muted"
                                onClick={() => setForm((prev) => ({ ...prev, cron: example.value }))}
                            >
                                {example.label}: <span className="font-mono">{example.value}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-2">
                        {editingTask && (
                            <Button variant="outline" onClick={handleCancelEdit}>
                                Cancel
                            </Button>
                        )}
                        <Button onClick={editingTask ? handleUpdate : handleCreate} disabled={isCreating}>
                            {isCreating
                                ? (editingTask ? "Updating..." : "Creating...")
                                : (editingTask ? "Update Task" : "Create Task")}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-3">
                <h2 className="text-xl font-semibold">Existing Tasks</h2>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : tasks.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center text-muted-foreground">
                            No scheduled tasks yet.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {tasks.map((task) => {
                            const channel = task.channelAccountId ? channelMap.get(task.channelAccountId) : undefined;
                            return (
                                <Card key={task.id}>
                                    <CardHeader className="flex flex-row items-start justify-between">
                                        <div className="space-y-1">
                                            <CardTitle className="text-base">{task.name}</CardTitle>
                                            <CardDescription className="text-xs">
                                                {channel ? `${channel.displayName || channel.channelId} (${channel.channelType})` : "No channel (logs only)"}
                                            </CardDescription>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant={task.isEnabled ? "secondary" : "outline"}>
                                                {task.isEnabled ? "Enabled" : "Paused"}
                                            </Badge>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleEdit(task)}
                                                title="Edit task"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleRun(task.id)}
                                                disabled={runningId === task.id}
                                                title="Run now"
                                            >
                                                {runningId === task.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Play className="h-4 w-4" />
                                                )}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-muted-foreground hover:text-destructive"
                                                onClick={() => handleDelete(task.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-2 text-sm">
                                        <div className="font-mono text-xs text-muted-foreground">
                                            {task.cron} {task.timezone ? `(${task.timezone})` : ""}
                                        </div>
                                        <div className="text-muted-foreground">
                                            {task.prompt}
                                        </div>
                                        <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                                            <div>Next run: {formatDate(task.nextRunAt)}</div>
                                            <div>Last run: {formatDate(task.lastRunAt)}</div>
                                            <div>Runs: {task.runCount ?? 0}</div>
                                        </div>
                                        {task.executionMode === "agent" && task.agentId ? (
                                            <div className="text-xs text-muted-foreground">
                                                Agent: {agentMap.get(task.agentId)?.name || task.agentId}
                                            </div>
                                        ) : task.modelId ? (
                                            <div className="text-xs text-muted-foreground">Model: {task.modelId}</div>
                                        ) : (
                                            <div className="text-xs text-muted-foreground">Model: Auto-select</div>
                                        )}
                                        {task.lastError && (
                                            <div className="text-xs text-destructive">Last error: {task.lastError}</div>
                                        )}
                                        {task.lastOutput && (
                                            <details className="text-xs">
                                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                                    Show last output
                                                </summary>
                                                <div className="mt-2 p-2 bg-muted rounded text-xs whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                                                    {task.lastOutput}
                                                </div>
                                            </details>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
