"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Bot,
    ArrowRight,
    ArrowDown,
    Clock,
    Zap,
    MessageSquare,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentConfig, OrchestrationMode, AgentMessage } from "@/types/agent";

interface CollaborationViewProps {
    agents: AgentConfig[];
    messages: AgentMessage[];
    mode: OrchestrationMode;
    activeAgentId?: string;
    debug?: {
        reasoning: string[];
        decisions: string[];
    };
}

// Agent colors for visual distinction
const agentColors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-yellow-500",
];

function getAgentColor(index: number): string {
    return agentColors[index % agentColors.length] ?? "bg-gray-500";
}

interface AgentNodeProps {
    agent: AgentConfig;
    index: number;
    isActive: boolean;
    hasResponse: boolean;
    responseCount: number;
    onClick?: () => void;
}

function AgentNode({ agent, index, isActive, hasResponse, responseCount, onClick }: AgentNodeProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "relative flex flex-col items-center p-3 rounded-lg border-2 transition-all min-w-[100px]",
                isActive
                    ? "border-primary bg-primary/10 shadow-lg scale-105"
                    : hasResponse
                    ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                    : "border-muted bg-muted/30 hover:bg-muted/50"
            )}
        >
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white", getAgentColor(index))}>
                <Bot className="w-5 h-5" />
            </div>
            <span className="mt-2 text-sm font-medium truncate max-w-[90px]">{agent.name}</span>
            <span className="text-xs text-muted-foreground capitalize">{agent.role}</span>
            {responseCount > 0 && (
                <Badge variant="secondary" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center">
                    {responseCount}
                </Badge>
            )}
            {isActive && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                </div>
            )}
        </button>
    );
}

function FlowArrow({ direction }: { direction: "right" | "down" }) {
    return direction === "right" ? (
        <ArrowRight className="w-6 h-6 text-muted-foreground mx-2" />
    ) : (
        <ArrowDown className="w-6 h-6 text-muted-foreground my-2" />
    );
}

