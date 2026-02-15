"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Bot, Users, Loader2, Sparkles, Check, Workflow, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AgentConfig, OrchestrationMode } from "@/types/agent";
import { PRESET_AGENTS } from "@/types/agent";

interface AgentSelectorProps {
    conversationId: string | null;
    onAgentsChanged?: (agents: AgentConfig[], mode: OrchestrationMode, maxRounds: number, synthesizerAgentId?: string) => void;
    onConversationCreated?: (id: string) => void;
}

const ORCHESTRATION_MODES: { value: OrchestrationMode; label: string; description: string }[] = [
    { value: "sequential", label: "Sequential", description: "Agents respond one after another" },
    { value: "parallel", label: "Parallel", description: "All agents respond simultaneously" },
    { value: "hierarchical", label: "Hierarchical", description: "Coordinator delegates to specialists" },
    { value: "consensus", label: "Consensus", description: "Agents discuss, then synthesize" },
    { value: "auto", label: "Auto", description: "System chooses the best mode" },
];

interface ApiAgent {
    id: string;
    name: string;
    role: string;
    provider: string;
    modelId: string;
    systemPrompt?: string;
    config?: Record<string, unknown>;
    isTemplate?: boolean;
    conversationId?: string;
}

export function AgentSelector({ conversationId, onAgentsChanged, onConversationCreated }: AgentSelectorProps) {
    const [open, setOpen] = useState(false);
    const [localConversationId, setLocalConversationId] = useState<string | null>(conversationId);
    const [templates, setTemplates] = useState<AgentConfig[]>([]);
    const [conversationAgents, setConversationAgents] = useState<AgentConfig[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [addingAgents, setAddingAgents] = useState<Set<string>>(new Set());
    const [isCreatingConversation, setIsCreatingConversation] = useState(false);
    const [orchestrationMode, setOrchestrationMode] = useState<OrchestrationMode>("sequential");
    const [maxRounds, setMaxRounds] = useState(3);
    const [synthesizerAgentId, setSynthesizerAgentId] = useState<string | undefined>(undefined);

    // Notify parent when agents, mode, rounds, or synthesizer changes
    const notifyChange = useCallback((agents: AgentConfig[], mode: OrchestrationMode, rounds: number, synthesizerId?: string) => {
        onAgentsChanged?.(agents, mode, rounds, synthesizerId);
    }, [onAgentsChanged]);

    // Handle orchestration mode change
    const handleModeChange = (mode: OrchestrationMode) => {
        setOrchestrationMode(mode);
        notifyChange(conversationAgents, mode, maxRounds, synthesizerAgentId);
    };

    // Handle max rounds change
    const handleRoundsChange = (rounds: number) => {
        setMaxRounds(rounds);
        notifyChange(conversationAgents, orchestrationMode, rounds, synthesizerAgentId);
    };

    // Handle synthesizer agent change
    const handleSynthesizerChange = (agentId: string) => {
        const newSynthesizerId = agentId === "auto" ? undefined : agentId;
        setSynthesizerAgentId(newSynthesizerId);
        notifyChange(conversationAgents, orchestrationMode, maxRounds, newSynthesizerId);
    };

    // Move agent up in the response order
    const moveAgentUp = (index: number) => {
        if (index <= 0) return;
        const newAgents = [...conversationAgents];
        [newAgents[index - 1], newAgents[index]] = [newAgents[index], newAgents[index - 1]];
        setConversationAgents(newAgents);
        notifyChange(newAgents, orchestrationMode, maxRounds, synthesizerAgentId);
    };

    // Move agent down in the response order
    const moveAgentDown = (index: number) => {
        if (index >= conversationAgents.length - 1) return;
        const newAgents = [...conversationAgents];
        [newAgents[index], newAgents[index + 1]] = [newAgents[index + 1], newAgents[index]];
        setConversationAgents(newAgents);
        notifyChange(newAgents, orchestrationMode, maxRounds, synthesizerAgentId);
    };

    // Sync with parent conversationId
    useEffect(() => {
        setLocalConversationId(conversationId);
    }, [conversationId]);

    // Auto-create conversation when popover opens and no conversation exists
    const ensureConversation = async (): Promise<string | null> => {
        if (localConversationId) return localConversationId;

        try {
            setIsCreatingConversation(true);
            const response = await fetch("/api/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "New Conversation" }),
            });

            if (!response.ok) {
                toast.error("Failed to create conversation");
                return null;
            }

            const data = await response.json();
            const newId = data.conversation.id;
            setLocalConversationId(newId);
            onConversationCreated?.(newId);
            return newId;
        } catch (error) {
            console.error("Create conversation error:", error);
            toast.error("Failed to create conversation");
            return null;
        } finally {
            setIsCreatingConversation(false);
        }
    };

    const mapApiAgent = (agent: ApiAgent): AgentConfig => ({
        id: agent.id,
        name: agent.name,
        role: agent.role as AgentConfig["role"],
        provider: agent.provider as AgentConfig["provider"],
        modelId: agent.modelId,
        systemPrompt: agent.systemPrompt || "",
        description: (agent.config as Record<string, unknown>)?.description as string || "",
        temperature: (agent.config as Record<string, unknown>)?.temperature as number || 0.7,
        maxTokens: (agent.config as Record<string, unknown>)?.maxTokens as number || undefined,
        tools: (agent.config as Record<string, unknown>)?.tools as AgentConfig["tools"] || [],
        canSeeOtherAgents: (agent.config as Record<string, unknown>)?.canSeeOtherAgents as boolean ?? true,
        priority: (agent.config as Record<string, unknown>)?.priority as number || 50,
        isActive: (agent.config as Record<string, unknown>)?.isActive as boolean ?? true,
    });

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Fetch templates
            const templatesRes = await fetch("/api/agents?templates=true");
            if (templatesRes.ok) {
                const data = await templatesRes.json();
                setTemplates((data.agents || []).map(mapApiAgent));
            }

            // Fetch conversation agents if we have a conversation
            if (localConversationId) {
                const convAgentsRes = await fetch(`/api/agents?conversationId=${localConversationId}`);
                if (convAgentsRes.ok) {
                    const data = await convAgentsRes.json();
                    setConversationAgents((data.agents || []).map(mapApiAgent));
                }
            }
        } catch (error) {
            console.error("Failed to fetch agents:", error);
        } finally {
            setIsLoading(false);
        }
    }, [localConversationId]);

    useEffect(() => {
        if (open) {
            fetchData();
        }
    }, [open, fetchData]);

    const isAgentInConversation = (agentName: string) => {
        return conversationAgents.some(a => a.name === agentName);
    };

    const handleToggleAgent = async (agentId: string, agentName: string, isCurrentlyAdded: boolean) => {
        // Ensure we have a conversation (create one if needed)
        const convId = await ensureConversation();
        if (!convId) {
            return;
        }

        if (isCurrentlyAdded) {
            // Remove agent from conversation
            const agentToRemove = conversationAgents.find(a => a.name === agentName);
            if (agentToRemove?.id) {
                try {
                    setAddingAgents(prev => new Set(prev).add(agentId));
                    const response = await fetch(`/api/agents/${agentToRemove.id}`, {
                        method: "DELETE",
                    });
                    if (response.ok) {
                        const newAgents = conversationAgents.filter(a => a.id !== agentToRemove.id);
                        setConversationAgents(newAgents);
                        // Reset synthesizer if removed agent was the synthesizer
                        const newSynthesizerId = synthesizerAgentId === agentToRemove.id ? undefined : synthesizerAgentId;
                        if (newSynthesizerId !== synthesizerAgentId) {
                            setSynthesizerAgentId(newSynthesizerId);
                        }
                        notifyChange(newAgents, orchestrationMode, maxRounds, newSynthesizerId);
                    }
                } catch (error) {
                    console.error("Failed to remove agent:", error);
                    toast.error("Failed to remove agent");
                } finally {
                    setAddingAgents(prev => {
                        const next = new Set(prev);
                        next.delete(agentId);
                        return next;
                    });
                }
            }
        } else {
            // Add agent to conversation
            try {
                setAddingAgents(prev => new Set(prev).add(agentId));
                const response = await fetch("/api/agents/add-to-conversation", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        agentId,
                        conversationId: convId,
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.agent) {
                        const newAgents = [...conversationAgents, mapApiAgent(data.agent)];
                        setConversationAgents(newAgents);
                        notifyChange(newAgents, orchestrationMode, maxRounds, synthesizerAgentId);
                    }
                } else {
                    const error = await response.json();
                    toast.error(error.error || "Failed to add agent");
                }
            } catch (error) {
                console.error("Failed to add agent:", error);
                toast.error("Failed to add agent");
            } finally {
                setAddingAgents(prev => {
                    const next = new Set(prev);
                    next.delete(agentId);
                    return next;
                });
            }
        }
    };

    // Convert presets to list
    const presetAgents = Object.entries(PRESET_AGENTS).map(([key, preset]) => ({
        ...preset,
        id: `preset-${key}`,
    }));

    const activeAgentCount = conversationAgents.length;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                    <Users className="h-4 w-4" />
                    Agents
                    {activeAgentCount > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                            {activeAgentCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
                <div className="p-3 border-b">
                    <h4 className="font-medium">Select Agents</h4>
                    <p className="text-xs text-muted-foreground">
                        Choose agents to participate in this chat
                    </p>
                </div>

                {isLoading || isCreatingConversation ? (
                    <div className="p-8 flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <Tabs defaultValue="presets" className="w-full">
                        <TabsList className="w-full grid grid-cols-2 p-1 mx-2 mt-2" style={{ width: 'calc(100% - 1rem)' }}>
                            <TabsTrigger value="presets" className="text-xs">
                                <Sparkles className="h-3 w-3 mr-1" />
                                Presets
                            </TabsTrigger>
                            <TabsTrigger value="templates" className="text-xs">
                                <Bot className="h-3 w-3 mr-1" />
                                My Templates
                            </TabsTrigger>
                        </TabsList>

                        <ScrollArea className="h-64">
                            <TabsContent value="presets" className="mt-0 p-2">
                                {presetAgents.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                        No presets available
                                    </p>
                                ) : (
                                    <div className="space-y-1">
                                        {presetAgents.map((agent) => {
                                            const isAdded = isAgentInConversation(agent.name);
                                            const isProcessing = addingAgents.has(agent.id);
                                            return (
                                                <div
                                                    key={agent.id}
                                                    className={cn(
                                                        "flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                                                        isAdded && "bg-muted/30"
                                                    )}
                                                    onClick={() => !isProcessing && handleToggleAgent(agent.id, agent.name, isAdded)}
                                                >
                                                    {isProcessing ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Checkbox checked={isAdded} />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-sm truncate">
                                                                {agent.name}
                                                            </span>
                                                            <Badge variant="outline" className="text-[10px] px-1">
                                                                {agent.role}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            {agent.description}
                                                        </p>
                                                    </div>
                                                    {isAdded && (
                                                        <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="templates" className="mt-0 p-2">
                                {templates.length === 0 ? (
                                    <div className="text-center py-4">
                                        <p className="text-sm text-muted-foreground">
                                            No templates yet
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Create templates in the Agents page
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {templates.map((agent) => {
                                            const isAdded = isAgentInConversation(agent.name);
                                            const isProcessing = addingAgents.has(agent.id!);
                                            return (
                                                <div
                                                    key={agent.id}
                                                    className={cn(
                                                        "flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                                                        isAdded && "bg-muted/30"
                                                    )}
                                                    onClick={() => !isProcessing && handleToggleAgent(agent.id!, agent.name, isAdded)}
                                                >
                                                    {isProcessing ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Checkbox checked={isAdded} />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-sm truncate">
                                                                {agent.name}
                                                            </span>
                                                            <Badge variant="outline" className="text-[10px] px-1">
                                                                {agent.role}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            {agent.provider} / {agent.modelId}
                                                        </p>
                                                    </div>
                                                    {isAdded && (
                                                        <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </TabsContent>
                        </ScrollArea>
                    </Tabs>
                )}

                {activeAgentCount > 0 && (
                    <div className="p-3 border-t bg-muted/30 space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                                {activeAgentCount} agent{activeAgentCount !== 1 ? "s" : ""} selected
                            </p>
                        </div>

                        {/* Agent Response Order */}
                        {activeAgentCount > 1 && (
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium flex items-center gap-1">
                                    <GripVertical className="h-3 w-3" />
                                    Response Order
                                </label>
                                <div className="space-y-1 bg-background/50 rounded-md p-2">
                                    {conversationAgents.map((agent, index) => (
                                        <div
                                            key={agent.id || agent.name}
                                            className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-muted/50"
                                        >
                                            <span className="w-4 h-4 flex items-center justify-center text-muted-foreground font-medium">
                                                {index + 1}.
                                            </span>
                                            <span className="flex-1 truncate font-medium">
                                                {agent.name}
                                            </span>
                                            <div className="flex items-center gap-0.5">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5"
                                                    onClick={() => moveAgentUp(index)}
                                                    disabled={index === 0}
                                                >
                                                    <ChevronUp className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5"
                                                    onClick={() => moveAgentDown(index)}
                                                    disabled={index === conversationAgents.length - 1}
                                                >
                                                    <ChevronDown className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                    Use arrows to change which agent responds first
                                </p>
                            </div>
                        )}

                        {activeAgentCount > 1 && (
                            <div className="space-y-2">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium flex items-center gap-1">
                                        <Workflow className="h-3 w-3" />
                                        Orchestration Mode
                                    </label>
                                    <Select value={orchestrationMode} onValueChange={(v) => handleModeChange(v as OrchestrationMode)}>
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ORCHESTRATION_MODES.map((mode) => (
                                                <SelectItem key={mode.value} value={mode.value}>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{mode.label}</span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {mode.description}
                                                        </span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {/* Discussion rounds config for consensus mode */}
                                {orchestrationMode === "consensus" && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium flex items-center justify-between">
                                            <span>Discussion Rounds</span>
                                            <span className="text-muted-foreground">{maxRounds}</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="1"
                                            max="5"
                                            value={maxRounds}
                                            onChange={(e) => handleRoundsChange(parseInt(e.target.value, 10))}
                                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            More rounds = deeper discussion, but takes longer
                                        </p>
                                    </div>
                                )}
                                {/* Synthesizer agent selection for consensus/hierarchical modes */}
                                {(orchestrationMode === "consensus" || orchestrationMode === "hierarchical") && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium flex items-center gap-1">
                                            <Sparkles className="h-3 w-3" />
                                            Synthesizer Agent
                                        </label>
                                        <Select
                                            value={synthesizerAgentId || "auto"}
                                            onValueChange={handleSynthesizerChange}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="auto">
                                                    <span className="font-medium">Auto</span>
                                                    <span className="text-xs text-muted-foreground ml-1">
                                                        (First agent or coordinator)
                                                    </span>
                                                </SelectItem>
                                                {conversationAgents.map((agent) => (
                                                    <SelectItem key={agent.id} value={agent.id!}>
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{agent.name}</span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {agent.modelId}
                                                            </span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[10px] text-muted-foreground">
                                            This agent will create the final synthesis of all responses
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
