"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Bot,
    Code,
    FileSearch,
    MoreVertical,
    Pencil,
    Trash2,
    Copy,
    Brain,
    Wand2,
    Search,
    Users,
    CheckCircle,
    Plus,
    Loader2,
    FolderOpen,
    FileX,
    FileOutput,
    Terminal,
    Puzzle,
    Mail,
    GitBranch,
    TerminalSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentConfig, AgentRole, AgentTool } from "@/types/agent";

interface AgentCardProps {
    agent: AgentConfig & { isPreset?: boolean };
    onEdit?: (agent: AgentConfig) => void;
    onDelete?: (agentId: string) => void;
    onDuplicate?: (agent: AgentConfig) => void;
    onToggleActive?: (agentId: string, isActive: boolean) => void;
    showAddButton?: boolean;
    onAdd?: () => void;
    isAdding?: boolean;
}

// Role icons and colors
const roleConfig: Record<AgentRole, { icon: typeof Bot; color: string; bgColor: string }> = {
    assistant: { icon: Bot, color: "text-blue-600", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
    coder: { icon: Code, color: "text-green-600", bgColor: "bg-green-100 dark:bg-green-900/30" },
    analyst: { icon: Brain, color: "text-purple-600", bgColor: "bg-purple-100 dark:bg-purple-900/30" },
    writer: { icon: Wand2, color: "text-pink-600", bgColor: "bg-pink-100 dark:bg-pink-900/30" },
    researcher: { icon: Search, color: "text-orange-600", bgColor: "bg-orange-100 dark:bg-orange-900/30" },
    coordinator: { icon: Users, color: "text-indigo-600", bgColor: "bg-indigo-100 dark:bg-indigo-900/30" },
    reviewer: { icon: CheckCircle, color: "text-cyan-600", bgColor: "bg-cyan-100 dark:bg-cyan-900/30" },
    custom: { icon: Bot, color: "text-gray-600", bgColor: "bg-gray-100 dark:bg-gray-900/30" },
};

// Tool icons
const toolIcons: Record<AgentTool, typeof Code> = {
    web_search: Search,
    code_exec: Code,
    file_read: FileSearch,
    file_write: FileSearch,
    file_list: FolderOpen,
    file_search: FileSearch,
    file_delete: FileX,
    file_move: FileOutput,
    shell_exec: Terminal,
    rag_search: FileSearch,
    calculator: Brain,
    coding_cli: TerminalSquare,
    email: Mail,
    workflow: GitBranch,
    skill: Puzzle,
    custom: Bot,
};

export function AgentCard({
    agent,
    onEdit,
    onDelete,
    onDuplicate,
    onToggleActive,
    showAddButton,
    onAdd,
    isAdding,
}: AgentCardProps) {
    const roleStyle = roleConfig[agent.role] || roleConfig.custom;
    const RoleIcon = roleStyle.icon;

    return (
        <Card className={cn(
            "relative transition-all",
            !agent.isActive && "opacity-60",
            agent.isPreset && "border-dashed"
        )}>
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-2 rounded-lg",
                            roleStyle.bgColor
                        )}>
                            <RoleIcon className={cn("h-5 w-5", roleStyle.color)} />
                        </div>
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                {agent.name}
                                {agent.isPreset && (
                                    <Badge variant="secondary" className="text-xs">
                                        Preset
                                    </Badge>
                                )}
                            </CardTitle>
                            <CardDescription className="text-sm capitalize">
                                {agent.role}
                            </CardDescription>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {!agent.isPreset && onToggleActive && (
                            <Switch
                                checked={agent.isActive}
                                onCheckedChange={(checked) => 
                                    agent.id && onToggleActive(agent.id, checked)
                                }
                            />
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {!agent.isPreset && onEdit && (
                                    <DropdownMenuItem onClick={() => onEdit(agent)}>
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Edit
                                    </DropdownMenuItem>
                                )}
                                {onDuplicate && (
                                    <DropdownMenuItem onClick={() => onDuplicate(agent)}>
                                        <Copy className="mr-2 h-4 w-4" />
                                        {agent.isPreset ? "Use as Template" : "Duplicate"}
                                    </DropdownMenuItem>
                                )}
                                {!agent.isPreset && onDelete && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="text-destructive"
                                            onClick={() => agent.id && onDelete(agent.id)}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Delete
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {/* Description */}
                {agent.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                        {agent.description}
                    </p>
                )}

                {/* Model info */}
                <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="font-mono text-xs">
                        {agent.provider}
                    </Badge>
                    <span className="text-muted-foreground truncate">
                        {agent.modelId}
                    </span>
                </div>

                {/* Tools */}
                {agent.tools && agent.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {agent.tools.map((tool) => {
                            const ToolIcon = toolIcons[tool] || Bot;
                            return (
                                <Badge
                                    key={tool}
                                    variant="secondary"
                                    className="text-xs py-0.5"
                                >
                                    <ToolIcon className="mr-1 h-3 w-3" />
                                    {tool.replace("_", " ")}
                                </Badge>
                            );
                        })}
                    </div>
                )}

                {/* Settings preview */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Temp: {agent.temperature}</span>
                    {agent.maxTokens && <span>Max: {agent.maxTokens}</span>}
                    {!agent.canSeeOtherAgents && (
                        <span className="text-amber-600">Private</span>
                    )}
                </div>

                {/* Add to conversation button */}
                {showAddButton && onAdd && (
                    <Button
                        className="w-full mt-2"
                        size="sm"
                        onClick={onAdd}
                        disabled={isAdding}
                    >
                        {isAdding ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Plus className="mr-2 h-4 w-4" />
                        )}
                        Add to Chat
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
