"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Zap, Loader2, Plus, Trash2, AlertCircle, Edit2 } from "lucide-react";
import { toast } from "sonner";

interface AutoReplyRule {
    id: string;
    name: string;
    triggerType: string;
    triggerPattern: string | null;
    actionType: string;
    actionConfig: { replyTemplate?: string } | null;
    priority: number;
    isEnabled: boolean;
    createdAt: string;
}

const TRIGGER_TYPES = [
    { value: "all", label: "All messages", description: "Trigger on every incoming message" },
    { value: "keyword", label: "Keyword", description: "Trigger when message contains specific words" },
    { value: "regex", label: "Regex pattern", description: "Trigger on regex match" },
    { value: "sender", label: "Specific sender", description: "Trigger from specific users" },
];

const ACTION_TYPES = [
    { value: "reply", label: "Send reply", description: "Reply with a template message" },
    { value: "agent", label: "Use AI agent", description: "Let AI handle the response" },
];

export default function AutoReplyPage() {
    const [rules, setRules] = useState<AutoReplyRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);

    // Form state
    const [form, setForm] = useState({
        name: "",
        triggerType: "keyword",
        triggerPattern: "",
        actionType: "reply",
        replyTemplate: "",
        priority: 0,
    });

    useEffect(() => {
        fetchRules();
    }, []);

    const fetchRules = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/auto-reply");
            if (!response.ok) throw new Error("Failed to fetch rules");
            const data = await response.json();
            setRules(data.rules || []);
        } catch (error) {
            console.error("Fetch rules error:", error);
            toast.error("Failed to load auto-reply rules");
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setForm({
            name: "",
            triggerType: "keyword",
            triggerPattern: "",
            actionType: "reply",
            replyTemplate: "",
            priority: 0,
        });
        setEditingRule(null);
    };

    const handleOpenDialog = (rule?: AutoReplyRule) => {
        if (rule) {
            setEditingRule(rule);
            setForm({
                name: rule.name,
                triggerType: rule.triggerType,
                triggerPattern: rule.triggerPattern || "",
                actionType: rule.actionType,
                replyTemplate: rule.actionConfig?.replyTemplate || "",
                priority: rule.priority,
            });
        } else {
            resetForm();
        }
        setDialogOpen(true);
    };

    const handleSaveRule = async () => {
        if (!form.name.trim()) {
            toast.error("Rule name is required");
            return;
        }

        if (form.actionType === "reply" && !form.replyTemplate.trim()) {
            toast.error("Reply template is required");
            return;
        }

        try {
            setSaving(true);

            const payload = {
                name: form.name.trim(),
                triggerType: form.triggerType,
                triggerPattern: form.triggerPattern.trim() || null,
                actionType: form.actionType,
                actionConfig: form.actionType === "reply" ? { replyTemplate: form.replyTemplate } : null,
                priority: form.priority,
            };

            let response;
            if (editingRule) {
                response = await fetch(`/api/auto-reply/${editingRule.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                response = await fetch("/api/auto-reply", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }

            if (!response.ok) throw new Error("Failed to save rule");

            const data = await response.json();

            if (editingRule) {
                setRules((prev) =>
                    prev.map((r) => (r.id === editingRule.id ? data.rule : r))
                );
                toast.success("Rule updated");
            } else {
                setRules((prev) => [data.rule, ...prev]);
                toast.success("Rule created");
            }

            setDialogOpen(false);
            resetForm();
        } catch (error) {
            console.error("Save rule error:", error);
            toast.error("Failed to save rule");
        } finally {
            setSaving(false);
        }
    };

    const handleToggleRule = async (id: string, isEnabled: boolean) => {
        try {
            const response = await fetch(`/api/auto-reply/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isEnabled }),
            });

            if (!response.ok) throw new Error("Failed to update rule");

            setRules((prev) =>
                prev.map((r) => (r.id === id ? { ...r, isEnabled } : r))
            );
        } catch (error) {
            console.error("Toggle error:", error);
            toast.error("Failed to update rule");
        }
    };

    const handleDeleteRule = async (id: string) => {
        try {
            const response = await fetch(`/api/auto-reply/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error("Failed to delete rule");

            setRules((prev) => prev.filter((r) => r.id !== id));
            toast.success("Rule deleted");
        } catch (error) {
            console.error("Delete error:", error);
            toast.error("Failed to delete rule");
        }
    };

    const getTriggerLabel = (type: string) => {
        return TRIGGER_TYPES.find((t) => t.value === type)?.label || type;
    };

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Auto-Reply Rules</h1>
                    <p className="text-muted-foreground mt-1">
                        Create rules that automatically respond to incoming messages
                    </p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => handleOpenDialog()}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Rule
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>
                                {editingRule ? "Edit Rule" : "Create Auto-Reply Rule"}
                            </DialogTitle>
                            <DialogDescription>
                                Configure when and how to automatically respond to messages.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Rule Name</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g., Welcome Message"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="triggerType">Trigger Type</Label>
                                <Select
                                    value={form.triggerType}
                                    onValueChange={(value) => setForm({ ...form, triggerType: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TRIGGER_TYPES.map((type) => (
                                            <SelectItem key={type.value} value={type.value}>
                                                <div>
                                                    <div>{type.label}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {type.description}
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {form.triggerType !== "all" && (
                                <div className="grid gap-2">
                                    <Label htmlFor="pattern">
                                        {form.triggerType === "keyword"
                                            ? "Keywords (comma-separated)"
                                            : form.triggerType === "regex"
                                            ? "Regex Pattern"
                                            : "Sender IDs (comma-separated)"}
                                    </Label>
                                    <Input
                                        id="pattern"
                                        placeholder={
                                            form.triggerType === "keyword"
                                                ? "hello, hi, hey"
                                                : form.triggerType === "regex"
                                                ? "^(hello|hi).*"
                                                : "user123, user456"
                                        }
                                        value={form.triggerPattern}
                                        onChange={(e) =>
                                            setForm({ ...form, triggerPattern: e.target.value })
                                        }
                                    />
                                </div>
                            )}

                            <div className="grid gap-2">
                                <Label htmlFor="actionType">Action</Label>
                                <Select
                                    value={form.actionType}
                                    onValueChange={(value) => setForm({ ...form, actionType: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ACTION_TYPES.map((type) => (
                                            <SelectItem key={type.value} value={type.value}>
                                                <div>
                                                    <div>{type.label}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {type.description}
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {form.actionType === "reply" && (
                                <div className="grid gap-2">
                                    <Label htmlFor="template">Reply Template</Label>
                                    <Textarea
                                        id="template"
                                        placeholder="Hi! Thanks for reaching out. I'll get back to you soon."
                                        value={form.replyTemplate}
                                        onChange={(e) =>
                                            setForm({ ...form, replyTemplate: e.target.value })
                                        }
                                        rows={3}
                                    />
                                </div>
                            )}

                            <div className="grid gap-2">
                                <Label htmlFor="priority">Priority (higher = first)</Label>
                                <Input
                                    id="priority"
                                    type="number"
                                    value={form.priority}
                                    onChange={(e) =>
                                        setForm({ ...form, priority: parseInt(e.target.value) || 0 })
                                    }
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleSaveRule} disabled={saving}>
                                {saving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Saving...
                                    </>
                                ) : editingRule ? (
                                    "Update Rule"
                                ) : (
                                    "Create Rule"
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Rules List */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        Your Rules
                    </CardTitle>
                    <CardDescription>
                        Rules are evaluated in order of priority (highest first)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : rules.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No auto-reply rules yet.</p>
                            <p className="text-sm">Create a rule to start automating responses.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {rules.map((rule) => (
                                <div
                                    key={rule.id}
                                    className="flex items-center justify-between p-4 rounded-lg border bg-muted/30"
                                >
                                    <div className="flex-1">
                                        <div className="font-medium flex items-center gap-2">
                                            {rule.name}
                                            <span className="text-xs text-muted-foreground">
                                                Priority: {rule.priority}
                                            </span>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {getTriggerLabel(rule.triggerType)}
                                            {rule.triggerPattern && (
                                                <span className="font-mono ml-1">
                                                    &quot;{rule.triggerPattern}&quot;
                                                </span>
                                            )}
                                        </div>
                                        {rule.actionConfig?.replyTemplate && (
                                            <div className="text-sm text-muted-foreground mt-1 truncate max-w-md">
                                                → {rule.actionConfig.replyTemplate}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Switch
                                            checked={rule.isEnabled}
                                            onCheckedChange={(checked) =>
                                                handleToggleRule(rule.id, checked)
                                            }
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleOpenDialog(rule)}
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete Rule</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Are you sure you want to delete &quot;{rule.name}&quot;? This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDeleteRule(rule.id)}
                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                    >
                                                        Delete
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">About Auto-Reply</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>• Rules are evaluated in order of priority (highest first)</p>
                    <p>• Only the first matching rule will be triggered</p>
                    <p>• Keyword triggers match words anywhere in the message</p>
                    <p>• Use &quot;All messages&quot; trigger for a catch-all response</p>
                    <p>• AI agent action uses your default AI model to generate responses</p>
                </CardContent>
            </Card>
        </div>
    );
}
