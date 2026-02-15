"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Bug,
    ChevronDown,
    ChevronRight,
    Clock,
    Cpu,
    DollarSign,
    MessageSquare,
    Bot,
    Copy,
    Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { AgentConfig, AgentMessage, OrchestrationMode } from "@/types/agent";

interface DebugPanelProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    orchestrationMode: OrchestrationMode;
    agents: AgentConfig[];
    messages: AgentMessage[];
    debug?: {
        reasoning: string[];
        decisions: string[];
    };
    timing?: {
        startTime: Date;
        endTime?: Date;
        agentTimings?: Record<string, number>;
    };
    costs?: {
        inputTokens: number;
        outputTokens: number;
        totalCost: number;
    };
}

interface DebugSectionProps {
    title: string;
    icon: React.ReactNode;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

function DebugSection({ title, icon, defaultOpen = true, children }: DebugSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    
    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted/50 transition-colors">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {icon}
                <span className="text-sm font-medium">{title}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-8 pr-2 pb-2">
                {children}
            </CollapsibleContent>
        </Collapsible>
    );
}

export function DebugPanel({
    isOpen,
    onOpenChange,
    orchestrationMode,
    agents,
    messages,
    debug,
    timing,
    costs,
}: DebugPanelProps) {
    const [copiedItem, setCopiedItem] = useState<string | null>(null);

    const copyToClipboard = async (text: string, itemId: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedItem(itemId);
            toast.success("Copied to clipboard");
            setTimeout(() => setCopiedItem(null), 2000);
        } catch {
            toast.error("Failed to copy");
        }
    };

    const getTotalDuration = () => {
        if (!timing?.startTime || !timing?.endTime) return null;
        return timing.endTime.getTime() - timing.startTime.getTime();
    };

    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    if (!isOpen) {
        return (
            <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(true)}
                className="fixed bottom-4 right-4 z-50"
            >
                <Bug className="w-4 h-4 mr-2" />
                Debug
            </Button>
        );
    }

    return (
        <Card className="fixed bottom-4 right-4 w-[400px] max-h-[600px] z-50 shadow-lg">
            <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Bug className="w-4 h-4" />
                        Debug Panel
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                    >
                        ×
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                    <div className="p-4 space-y-1">
                        {/* Overview */}
                        <DebugSection
                            title="Overview"
                            icon={<Cpu className="w-4 h-4" />}
                        >
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Mode</span>
                                    <Badge variant="outline" className="capitalize">
                                        {orchestrationMode}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Active Agents</span>
                                    <span>{agents.length}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Total Messages</span>
                                    <span>{messages.length}</span>
                                </div>
                            </div>
                        </DebugSection>

                        {/* Timing */}
                        {timing && (
                            <DebugSection
                                title="Timing"
                                icon={<Clock className="w-4 h-4" />}
                            >
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Start</span>
                                        <span className="font-mono text-xs">
                                            {timing.startTime.toLocaleTimeString()}
                                        </span>
                                    </div>
                                    {timing.endTime && (
                                        <>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">End</span>
                                                <span className="font-mono text-xs">
                                                    {timing.endTime.toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">Duration</span>
                                                <Badge variant="secondary">
                                                    {formatDuration(getTotalDuration()!)}
                                                </Badge>
                                            </div>
                                        </>
                                    )}
                                    {timing.agentTimings && Object.keys(timing.agentTimings).length > 0 && (
                                        <div className="mt-2 pt-2 border-t">
                                            <span className="text-xs font-medium">Per Agent:</span>
                                            <div className="mt-1 space-y-1">
                                                {Object.entries(timing.agentTimings).map(([agentId, ms]) => {
                                                    const agent = agents.find(a => a.id === agentId);
                                                    return (
                                                        <div key={agentId} className="flex items-center justify-between">
                                                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                                {agent?.name || agentId}
                                                            </span>
                                                            <span className="font-mono text-xs">
                                                                {formatDuration(ms)}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </DebugSection>
                        )}

                        {/* Costs */}
                        {costs && (
                            <DebugSection
                                title="Costs"
                                icon={<DollarSign className="w-4 h-4" />}
                            >
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Input Tokens</span>
                                        <span>{costs.inputTokens.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Output Tokens</span>
                                        <span>{costs.outputTokens.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between pt-2 border-t">
                                        <span className="font-medium">Total Cost</span>
                                        <Badge variant="secondary">
                                            ${costs.totalCost.toFixed(4)}
                                        </Badge>
                                    </div>
                                </div>
                            </DebugSection>
                        )}

                        {/* Agents */}
                        <DebugSection
                            title="Agents"
                            icon={<Bot className="w-4 h-4" />}
                            defaultOpen={false}
                        >
                            <div className="space-y-2">
                                {agents.map((agent, index) => (
                                    <div
                                        key={agent.id || index}
                                        className="p-2 rounded-lg bg-muted/30 text-xs space-y-1"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium">{agent.name}</span>
                                            <Badge variant="outline" className="text-[10px]">
                                                {agent.role}
                                            </Badge>
                                        </div>
                                        <div className="text-muted-foreground">
                                            {agent.provider}/{agent.modelId}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span>Temp: {agent.temperature}</span>
                                            {agent.maxTokens && <span>Max: {agent.maxTokens}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </DebugSection>

                        {/* Messages */}
                        <DebugSection
                            title="Messages"
                            icon={<MessageSquare className="w-4 h-4" />}
                            defaultOpen={false}
                        >
                            <div className="space-y-2">
                                {messages.map((msg, index) => (
                                    <div
                                        key={index}
                                        className="p-2 rounded-lg bg-muted/30 text-xs space-y-1"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium">{msg.agentName}</span>
                                            <div className="flex items-center gap-1">
                                                <Badge variant="outline" className="text-[10px]">
                                                    {msg.role}
                                                </Badge>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5"
                                                    onClick={() => copyToClipboard(msg.content, `msg-${index}`)}
                                                >
                                                    {copiedItem === `msg-${index}` ? (
                                                        <Check className="w-3 h-3" />
                                                    ) : (
                                                        <Copy className="w-3 h-3" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                        <p className="text-muted-foreground line-clamp-3">
                                            {msg.content}
                                        </p>
                                        <div className="text-[10px] text-muted-foreground">
                                            {msg.timestamp.toLocaleTimeString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </DebugSection>

                        {/* Debug Reasoning */}
                        {debug && (debug.reasoning.length > 0 || debug.decisions.length > 0) && (
                            <DebugSection
                                title="Reasoning"
                                icon={<Bug className="w-4 h-4" />}
                            >
                                <div className="space-y-3 text-xs">
                                    {debug.reasoning.length > 0 && (
                                        <div>
                                            <span className="font-medium text-muted-foreground">
                                                Reasoning Steps:
                                            </span>
                                            <ul className="mt-1 space-y-1">
                                                {debug.reasoning.map((r, i) => (
                                                    <li key={i} className="flex items-start gap-2">
                                                        <span className="text-muted-foreground">{i + 1}.</span>
                                                        <span>{r}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {debug.decisions.length > 0 && (
                                        <div>
                                            <span className="font-medium text-muted-foreground">
                                                Decisions Made:
                                            </span>
                                            <ul className="mt-1 space-y-1">
                                                {debug.decisions.map((d, i) => (
                                                    <li key={i} className="flex items-start gap-2">
                                                        <span className="text-green-500">✓</span>
                                                        <span>{d}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </DebugSection>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
