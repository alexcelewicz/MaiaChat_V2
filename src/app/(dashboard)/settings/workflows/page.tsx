"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
    Workflow,
    Plus,
    Loader2,
    Play,
    Pause,
    Trash2,
    Edit3,
    AlertCircle,
    CheckCircle2,
    Clock,
    Zap,
    GitBranch,
    MessageSquare,
    Wrench,
    ShieldCheck,
    ArrowRight,
    XCircle,
    RotateCcw,
    ChevronDown,
    ChevronRight,
    Copy,
    FileText,
    Search,
    Download,
} from "lucide-react";
import { toast } from "sonner";

// Types matching the backend
type StepType = "tool" | "llm" | "condition" | "approval" | "transform";

interface WorkflowStep {
    id: string;
    name: string;
    type: StepType;
    tool?: string;
    action?: string;
    args?: Record<string, unknown>;
    prompt?: string;
    model?: string;
    condition?: string;
    thenStep?: string;
    elseStep?: string;
    transform?: {
        input: string;
        output: string;
        expression: string;
    };
    approval?: {
        required: boolean;
        prompt: string;
        timeout?: number;
    };
    nextStep?: string;
}

interface WorkflowDefinitionContent {
    version: string;
    steps: WorkflowStep[];
    trigger?: {
        type: "manual" | "schedule" | "event";
        config?: Record<string, unknown>;
    };
    variables?: Record<string, unknown>;
}

interface WorkflowDefinition {
    id: string;
    name: string;
    description: string;
    definition: WorkflowDefinitionContent;
    status: "draft" | "active" | "paused" | "archived";
    isTemplate: boolean;
    tags: string[];
    stepCount?: number;
    createdAt: string;
    updatedAt: string;
}

interface WorkflowRun {
    id: string;
    workflowId: string;
    status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: string;
    currentStep?: string;
    completedSteps: string[];
    startedAt: string;
    completedAt?: string;
}

interface ApprovalRequest {
    runId: string;
    stepId: string;
    prompt: string;
    items?: unknown[];
    resumeToken: string;
    expiresAt?: string;
}

// Step type configuration
const STEP_TYPES: Record<StepType, { name: string; icon: React.ElementType; color: string; description: string }> = {
    tool: {
        name: "Tool",
        icon: Wrench,
        color: "bg-blue-500",
        description: "Execute a tool action",
    },
    llm: {
        name: "AI/LLM",
        icon: MessageSquare,
        color: "bg-purple-500",
        description: "Generate AI response",
    },
    condition: {
        name: "Condition",
        icon: GitBranch,
        color: "bg-amber-500",
        description: "Branch based on condition",
    },
    approval: {
        name: "Approval",
        icon: ShieldCheck,
        color: "bg-green-500",
        description: "Wait for human approval",
    },
    transform: {
        name: "Transform",
        icon: Zap,
        color: "bg-orange-500",
        description: "Transform data",
    },
};

// Status colors
const STATUS_COLORS: Record<string, string> = {
    pending: "bg-gray-500",
    running: "bg-blue-500",
    paused: "bg-amber-500",
    completed: "bg-green-500",
    failed: "bg-red-500",
    cancelled: "bg-gray-400",
};

// Available tools for tool steps
const AVAILABLE_TOOLS = [
    { id: "email", name: "Email", actions: ["search", "read", "send", "draft", "reply", "archive"] },
    { id: "web_search", name: "Web Search", actions: ["search"] },
    { id: "url_fetch", name: "URL Fetch", actions: ["fetch"] },
    { id: "calculator", name: "Calculator", actions: ["calculate"] },
    { id: "scheduled_task", name: "Scheduled Task", actions: ["create", "list", "cancel"] },
    { id: "channel_message", name: "Channel Message", actions: ["send"] },
    { id: "crm", name: "CRM", actions: ["search_contacts", "get_contact", "add_contact", "update_contact", "log_interaction", "get_timeline", "morning_briefing"] },
    { id: "image_generation", name: "Image Generation", actions: ["generate", "edit", "variation"] },
    { id: "hubspot", name: "HubSpot", actions: ["search_contacts", "get_contact", "create_contact", "list_deals", "get_deal"] },
    { id: "asana", name: "Asana", actions: ["list_projects", "list_tasks", "create_task", "update_task", "complete_task"] },
    { id: "google_drive", name: "Google Drive", actions: ["list", "search", "upload", "download", "share"] },
    { id: "twitter", name: "Twitter", actions: ["search", "get_tweet", "get_user", "get_timeline"] },
    { id: "http_request", name: "HTTP Request", actions: ["request"] },
];

