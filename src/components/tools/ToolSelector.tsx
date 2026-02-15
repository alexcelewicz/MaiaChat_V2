"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Search,
    Calculator,
    Globe,
    FileSearch,
    Braces,
    Code,
    Wrench,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Tool {
    id: string;
    name: string;
    description: string;
    category: string;
    icon: string;
}

interface ToolSelectorProps {
    selectedTools: string[];
    onSelectionChange: (tools: string[]) => void;
    className?: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Search,
    Calculator,
    Globe,
    FileSearch,
    Braces,
    Code,
    Wrench,
};

const categoryColors: Record<string, string> = {
    search: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    code: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    data: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    utility: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

export function ToolSelector({
    selectedTools,
    onSelectionChange,
    className,
}: ToolSelectorProps) {
    const [tools, setTools] = useState<Tool[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        fetchTools();
    }, []);

    const fetchTools = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/tools");
            if (!response.ok) throw new Error("Failed to fetch tools");
            const data = await response.json();
            setTools(data.tools || []);
        } catch (error) {
            console.error("Fetch tools error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleTool = (toolId: string) => {
        if (selectedTools.includes(toolId)) {
            onSelectionChange(selectedTools.filter(id => id !== toolId));
        } else {
            onSelectionChange([...selectedTools, toolId]);
        }
    };

    const selectAll = () => {
        onSelectionChange(tools.map(t => t.id));
    };

    const selectNone = () => {
        onSelectionChange([]);
    };

    // Group tools by category
    const groupedTools = tools.reduce((acc, tool) => {
        const category = tool.category;
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category]!.push(tool);
        return acc;
    }, {} as Record<string, Tool[]>);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className={className}>
                    <Wrench className="h-4 w-4 mr-2" />
                    Tools ({selectedTools.length})
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Select Tools</DialogTitle>
                    <DialogDescription>
                        Choose which tools this agent can use
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Quick actions */}
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={selectAll}
                            >
                                Select All
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={selectNone}
                            >
                                Clear All
                            </Button>
                        </div>

                        {/* Tools by category */}
                        <div className="space-y-4 max-h-[400px] overflow-y-auto">
                            {Object.entries(groupedTools).map(([category, categoryTools]) => (
                                <div key={category}>
                                    <h4 className="text-sm font-medium mb-2 capitalize">
                                        {category}
                                    </h4>
                                    <div className="space-y-2">
                                        {categoryTools.map(tool => {
                                            const IconComponent = iconMap[tool.icon] || Wrench;
                                            const isSelected = selectedTools.includes(tool.id);

                                            return (
                                                <div
                                                    key={tool.id}
                                                    className={cn(
                                                        "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                                                        isSelected
                                                            ? "border-primary bg-primary/5"
                                                            : "border-border hover:border-primary/50"
                                                    )}
                                                    onClick={() => toggleTool(tool.id)}
                                                >
                                                    <Checkbox
                                                        checked={isSelected}
                                                        onCheckedChange={() => toggleTool(tool.id)}
                                                        className="mt-0.5"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <IconComponent className="h-4 w-4 text-muted-foreground" />
                                                            <span className="font-medium text-sm">
                                                                {tool.name}
                                                            </span>
                                                            <Badge
                                                                variant="secondary"
                                                                className={cn(
                                                                    "text-[10px] h-5",
                                                                    categoryColors[tool.category]
                                                                )}
                                                            >
                                                                {tool.category}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            {tool.description}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
