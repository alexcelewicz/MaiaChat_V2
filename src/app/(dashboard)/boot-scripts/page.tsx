"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    BookOpen,
    Loader2,
    Play,
    RefreshCw,
    Rocket,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BootScript {
    id: string;
    name: string;
    description?: string | null;
    content: string;
    runOnServerStart?: boolean | null;
    runOnChannelStart?: boolean | null;
    runOnSchedule?: string | null;
    isEnabled?: boolean | null;
    priority?: number | null;
    lastRunAt?: string | null;
    lastStatus?: string | null;
    lastError?: string | null;
    lastOutput?: string | null;
    createdAt?: string | null;
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

const exampleScript = `# Morning Briefing

1. Check if today is a weekday
2. If so, summarize any important emails or messages received overnight
3. List any scheduled meetings for today
4. Report on any failed tasks or triggers from the past 24 hours
5. Provide a brief weather forecast for my location

Keep the summary concise and actionable.`;

export default function BootScriptsPage() {
    const [scripts, setScripts] = useState<BootScript[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [runningId, setRunningId] = useState<string | null>(null);
    const [form, setForm] = useState({
        name: "",
        description: "",
        content: "",
        runOnServerStart: true,
        runOnChannelStart: false,
        isEnabled: true,
        priority: 0,
    });

    const fetchScripts = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/boot-scripts", {
                credentials: "include",
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to load scripts");
            }
            setScripts(data.scripts || []);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load scripts");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchScripts();
    }, []);

    const handleCreate = async () => {
        if (!form.name.trim() || !form.content.trim()) {
            toast.error("Please enter a name and script content");
            return;
        }

        try {
            setIsCreating(true);
            const response = await fetch("/api/boot-scripts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name,
                    description: form.description || undefined,
                    content: form.content,
                    runOnServerStart: form.runOnServerStart,
                    runOnChannelStart: form.runOnChannelStart,
                    isEnabled: form.isEnabled,
                    priority: form.priority,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to create script");
            }

            toast.success("Boot script created");
            setForm({
                name: "",
                description: "",
                content: "",
                runOnServerStart: true,
                runOnChannelStart: false,
                isEnabled: true,
                priority: 0,
            });
            fetchScripts();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create script");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (scriptId: string) => {
        try {
            const response = await fetch(`/api/boot-scripts/${scriptId}`, {
                method: "DELETE",
                credentials: "include",
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to delete script");
            }
            toast.success("Script deleted");
            fetchScripts();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete script");
        }
    };

    const handleRun = async (scriptId: string) => {
        try {
            setRunningId(scriptId);
            const response = await fetch(`/api/boot-scripts/${scriptId}`, {
                method: "POST",
                credentials: "include",
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to run script");
            }

            if (data.success) {
                toast.success("Script executed successfully");
            } else {
                toast.error(data.error || "Script execution failed");
            }
            fetchScripts();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to run script");
        } finally {
            setRunningId(null);
        }
    };

    const loadExample = () => {
        setForm((prev) => ({
            ...prev,
            name: "Morning Briefing",
            content: exampleScript,
        }));
    };

    return (
        <div className="container max-w-6xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Boot Scripts</h1>
                    <p className="text-muted-foreground mt-1">
                        Scripts that run when the background agent starts
                    </p>
                </div>
                <Button variant="outline" size="icon" onClick={fetchScripts}>
                    <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Rocket className="h-5 w-5" />
                        New Boot Script
                    </CardTitle>
                    <CardDescription>
                        Create a script that runs automatically when the daemon starts
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Script Name</label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder="Morning Briefing"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Priority</label>
                            <Input
                                type="number"
                                value={form.priority}
                                onChange={(e) => setForm((prev) => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                                placeholder="0 (higher runs first)"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Description (optional)</label>
                        <Input
                            value={form.description}
                            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder="Daily startup tasks and briefing"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">Script Content (Markdown)</label>
                            <Button variant="ghost" size="sm" onClick={loadExample}>
                                <BookOpen className="h-4 w-4 mr-1" /> Load Example
                            </Button>
                        </div>
                        <Textarea
                            value={form.content}
                            onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                            placeholder="# Boot Instructions&#10;&#10;1. Check for overnight emergencies&#10;2. Summarize pending tasks&#10;3. Report any system issues"
                            rows={10}
                            className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                            Write instructions in markdown. The AI will follow these steps when the daemon starts.
                        </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Run on Server Start</label>
                            <div className="flex items-center gap-2 pt-1">
                                <Switch
                                    checked={form.runOnServerStart}
                                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, runOnServerStart: checked }))}
                                />
                                <span className="text-sm text-muted-foreground">
                                    {form.runOnServerStart ? "Yes" : "No"}
                                </span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Run on Channel Start</label>
                            <div className="flex items-center gap-2 pt-1">
                                <Switch
                                    checked={form.runOnChannelStart}
                                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, runOnChannelStart: checked }))}
                                />
                                <span className="text-sm text-muted-foreground">
                                    {form.runOnChannelStart ? "Yes" : "No"}
                                </span>
                            </div>
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
                        {isCreating ? "Creating..." : "Create Script"}
                    </Button>
                </CardContent>
            </Card>

            <div className="space-y-3">
                <h2 className="text-xl font-semibold">Existing Scripts</h2>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : scripts.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center text-muted-foreground">
                            No boot scripts yet.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {scripts.map((script) => (
                            <Card key={script.id}>
                                <CardHeader className="flex flex-row items-start justify-between pb-2">
                                    <div className="space-y-1">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Rocket className="h-4 w-4" />
                                            {script.name}
                                            {script.priority !== 0 && (
                                                <span className="text-xs text-muted-foreground">
                                                    (priority: {script.priority})
                                                </span>
                                            )}
                                        </CardTitle>
                                        {script.description && (
                                            <CardDescription className="text-xs">
                                                {script.description}
                                            </CardDescription>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={script.isEnabled ? "secondary" : "outline"}>
                                            {script.isEnabled ? "Enabled" : "Disabled"}
                                        </Badge>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRun(script.id)}
                                            disabled={runningId === script.id}
                                            title="Run now"
                                        >
                                            {runningId === script.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Play className="h-4 w-4" />
                                            )}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-destructive"
                                            onClick={() => handleDelete(script.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex flex-wrap gap-2">
                                        {script.runOnServerStart && <Badge variant="outline">Server Start</Badge>}
                                        {script.runOnChannelStart && <Badge variant="outline">Channel Start</Badge>}
                                    </div>

                                    <div className="p-3 bg-muted rounded-md">
                                        <pre className="text-xs whitespace-pre-wrap font-mono overflow-hidden max-h-32">
                                            {script.content.length > 500
                                                ? script.content.substring(0, 500) + "..."
                                                : script.content}
                                        </pre>
                                    </div>

                                    <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                                        <div>Last run: {formatDate(script.lastRunAt)}</div>
                                        <div>
                                            Status: {" "}
                                            <span className={cn(
                                                script.lastStatus === "success" && "text-green-600",
                                                script.lastStatus === "failed" && "text-red-600"
                                            )}>
                                                {script.lastStatus || "Never run"}
                                            </span>
                                        </div>
                                    </div>

                                    {script.lastError && (
                                        <div className="text-xs text-destructive">
                                            Last error: {script.lastError}
                                        </div>
                                    )}

                                    {script.lastOutput && (
                                        <details className="text-xs">
                                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                                Show last output
                                            </summary>
                                            <div className="mt-2 p-2 bg-muted rounded text-xs whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                                                {script.lastOutput}
                                            </div>
                                        </details>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