// Fallback workflow templates for the "Create from Scratch" editor
const SCRATCH_TEMPLATES = [
    {
        id: "email_triage",
        name: "Email Triage",
        description: "Automatically categorize and summarize new emails",
        steps: [
            { id: "fetch", name: "Fetch Emails", type: "tool" as StepType, tool: "email", action: "search" },
            { id: "categorize", name: "Categorize", type: "llm" as StepType, prompt: "Categorize this email" },
            { id: "approve", name: "Approve Actions", type: "approval" as StepType },
        ],
    },
    {
        id: "daily_summary",
        name: "Daily Summary",
        description: "Generate a daily summary of activities",
        steps: [
            { id: "gather", name: "Gather Data", type: "tool" as StepType, tool: "email", action: "search" },
            { id: "summarize", name: "Summarize", type: "llm" as StepType, prompt: "Create a summary" },
        ],
    },
    {
        id: "web_research",
        name: "Web Research",
        description: "Research a topic and compile findings",
        steps: [
            { id: "search", name: "Search Web", type: "tool" as StepType, tool: "web_search", action: "search" },
            { id: "analyze", name: "Analyze Results", type: "llm" as StepType, prompt: "Analyze and summarize findings" },
        ],
    },
];

// Template gallery categories
const TEMPLATE_CATEGORIES = [
    { id: "all", label: "All" },
    { id: "life-os", label: "Life OS" },
    { id: "productivity", label: "Productivity" },
    { id: "sales", label: "Sales" },
    { id: "content", label: "Content" },
    { id: "crm", label: "CRM" },
    { id: "strategy", label: "Strategy" },
];

// Template item from the API
interface TemplateItem {
    id: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    requiredIntegrations: string[];
    requiredTools: string[];
    stepCount: number;
    triggerType: string;
}

