"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Puzzle } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

interface SkillInfo {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    icon: string | null;
    category: string;
    isEnabled: boolean;
    isBuiltin: boolean;
    usageCount: number;
}

interface SkillsPanelProps {
    skillsEnabled: boolean;
    onToggleSkills: (enabled: boolean) => void;
    onEnabledSkillsChange?: (slugs: string[]) => void;
}

export function SkillsPanel({ skillsEnabled, onToggleSkills, onEnabledSkillsChange }: SkillsPanelProps) {
    const [skills, setSkills] = useState<SkillInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const onEnabledSkillsChangeRef = useRef(onEnabledSkillsChange);
    onEnabledSkillsChangeRef.current = onEnabledSkillsChange;

    // Sync enabled skills to parent whenever skills state changes
    useEffect(() => {
        if (skills.length === 0) return;
        onEnabledSkillsChangeRef.current?.(skills.filter(s => s.isEnabled).map(s => s.slug));
    }, [skills]);

    const fetchSkills = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/skills");
            if (!res.ok) return;
            const data = await res.json();
            const fetched: SkillInfo[] = data.skills || [];
            setSkills(fetched);
        } catch {
            // Silently fail - skills panel is optional
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            fetchSkills();
        }
    }, [open, fetchSkills]);

    const handleToggleSkill = async (skillId: string, enabled: boolean) => {
        try {
            const res = await fetch(`/api/skills/${skillId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isEnabled: enabled }),
            });

            if (!res.ok) {
                toast.error("Failed to update skill");
                return;
            }

            setSkills(prev => prev.map(s =>
                s.id === skillId ? { ...s, isEnabled: enabled } : s
            ));
        } catch {
            toast.error("Failed to update skill");
        }
    };

    const enabledCount = skills.filter(s => s.isEnabled).length;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={`h-8 gap-1.5 px-2 ${skillsEnabled ? 'text-primary' : 'text-muted-foreground'}`}
                            >
                                <Puzzle className="h-4 w-4" />
                                <span className="text-xs font-medium">Skills</span>
                                {enabledCount > 0 && skillsEnabled && (
                                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                                        {enabledCount}
                                    </Badge>
                                )}
                            </Button>
                        </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                        <p className="font-medium">AI Skills</p>
                        <p className="text-xs mt-1">Enable specialized plugins that extend AI capabilities for specific domains like coding, analysis, or creative tasks.</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <PopoverContent className="w-72 p-3" align="start">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold">Skills</h4>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                                {skillsEnabled ? "On" : "Off"}
                            </span>
                            <Switch
                                checked={skillsEnabled}
                                onCheckedChange={onToggleSkills}
                                className="scale-75"
                            />
                        </div>
                    </div>

                    {!skillsEnabled && (
                        <p className="text-xs text-muted-foreground">
                            Enable skills to give the AI access to plugins like calculator, web search, and more.
                        </p>
                    )}

                    {skillsEnabled && (
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                            {loading ? (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                            ) : skills.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2">
                                    No skills available. Check Settings &gt; Skills.
                                </p>
                            ) : (
                                skills.map(skill => (
                                    <div
                                        key={skill.id}
                                        className="flex items-center justify-between py-1.5 px-1 rounded hover:bg-muted/50"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-sm shrink-0">
                                                {skill.icon || "🔧"}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="text-xs font-medium truncate">
                                                    {skill.name}
                                                </div>
                                                {skill.description && (
                                                    <div className="text-[10px] text-muted-foreground truncate">
                                                        {skill.description}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <Switch
                                            checked={skill.isEnabled}
                                            onCheckedChange={(checked) => handleToggleSkill(skill.id, checked)}
                                            className="scale-75 shrink-0"
                                        />
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
