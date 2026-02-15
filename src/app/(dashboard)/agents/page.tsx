"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Bot, Sparkles, MessageSquare, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AgentCard } from "@/components/agents/AgentCard";
import { AgentConfigForm } from "@/components/agents/AgentConfigForm";
import type { AgentConfig } from "@/types/agent";
import { PRESET_AGENTS } from "@/types/agent";
import Link from "next/link";

interface ApiAgent {
    id: string;
    name: string;
    role: string;
    provider: string;
    modelId: string;
    systemPrompt: string;
    config: Record<string, unknown>;
    isTemplate?: boolean;
    conversationId?: string;
    createdAt: string;
}

function AgentsPageContent() {
    const searchParams = useSearchParams();
    const conversationId = searchParams.get("conversationId");

    const [templates, setTemplates] = useState<AgentConfig[]>([]);
    const [conversationAgents, setConversationAgents] = useState<AgentConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [addingAgentId, setAddingAgentId] = useState<string | null>(null);

    const mapApiAgentToConfig = (agent: ApiAgent): AgentConfig => ({
        id: agent.id,
        name: agent.name,
        role: agent.role as AgentConfig["role"],
        provider: agent.provider as AgentConfig["provider"],
        modelId: agent.modelId,
        systemPrompt: agent.systemPrompt,
        description: (agent.config as Record<string, unknown>)?.description as string || "",
        temperature: (agent.config as Record<string, unknown>)?.temperature as number || 0.7,
        maxTokens: (agent.config as Record<string, unknown>)?.maxTokens as number || undefined,
        tools: (agent.config as Record<string, unknown>)?.tools as AgentConfig["tools"] || [],
        canSeeOtherAgents: (agent.config as Record<string, unknown>)?.canSeeOtherAgents as boolean ?? true,
        priority: (agent.config as Record<string, unknown>)?.priority as number || 50,
        isActive: (agent.config as Record<string, unknown>)?.isActive as boolean ?? true,
    });

    const fetchTemplates = useCallback(async () => {
        try {
            const response = await fetch("/api/agents?templates=true&includePresets=true");
            if (!response.ok) throw new Error("Failed to fetch templates");
            const data = await response.json();

            const formattedTemplates = (data.agents || []).map(mapApiAgentToConfig);
            setTemplates(formattedTemplates);
        } catch (error) {
            console.error("Fetch templates error:", error);
        }
    }, []);

    const fetchConversationAgents = useCallback(async () => {
        if (!conversationId) {
            setConversationAgents([]);
            return;
        }

        try {
            const response = await fetch(`/api/agents?conversationId=${conversationId}`);
            if (!response.ok) throw new Error("Failed to fetch conversation agents");
            const data = await response.json();

            const formattedAgents = (data.agents || []).map(mapApiAgentToConfig);
            setConversationAgents(formattedAgents);
        } catch (error) {
            console.error("Fetch conversation agents error:", error);
        }
    }, [conversationId]);

    useEffect(() => {
        const fetchAll = async () => {
            setIsLoading(true);
            await Promise.all([fetchTemplates(), fetchConversationAgents()]);
            setIsLoading(false);
        };
        fetchAll();
    }, [fetchTemplates, fetchConversationAgents]);

    const handleCreateTemplate = async (values: AgentConfig) => {
        try {
            setIsSaving(true);

            // Create as a template (no conversationId)
            const response = await fetch("/api/agents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...values,
                    isTemplate: true,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                toast.error(error.error || "Failed to create agent template");
                return;
            }

            toast.success("Agent template created");
            setIsDialogOpen(false);
            setEditingAgent(null);
            fetchTemplates();
        } catch (error) {
            console.error("Create template error:", error);
            toast.error("Failed to create agent template");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddToConversation = async (agentId: string) => {
        if (!conversationId) {
            toast.error("No conversation selected");
            return;
        }

        try {
            setAddingAgentId(agentId);

            const response = await fetch("/api/agents/add-to-conversation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    agentId,
                    conversationId,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                toast.error(error.error || "Failed to add agent to conversation");
                return;
            }

            const data = await response.json();
            if (data.message === "Agent already in conversation") {
                toast.info("Agent is already in this conversation");
            } else {
                toast.success("Agent added to conversation");
            }

            fetchConversationAgents();
        } catch (error) {
            console.error("Add to conversation error:", error);
            toast.error("Failed to add agent");
        } finally {
            setAddingAgentId(null);
        }
    };

    const handleEditAgent = (agent: AgentConfig) => {
        setEditingAgent(agent);
        setIsDialogOpen(true);
    };

    const handleUpdateAgent = async (values: AgentConfig) => {
        if (!editingAgent?.id) return;

        try {
            setIsSaving(true);
            const response = await fetch(`/api/agents/${editingAgent.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });

            if (!response.ok) throw new Error("Failed to update agent");

            toast.success("Agent updated");
            setIsDialogOpen(false);
            setEditingAgent(null);
            fetchTemplates();
            fetchConversationAgents();
        } catch (error) {
            console.error("Update agent error:", error);
            toast.error("Failed to update agent");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteAgent = async (agentId: string) => {
        try {
            const response = await fetch(`/api/agents/${agentId}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error("Failed to delete agent");

            toast.success("Agent deleted");
            fetchTemplates();
            fetchConversationAgents();
        } catch (error) {
            console.error("Delete agent error:", error);
            toast.error("Failed to delete agent");
        }
    };

    const handleToggleActive = async (agentId: string, isActive: boolean) => {
        try {
            const response = await fetch(`/api/agents/${agentId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive }),
            });

            if (!response.ok) throw new Error("Failed to update agent");

            fetchConversationAgents();
        } catch (error) {
            console.error("Toggle agent error:", error);
            toast.error("Failed to update agent");
        }
    };

    const handleDuplicateAsTemplate = (agent: AgentConfig) => {
        setEditingAgent({
            ...agent,
            id: undefined,
            name: `${agent.name} (Copy)`,
        });
        setIsDialogOpen(true);
    };

    // Convert preset agents to AgentConfig format
    const presetAgents: (AgentConfig & { isPreset: boolean })[] = Object.entries(PRESET_AGENTS).map(
        ([key, preset]) => ({
            ...preset,
            id: `preset-${key}`,
            isPreset: true,
        })
    );

    const isAgentInConversation = (agentName: string) => {
        return conversationAgents.some(a => a.name === agentName);
    };

    return (
        <div className="container max-w-6xl mx-auto py-8 px-4 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {conversationId && (
                        <Link href={`/chat/${conversationId}`}>
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                    )}
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            {conversationId ? "Select Agents" : "Agent Templates"}
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            {conversationId
                                ? "Choose agents to add to your conversation"
                                : "Create and manage reusable agent configurations"
                            }
                        </p>
                    </div>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => setEditingAgent(null)}>
                            <Plus className="mr-2 h-4 w-4" />
                            New Template
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>
                                {editingAgent?.id ? "Edit Agent" : "Create Agent Template"}
                            </DialogTitle>
                            <DialogDescription>
                                {editingAgent?.id
                                    ? "Update your agent's configuration."
                                    : "Create a reusable agent template that can be added to any conversation."
                                }
                            </DialogDescription>
                        </DialogHeader>
                        <AgentConfigForm
                            initialValues={editingAgent || undefined}
                            onSubmit={editingAgent?.id ? handleUpdateAgent : handleCreateTemplate}
                            onCancel={() => {
                                setIsDialogOpen(false);
                                setEditingAgent(null);
                            }}
                            isLoading={isSaving}
                        />
                    </DialogContent>
                </Dialog>
            </div>

            {/* Conversation Agents Section (only if viewing for a conversation) */}
            {conversationId && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <MessageSquare className="h-5 w-5" />
                            Agents in This Conversation
                        </CardTitle>
                        <CardDescription>
                            These agents will participate in your conversation.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : conversationAgents.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">
                                No agents added yet. Select from your templates or presets below.
                            </p>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {conversationAgents.map((agent) => (
                                    <AgentCard
                                        key={agent.id}
                                        agent={agent}
                                        onEdit={handleEditAgent}
                                        onDelete={handleDeleteAgent}
                                        onToggleActive={handleToggleActive}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Templates and Presets */}
            <Tabs defaultValue={conversationId ? "presets" : "my-templates"}>
                <TabsList>
                    <TabsTrigger value="my-templates">
                        <Bot className="mr-2 h-4 w-4" />
                        My Templates
                    </TabsTrigger>
                    <TabsTrigger value="presets">
                        <Sparkles className="mr-2 h-4 w-4" />
                        Preset Templates
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="my-templates" className="mt-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : templates.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                                <CardTitle className="text-xl mb-2">No Templates Yet</CardTitle>
                                <CardDescription className="mb-4 max-w-md">
                                    Create agent templates that you can reuse across conversations.
                                </CardDescription>
                                <Button onClick={() => setIsDialogOpen(true)}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create Template
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {templates.map((agent) => (
                                <AgentCard
                                    key={agent.id}
                                    agent={agent}
                                    onEdit={handleEditAgent}
                                    onDelete={handleDeleteAgent}
                                    onDuplicate={handleDuplicateAsTemplate}
                                    showAddButton={!!conversationId && !isAgentInConversation(agent.name)}
                                    onAdd={conversationId ? () => handleAddToConversation(agent.id!) : undefined}
                                    isAdding={addingAgentId === agent.id}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="presets" className="mt-6">
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle className="text-lg">Preset Agent Templates</CardTitle>
                            <CardDescription>
                                {conversationId
                                    ? "Click \"Add to Chat\" to use these agents in your conversation."
                                    : "Ready-to-use agent configurations. Save as template to customize."
                                }
                            </CardDescription>
                        </CardHeader>
                    </Card>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {presetAgents.map((agent) => (
                            <AgentCard
                                key={agent.id}
                                agent={agent}
                                onDuplicate={handleDuplicateAsTemplate}
                                showAddButton={!!conversationId && !isAgentInConversation(agent.name)}
                                onAdd={conversationId ? () => handleAddToConversation(agent.id!) : undefined}
                                isAdding={addingAgentId === agent.id}
                            />
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Multi-Agent Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Multi-Agent Orchestration</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>
                        <strong>Sequential Mode:</strong> Agents respond one after another,
                        each seeing previous responses.
                    </p>
                    <p>
                        <strong>Parallel Mode:</strong> All agents respond simultaneously
                        to the same input.
                    </p>
                    <p>
                        <strong>Hierarchical Mode:</strong> A coordinator agent delegates
                        tasks to specialist agents.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

export default function AgentsPage() {
    return (
        <Suspense fallback={<div className="container max-w-6xl mx-auto py-8 px-4"><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></div>}>
            <AgentsPageContent />
        </Suspense>
    );
}
