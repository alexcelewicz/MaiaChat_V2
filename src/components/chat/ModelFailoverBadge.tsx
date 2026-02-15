"use client";

import { Shield } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ModelFailoverBadgeProps {
    primaryModel: string;
    fallbackModels: string[];
    isEnabled: boolean;
    usedFallback?: boolean;
    actualModel?: string;
}

export function ModelFailoverBadge({ primaryModel, fallbackModels, isEnabled, usedFallback, actualModel }: ModelFailoverBadgeProps) {
    if (!isEnabled || fallbackModels.length === 0) return null;

    const badgeColor = usedFallback
        ? "bg-amber-500/10 text-amber-600"
        : "bg-green-500/10 text-green-600";

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor}`}>
                        <Shield className="h-3 w-3" />
                        {usedFallback ? "Fallback Active" : "Failover"}
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <div className="text-xs space-y-1">
                        <p className="font-medium">{usedFallback ? "Using Fallback Model" : "Model Failover Active"}</p>
                        <p>Primary: {primaryModel}</p>
                        {usedFallback && actualModel && <p>Active: {actualModel}</p>}
                        <p>Fallbacks: {fallbackModels.join(", ")}</p>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