export function CollaborationView({
    agents,
    messages,
    mode,
    activeAgentId,
    debug,
}: CollaborationViewProps) {
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [showDebug, setShowDebug] = useState(false);

    // Get message counts per agent
    const getResponseCount = (agentId?: string) => {
        if (!agentId) return 0;
        return messages.filter(m => m.agentId === agentId && m.role === "assistant").length;
    };

    // Get messages for selected agent
    const selectedAgentMessages = selectedAgentId
        ? messages.filter(m => m.agentId === selectedAgentId)
        : [];

    // Mode-specific layout
    const renderAgentFlow = () => {
        switch (mode) {
            case "parallel":
                return (
                    <div className="flex flex-col items-center gap-4">
                        <div className="flex items-center justify-center gap-4 flex-wrap">
                            {agents.map((agent, index) => (
                                <AgentNode
                                    key={agent.id || index}
                                    agent={agent}
                                    index={index}
                                    isActive={agent.id === activeAgentId}
                                    hasResponse={getResponseCount(agent.id) > 0}
                                    responseCount={getResponseCount(agent.id)}
                                    onClick={() => setSelectedAgentId(agent.id || null)}
                                />
                            ))}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Zap className="w-4 h-4" />
                            <span>All agents respond simultaneously</span>
                        </div>
                    </div>
                );

            case "sequential":
                return (
                    <div className="flex flex-col items-center gap-4">
                        <div className="flex items-center gap-2 flex-wrap justify-center">
                            {agents.map((agent, index) => (
                                <div key={agent.id || index} className="flex items-center">
                                    <AgentNode
                                        agent={agent}
                                        index={index}
                                        isActive={agent.id === activeAgentId}
                                        hasResponse={getResponseCount(agent.id) > 0}
                                        responseCount={getResponseCount(agent.id)}
                                        onClick={() => setSelectedAgentId(agent.id || null)}
                                    />
                                    {index < agents.length - 1 && <FlowArrow direction="right" />}
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            <span>Agents respond in order, each seeing previous responses</span>
                        </div>
                    </div>
                );

            case "hierarchical":
                const coordinator = agents.find(a => a.role === "coordinator") || agents[0];
                const specialists = agents.filter(a => a.id !== coordinator?.id);

                if (!coordinator) {
                    return <div className="text-muted-foreground">No agents configured</div>;
                }

                return (
                    <div className="flex flex-col items-center gap-4">
                        {/* Coordinator at top */}
                        <AgentNode
                            agent={coordinator}
                            index={0}
                            isActive={coordinator.id === activeAgentId}
                            hasResponse={getResponseCount(coordinator.id) > 0}
                            responseCount={getResponseCount(coordinator.id)}
                            onClick={() => setSelectedAgentId(coordinator.id || null)}
                        />
                        
                        {/* Arrows down to specialists */}
                        <div className="flex items-center gap-8">
                            {specialists.map((_, index) => (
                                <FlowArrow key={index} direction="down" />
                            ))}
                        </div>
                        
                        {/* Specialists */}
                        <div className="flex items-center gap-4 flex-wrap justify-center">
                            {specialists.map((agent, index) => (
                                <AgentNode
                                    key={agent.id || index}
                                    agent={agent}
                                    index={index + 1}
                                    isActive={agent.id === activeAgentId}
                                    hasResponse={getResponseCount(agent.id) > 0}
                                    responseCount={getResponseCount(agent.id)}
                                    onClick={() => setSelectedAgentId(agent.id || null)}
                                />
                            ))}
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Bot className="w-4 h-4" />
                            <span>Coordinator delegates to specialists</span>
                        </div>
                    </div>
                );

            case "consensus":
                return (
                    <div className="flex flex-col items-center gap-4">
                        <div className="flex items-center gap-4 flex-wrap justify-center">
                            {agents.map((agent, index) => (
                                <AgentNode
                                    key={agent.id || index}
                                    agent={agent}
                                    index={index}
                                    isActive={agent.id === activeAgentId}
                                    hasResponse={getResponseCount(agent.id) > 0}
                                    responseCount={getResponseCount(agent.id)}
                                    onClick={() => setSelectedAgentId(agent.id || null)}
                                />
                            ))}
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <FlowArrow direction="down" />
                            <div className="px-4 py-2 rounded-lg bg-muted border flex items-center gap-2">
                                <MessageSquare className="w-4 h-4" />
                                <span className="text-sm font-medium">Synthesized Response</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>Multiple perspectives combined into unified response</span>
                        </div>
                    </div>
                );

            default:
                const defaultAgent = agents[0];
                if (!defaultAgent) {
                    return <div className="text-muted-foreground">No agents configured</div>;
                }
                return (
                    <div className="flex justify-center">
                        <AgentNode
                            agent={defaultAgent}
                            index={0}
                            isActive={defaultAgent.id === activeAgentId}
                            hasResponse={getResponseCount(defaultAgent.id) > 0}
                            responseCount={getResponseCount(defaultAgent.id)}
                            onClick={() => setSelectedAgentId(defaultAgent.id || null)}
                        />
                    </div>
                );
        }
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Bot className="w-5 h-5" />
                        Agent Collaboration
                        <Badge variant="outline" className="ml-2 capitalize">
                            {mode} mode
                        </Badge>
                    </CardTitle>
                    {debug && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowDebug(!showDebug)}
                        >
                            {showDebug ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            Debug
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Agent Flow Visualization */}
                <div className="p-4 rounded-lg bg-muted/30 border">
                    {renderAgentFlow()}
                </div>

                {/* Selected Agent Messages */}
                {selectedAgentId && selectedAgentMessages.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium">
                            Messages from {agents.find(a => a.id === selectedAgentId)?.name}
                        </h4>
                        <ScrollArea className="h-[200px]">
                            <div className="space-y-2">
                                {selectedAgentMessages.map((msg, index) => (
                                    <div
                                        key={index}
                                        className="p-3 rounded-lg bg-muted/50 text-sm"
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant="outline" className="text-xs">
                                                {msg.role}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {msg.timestamp.toLocaleTimeString()}
                                            </span>
                                        </div>
                                        <p className="line-clamp-3">{msg.content}</p>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                )}

                {/* Debug Information */}
                {showDebug && debug && (
                    <div className="space-y-2 p-3 rounded-lg bg-muted/30 border">
                        <h4 className="text-sm font-medium">Debug Information</h4>
                        {debug.reasoning.length > 0 && (
                            <div>
                                <span className="text-xs font-medium text-muted-foreground">Reasoning:</span>
                                <ul className="mt-1 space-y-1">
                                    {debug.reasoning.map((r, i) => (
                                        <li key={i} className="text-xs text-muted-foreground">• {r}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {debug.decisions.length > 0 && (
                            <div>
                                <span className="text-xs font-medium text-muted-foreground">Decisions:</span>
                                <ul className="mt-1 space-y-1">
                                    {debug.decisions.map((d, i) => (
                                        <li key={i} className="text-xs text-muted-foreground">• {d}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