export default function WorkflowsPage() {
    const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
    const [runs, setRuns] = useState<WorkflowRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [editingWorkflow, setEditingWorkflow] = useState<WorkflowDefinition | null>(null);
    const [showEditor, setShowEditor] = useState(false);
    const [expandedWorkflows, setExpandedWorkflows] = useState<Set<string>>(new Set());
    const [runningWorkflow, setRunningWorkflow] = useState<string | null>(null);
    const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);
    const [approvalComment, setApprovalComment] = useState("");
    const [resumingApproval, setResumingApproval] = useState(false);

    // Editor state
    const [editorName, setEditorName] = useState("");
    const [editorDescription, setEditorDescription] = useState("");
    const [editorTrigger, setEditorTrigger] = useState<"manual" | "schedule" | "event">("manual");
    const [editorSteps, setEditorSteps] = useState<WorkflowStep[]>([]);
    const [editorIsActive, setEditorIsActive] = useState(true);

    // Template gallery state
    const [templates, setTemplates] = useState<TemplateItem[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [templateSearch, setTemplateSearch] = useState("");
    const [installingTemplate, setInstallingTemplate] = useState<string | null>(null);

    // Fetch workflows and recent runs
    const fetchWorkflows = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/workflows");
            if (!response.ok) throw new Error("Failed to fetch workflows");
            const data = await response.json();
            setWorkflows(data.workflows || []);
            setRuns(data.recentRuns || []);
        } catch (error) {
            console.error("Fetch workflows error:", error);
            toast.error("Failed to load workflows");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWorkflows();
    }, [fetchWorkflows]);

    // Fetch templates for the gallery
    useEffect(() => {
        fetch("/api/workflows/templates")
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.templates) setTemplates(data.templates);
            })
            .catch(() => null)
            .finally(() => setLoadingTemplates(false));
    }, []);

    // Install a template as a workflow
    const installTemplate = async (templateId: string) => {
        setInstallingTemplate(templateId);
        try {
            const res = await fetch("/api/workflows/install", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ templateId }),
            });
            if (res.ok) {
                toast.success("Template installed as workflow");
                fetchWorkflows();
            } else {
                const data = await res.json();
                toast.error(data.error || "Failed to install template");
            }
        } catch {
            toast.error("Failed to install template");
        } finally {
            setInstallingTemplate(null);
        }
    };

    // Filter templates by category and search
    const filteredTemplates = templates.filter(t => {
        const matchesCategory = selectedCategory === "all" || t.category === selectedCategory;
        const matchesSearch = !templateSearch ||
            t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
            t.description.toLowerCase().includes(templateSearch.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    // Toggle workflow expansion
    const toggleExpanded = (workflowId: string) => {
        setExpandedWorkflows((prev) => {
            const next = new Set(prev);
            if (next.has(workflowId)) {
                next.delete(workflowId);
            } else {
                next.add(workflowId);
            }
            return next;
        });
    };

    // Open editor for new workflow
    const openNewEditor = (template?: typeof SCRATCH_TEMPLATES[0]) => {
        setEditingWorkflow(null);
        setEditorName(template?.name || "");
        setEditorDescription(template?.description || "");
        setEditorTrigger("manual");
        setEditorSteps(template?.steps || []);
        setEditorIsActive(true);
        setShowEditor(true);
    };

    // Open editor for existing workflow
    const openEditEditor = (workflow: WorkflowDefinition) => {
        setEditingWorkflow(workflow);
        setEditorName(workflow.name);
        setEditorDescription(workflow.description || "");
        setEditorTrigger(workflow.definition?.trigger?.type || "manual");
        setEditorSteps(workflow.definition?.steps || []);
        setEditorIsActive(workflow.status === "active");
        setShowEditor(true);
    };

    // Add a new step
    const addStep = (type: StepType) => {
        const newStep: WorkflowStep = {
            id: `step_${Date.now()}`,
            name: `New ${STEP_TYPES[type].name} Step`,
            type,
        };

        if (type === "approval") {
            newStep.approval = {
                required: true,
                prompt: "Do you approve this action?",
            };
        }

        if (type === "transform") {
            newStep.transform = {
                input: "$input",
                output: "result",
                expression: "JSON.stringify",
            };
        }

        setEditorSteps([...editorSteps, newStep]);
    };

    // Update a step
    const updateStep = (index: number, updates: Partial<WorkflowStep>) => {
        setEditorSteps((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], ...updates };
            return next;
        });
    };

    // Remove a step
    const removeStep = (index: number) => {
        setEditorSteps((prev) => prev.filter((_, i) => i !== index));
    };

    // Save workflow
    const saveWorkflow = async () => {
        if (!editorName.trim()) {
            toast.error("Please enter a workflow name");
            return;
        }

        if (editorSteps.length === 0) {
            toast.error("Please add at least one step");
            return;
        }

        try {
            setCreating(true);

            // Map UI isActive to API status field
            const status = editorIsActive ? "active" : "draft";

            const workflowData = {
                name: editorName,
                description: editorDescription,
                definition: {
                    version: "1.0.0",
                    steps: editorSteps,
                    trigger: { type: editorTrigger },
                },
                status,
                isTemplate: false,
                tags: [],
            };

            const url = editingWorkflow
                ? `/api/workflows/${editingWorkflow.id}`
                : "/api/workflows";

            const response = await fetch(url, {
                method: editingWorkflow ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(workflowData),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to save workflow");
            }

            toast.success(editingWorkflow ? "Workflow updated" : "Workflow created");
            setShowEditor(false);
            fetchWorkflows();
        } catch (error) {
            console.error("Save workflow error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to save workflow");
        } finally {
            setCreating(false);
        }
    };

    // Delete workflow
    const deleteWorkflow = async (workflowId: string) => {
        try {
            const response = await fetch(`/api/workflows/${workflowId}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error("Failed to delete workflow");

            setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
            toast.success("Workflow deleted");
        } catch (error) {
            console.error("Delete workflow error:", error);
            toast.error("Failed to delete workflow");
        }
    };

    // Run workflow
    const runWorkflow = async (workflowId: string, input?: Record<string, unknown>) => {
        try {
            setRunningWorkflow(workflowId);

            const response = await fetch(`/api/workflows/${workflowId}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to run workflow");
            }

            const result = await response.json();
            if (result.approval) {
                setApprovalRequest(result.approval as ApprovalRequest);
                setApprovalComment("");
                toast.success("Workflow paused for approval");
            } else {
                toast.success("Workflow started");
            }

            // Refresh to get the new run
            fetchWorkflows();

            return result;
        } catch (error) {
            console.error("Run workflow error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to run workflow");
        } finally {
            setRunningWorkflow(null);
        }
    };

    const resumeWorkflow = async (approved: boolean) => {
        if (!approvalRequest) return;

        try {
            setResumingApproval(true);
            const response = await fetch("/api/workflows/resume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resumeToken: approvalRequest.resumeToken,
                    approved,
                    comment: approvalComment || undefined,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to resume workflow");
            }

            const result = await response.json();

            if (result.approval) {
                setApprovalRequest(result.approval as ApprovalRequest);
                setApprovalComment("");
                toast.success("Workflow paused for approval");
            } else {
                setApprovalRequest(null);
                setApprovalComment("");
                toast.success(approved ? "Workflow resumed" : "Workflow cancelled");
            }

            fetchWorkflows();
        } catch (error) {
            console.error("Resume workflow error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to resume workflow");
        } finally {
            setResumingApproval(false);
        }
    };

    // Toggle workflow active status
    const toggleWorkflowActive = async (workflow: WorkflowDefinition) => {
        const isCurrentlyActive = workflow.status === "active";
        const newStatus = isCurrentlyActive ? "draft" : "active";

        try {
            const response = await fetch(`/api/workflows/${workflow.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });

            if (!response.ok) throw new Error("Failed to update workflow");

            setWorkflows((prev) =>
                prev.map((w) =>
                    w.id === workflow.id ? { ...w, status: newStatus } : w
                )
            );

            toast.success(isCurrentlyActive ? "Workflow disabled" : "Workflow enabled");
        } catch (error) {
            console.error("Toggle workflow error:", error);
            toast.error("Failed to update workflow");
        }
    };

    // Get runs for a specific workflow
    const getWorkflowRuns = (workflowId: string) => {
        return runs.filter((r) => r.workflowId === workflowId).slice(0, 5);
    };

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4 space-y-8">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
                    <p className="text-muted-foreground mt-1">
                        Create automated pipelines with approval gates
                    </p>
                </div>
                <Button onClick={() => openNewEditor()} className="gap-2">
                    <Plus className="h-4 w-4" />
                    New Workflow
                </Button>
            </div>

            {/* Template Gallery */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Template Gallery
                    </CardTitle>
                    <CardDescription>
                        Browse and install pre-built workflow templates
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Category Filter Tabs */}
                    <div className="flex flex-wrap gap-2">
                        {TEMPLATE_CATEGORIES.map((cat) => (
                            <Button
                                key={cat.id}
                                variant={selectedCategory === cat.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSelectedCategory(cat.id)}
                            >
                                {cat.label}
                            </Button>
                        ))}
                    </div>

                    {/* Search Bar */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search templates..."
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>

                    {/* Template Cards */}
                    {loadingTemplates ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-sm text-muted-foreground">Loading templates...</span>
                        </div>
                    ) : filteredTemplates.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No templates found.</p>
                            <p className="text-sm">
                                {templates.length === 0
                                    ? "Templates will appear here once configured."
                                    : "Try adjusting your search or category filter."}
                            </p>
                        </div>
                    ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredTemplates.map((template) => (
                                <div
                                    key={template.id}
                                    className="flex flex-col gap-3 p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors"
                                >
                                    <div className="flex-1 space-y-2">
                                        <div className="font-medium">{template.name}</div>
                                        <p className="text-sm text-muted-foreground line-clamp-2">
                                            {template.description}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            <Badge variant="secondary" className="text-xs">
                                                {TEMPLATE_CATEGORIES.find(c => c.id === template.category)?.label || template.category}
                                            </Badge>
                                            <Badge variant="outline" className="text-xs">
                                                {template.stepCount} {template.stepCount === 1 ? "step" : "steps"}
                                            </Badge>
                                            <Badge variant="outline" className="text-xs capitalize">
                                                {template.triggerType}
                                            </Badge>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        className="w-full gap-2"
                                        onClick={() => installTemplate(template.id)}
                                        disabled={installingTemplate === template.id}
                                    >
                                        {installingTemplate === template.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Download className="h-4 w-4" />
                                        )}
                                        Install
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Your Workflows */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Workflow className="h-5 w-5" />
                        Your Workflows
                    </CardTitle>
                    <CardDescription>
                        Manage your automated workflows
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : workflows.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No workflows created yet.</p>
                            <p className="text-sm">Create your first workflow to get started.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {workflows.map((workflow) => {
                                const isExpanded = expandedWorkflows.has(workflow.id);
                                const workflowRuns = getWorkflowRuns(workflow.id);

                                return (
                                    <div
                                        key={workflow.id}
                                        className="rounded-lg border bg-card overflow-hidden"
                                    >
                                        {/* Workflow Header */}
                                        <div className="flex items-center justify-between p-4">
                                            <button
                                                onClick={() => toggleExpanded(workflow.id)}
                                                className="flex items-center gap-3 flex-1 text-left"
                                            >
                                                {isExpanded ? (
                                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                )}
                                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white">
                                                    <Workflow className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <div className="font-medium flex items-center gap-2">
                                                        {workflow.name}
                                                        {workflow.status === "active" ? (
                                                            <Badge variant="outline" className="text-green-600 text-xs">
                                                                Active
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="secondary" className="text-xs">
                                                                {workflow.status === "draft" ? "Draft" : workflow.status}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {workflow.stepCount || workflow.definition?.steps?.length || 0} steps · {workflow.definition?.trigger?.type || "manual"} trigger
                                                    </div>
                                                </div>
                                            </button>

                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={workflow.status === "active"}
                                                    onCheckedChange={() => toggleWorkflowActive(workflow)}
                                                />
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => runWorkflow(workflow.id)}
                                                    disabled={runningWorkflow === workflow.id || workflow.status !== "active"}
                                                >
                                                    {runningWorkflow === workflow.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Play className="h-4 w-4" />
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => openEditEditor(workflow)}
                                                >
                                                    <Edit3 className="h-4 w-4" />
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="text-destructive">
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Are you sure you want to delete &quot;{workflow.name}&quot;? This action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() => deleteWorkflow(workflow.id)}
                                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                            >
                                                                Delete
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </div>

                                        {/* Expanded Content */}
                                        {isExpanded && (
                                            <div className="border-t p-4 space-y-4 bg-muted/30">
                                                {/* Description */}
                                                {workflow.description && (
                                                    <p className="text-sm text-muted-foreground">
                                                        {workflow.description}
                                                    </p>
                                                )}

                                                {/* Steps Visualization */}
                                                <div className="space-y-2">
                                                    <h4 className="text-sm font-medium">Steps</h4>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {(workflow.definition?.steps || []).map((step, i, arr) => {
                                                            const StepIcon = STEP_TYPES[step.type]?.icon || Wrench;
                                                            return (
                                                                <div key={step.id} className="flex items-center">
                                                                    <div
                                                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${STEP_TYPES[step.type]?.color || "bg-gray-500"} text-white text-sm`}
                                                                    >
                                                                        <StepIcon className="h-4 w-4" />
                                                                        {step.name}
                                                                    </div>
                                                                    {i < arr.length - 1 && (
                                                                        <ArrowRight className="h-4 w-4 mx-2 text-muted-foreground" />
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Recent Runs */}
                                                {workflowRuns.length > 0 && (
                                                    <div className="space-y-2">
                                                        <h4 className="text-sm font-medium">Recent Runs</h4>
                                                        <div className="space-y-1">
                                                            {workflowRuns.map((run) => (
                                                                <div
                                                                    key={run.id}
                                                                    className="flex items-center justify-between p-2 rounded bg-card border text-sm"
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <div
                                                                            className={`w-2 h-2 rounded-full ${STATUS_COLORS[run.status]}`}
                                                                        />
                                                                        <span className="capitalize">{run.status}</span>
                                                                        {run.currentStep && run.status === "running" && (
                                                                            <span className="text-muted-foreground">
                                                                                - {run.currentStep}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-muted-foreground">
                                                                        <Clock className="h-3 w-3" />
                                                                        {new Date(run.startedAt).toLocaleString()}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Workflow Editor Dialog */}
            <Dialog open={showEditor} onOpenChange={setShowEditor}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingWorkflow ? "Edit Workflow" : "Create New Workflow"}
                        </DialogTitle>
                        <DialogDescription>
                            Define the steps and logic for your automated workflow
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        {/* Basic Info */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="workflow-name">Name</Label>
                                <Input
                                    id="workflow-name"
                                    placeholder="My Workflow"
                                    value={editorName}
                                    onChange={(e) => setEditorName(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="workflow-description">Description</Label>
                                <Textarea
                                    id="workflow-description"
                                    placeholder="What does this workflow do?"
                                    value={editorDescription}
                                    onChange={(e) => setEditorDescription(e.target.value)}
                                    rows={2}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Trigger</Label>
                                    <Select
                                        value={editorTrigger}
                                        onValueChange={(v) => setEditorTrigger(v as typeof editorTrigger)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="manual">Manual</SelectItem>
                                            <SelectItem value="schedule">Schedule</SelectItem>
                                            <SelectItem value="event">Event</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Status</Label>
                                    <div className="flex items-center gap-2 h-9 px-3 border rounded-md">
                                        <Switch
                                            checked={editorIsActive}
                                            onCheckedChange={setEditorIsActive}
                                        />
                                        <span className="text-sm">
                                            {editorIsActive ? "Active" : "Disabled"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Steps Editor */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label>Steps</Label>
                                <div className="flex gap-1">
                                    {Object.entries(STEP_TYPES).map(([type, config]) => {
                                        const Icon = config.icon;
                                        return (
                                            <Button
                                                key={type}
                                                variant="outline"
                                                size="sm"
                                                onClick={() => addStep(type as StepType)}
                                                className="gap-1 text-xs"
                                            >
                                                <Icon className="h-3 w-3" />
                                                {config.name}
                                            </Button>
                                        );
                                    })}
                                </div>
                            </div>

                            {editorSteps.length === 0 ? (
                                <div className="text-center py-8 border-2 border-dashed rounded-lg text-muted-foreground">
                                    <p>No steps added yet.</p>
                                    <p className="text-sm">Click a step type above to add it.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {editorSteps.map((step, index) => {
                                        const StepIcon = STEP_TYPES[step.type].icon;
                                        return (
                                            <div
                                                key={step.id}
                                                className="p-4 rounded-lg border bg-card space-y-3"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className={`w-8 h-8 rounded ${STEP_TYPES[step.type].color} flex items-center justify-center text-white`}
                                                        >
                                                            <StepIcon className="h-4 w-4" />
                                                        </div>
                                                        <Input
                                                            value={step.name}
                                                            onChange={(e) =>
                                                                updateStep(index, { name: e.target.value })
                                                            }
                                                            className="h-8 w-48"
                                                        />
                                                        <Badge variant="secondary" className="text-xs">
                                                            Step {index + 1}
                                                        </Badge>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => removeStep(index)}
                                                        className="h-8 w-8 text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>

                                                {/* Step-specific configuration */}
                                                {step.type === "tool" && (
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <Label className="text-xs">Tool</Label>
                                                            <Select
                                                                value={step.tool || ""}
                                                                onValueChange={(v) =>
                                                                    updateStep(index, { tool: v, action: undefined })
                                                                }
                                                            >
                                                                <SelectTrigger className="h-8">
                                                                    <SelectValue placeholder="Select tool" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {AVAILABLE_TOOLS.map((tool) => (
                                                                        <SelectItem key={tool.id} value={tool.id}>
                                                                            {tool.name}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs">Action</Label>
                                                            <Select
                                                                value={step.action || ""}
                                                                onValueChange={(v) =>
                                                                    updateStep(index, { action: v })
                                                                }
                                                                disabled={!step.tool}
                                                            >
                                                                <SelectTrigger className="h-8">
                                                                    <SelectValue placeholder="Select action" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {AVAILABLE_TOOLS.find(
                                                                        (t) => t.id === step.tool
                                                                    )?.actions.map((action) => (
                                                                        <SelectItem key={action} value={action}>
                                                                            {action}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                )}

                                                {step.type === "llm" && (
                                                    <div className="space-y-1">
                                                        <Label className="text-xs">Prompt</Label>
                                                        <Textarea
                                                            value={step.prompt || ""}
                                                            onChange={(e) =>
                                                                updateStep(index, { prompt: e.target.value })
                                                            }
                                                            placeholder="Enter the AI prompt..."
                                                            rows={2}
                                                            className="text-sm"
                                                        />
                                                    </div>
                                                )}

                                                {step.type === "condition" && (
                                                    <div className="space-y-1">
                                                        <Label className="text-xs">Condition Expression</Label>
                                                        <Input
                                                            value={step.condition || ""}
                                                            onChange={(e) =>
                                                                updateStep(index, { condition: e.target.value })
                                                            }
                                                            placeholder="e.g., $input.count > 5"
                                                            className="h-8 font-mono text-sm"
                                                        />
                                                    </div>
                                                )}

                                                {step.type === "approval" && (
                                                    <div className="space-y-1">
                                                        <Label className="text-xs">Approval Prompt</Label>
                                                        <Input
                                                            value={step.approval?.prompt || ""}
                                                            onChange={(e) =>
                                                                updateStep(index, {
                                                                    approval: {
                                                                        ...step.approval,
                                                                        required: true,
                                                                        prompt: e.target.value,
                                                                    },
                                                                })
                                                            }
                                                            placeholder="What should the user approve?"
                                                            className="h-8"
                                                        />
                                                    </div>
                                                )}

                                                {step.type === "transform" && (
                                                    <div className="grid grid-cols-3 gap-3">
                                                        <div className="space-y-1">
                                                            <Label className="text-xs">Input</Label>
                                                            <Input
                                                                value={step.transform?.input || ""}
                                                                onChange={(e) =>
                                                                    updateStep(index, {
                                                                        transform: {
                                                                            input: e.target.value,
                                                                            output: step.transform?.output || "",
                                                                            expression: step.transform?.expression || "",
                                                                        },
                                                                    })
                                                                }
                                                                placeholder="$input"
                                                                className="h-8"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs">Output Var</Label>
                                                            <Input
                                                                value={step.transform?.output || ""}
                                                                onChange={(e) =>
                                                                    updateStep(index, {
                                                                        transform: {
                                                                            input: step.transform?.input || "",
                                                                            output: e.target.value,
                                                                            expression: step.transform?.expression || "",
                                                                        },
                                                                    })
                                                                }
                                                                placeholder="result"
                                                                className="h-8"
                                                            />
                                                        </div>
                                                        <div className="space-y-1 col-span-3">
                                                            <Label className="text-xs">Expression</Label>
                                                            <Textarea
                                                                value={step.transform?.expression || ""}
                                                                onChange={(e) =>
                                                                    updateStep(index, {
                                                                        transform: {
                                                                            input: step.transform?.input || "",
                                                                            output: step.transform?.output || "",
                                                                            expression: e.target.value,
                                                                        },
                                                                    })
                                                                }
                                                                placeholder="JSON.stringify"
                                                                rows={2}
                                                                className="font-mono text-sm"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditor(false)}>
                            Cancel
                        </Button>
                        <Button onClick={saveWorkflow} disabled={creating}>
                            {creating ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            {editingWorkflow ? "Update Workflow" : "Create Workflow"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Approval Dialog */}
            <Dialog
                open={Boolean(approvalRequest)}
                onOpenChange={(open) => {
                    if (!open) {
                        setApprovalRequest(null);
                        setApprovalComment("");
                    }
                }}
            >
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Approval Required</DialogTitle>
                        <DialogDescription>
                            This workflow is paused and needs your decision.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Request</Label>
                            <div className="rounded-md border p-3 text-sm whitespace-pre-wrap">
                                {approvalRequest?.prompt}
                            </div>
                        </div>

                        {approvalRequest?.items && approvalRequest.items.length > 0 ? (
                            <div className="space-y-2">
                                <Label>Items</Label>
                                <div className="rounded-md border p-3 text-xs font-mono whitespace-pre-wrap">
                                    {JSON.stringify(approvalRequest.items, null, 2)}
                                </div>
                            </div>
                        ) : null}

                        <div className="space-y-2">
                            <Label>Comment (optional)</Label>
                            <Textarea
                                value={approvalComment}
                                onChange={(e) => setApprovalComment(e.target.value)}
                                rows={3}
                                placeholder="Add a note for this approval"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => resumeWorkflow(false)}
                            disabled={resumingApproval}
                        >
                            Reject
                        </Button>
                        <Button
                            onClick={() => resumeWorkflow(true)}
                            disabled={resumingApproval}
                        >
                            Approve
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">About Workflows</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>
                        • Workflows are deterministic pipelines that execute steps in sequence
                    </p>
                    <p>
                        • Approval steps pause execution until you approve or reject
                    </p>
                    <p>
                        • Use variables like $input and $stepId to pass data between steps
                    </p>
                    <p>
                        • Workflows can be triggered manually, on schedule, or by events
                    </p>
                    <p>
                        • All workflow runs are logged for debugging and auditing
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
