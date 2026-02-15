"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    ChevronDown,
    ChevronRight,
    Sparkles,
    Brain,
    Eye,
    Wrench,
    Code,
    Zap,
    DollarSign,
    Filter,
    X,
    Search,
    Loader2,
    Check,
    ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModelConfig, ModelCapability, ProviderId } from "@/lib/ai/providers/types";
import { PROVIDERS, getModelsByProvider, getAllModels } from "@/lib/ai/models";
import { useModels, filterModels as searchModels, groupByProvider } from "@/lib/hooks/useModels";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface ModelSelectorProps {
    selectedModel: string;
    onModelChange: (modelId: string) => void;
    disabled?: boolean;
    compact?: boolean;
}

// Provider icons/colors
const providerStyles: Record<ProviderId, { color: string; bgColor: string }> = {
    openai: { color: "text-green-600", bgColor: "bg-green-100 dark:bg-green-900/30" },
    anthropic: { color: "text-orange-600", bgColor: "bg-orange-100 dark:bg-orange-900/30" },
    google: { color: "text-blue-600", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
    xai: { color: "text-gray-600", bgColor: "bg-gray-100 dark:bg-gray-900/30" },
    perplexity: { color: "text-teal-600", bgColor: "bg-teal-100 dark:bg-teal-900/30" },
    openrouter: { color: "text-purple-600", bgColor: "bg-purple-100 dark:bg-purple-900/30" },
    ollama: { color: "text-cyan-600", bgColor: "bg-cyan-100 dark:bg-cyan-900/30" },
    lmstudio: { color: "text-indigo-600", bgColor: "bg-indigo-100 dark:bg-indigo-900/30" },
    deepgram: { color: "text-emerald-600", bgColor: "bg-emerald-100 dark:bg-emerald-900/30" },
};

// Capability icons and labels
const capabilityConfig: Record<ModelCapability, { icon: typeof Sparkles; label: string; description: string }> = {
    text: { icon: Sparkles, label: "Text", description: "Basic text generation" },
    vision: { icon: Eye, label: "Vision", description: "Image understanding" },
    tools: { icon: Wrench, label: "Tools", description: "Function/tool calling" },
    reasoning: { icon: Brain, label: "Reasoning", description: "Extended thinking" },
    code: { icon: Code, label: "Code", description: "Code generation" },
    json: { icon: Code, label: "JSON", description: "JSON output mode" },
    streaming: { icon: Zap, label: "Stream", description: "Streaming responses" },
    extended_thinking: { icon: Brain, label: "Think", description: "Anthropic extended thinking" },
    image_generation: { icon: ImageIcon, label: "Image Gen", description: "Native image generation" },
};

// Filterable capabilities
const filterableCapabilities: ModelCapability[] = ["vision", "reasoning", "tools", "code"];

function formatPrice(price: number): string {
    if (price < 1) {
        return `$${price.toFixed(2)}`;
    }
    return `$${price.toFixed(0)}`;
}

function ModelCapabilityBadges({ capabilities }: { capabilities: ModelCapability[] }) {
    const relevantCapabilities: ModelCapability[] = ["vision", "reasoning", "tools"];
    const shownCapabilities = capabilities.filter((c) => relevantCapabilities.includes(c));

    return (
        <div className="flex gap-0.5">
            {shownCapabilities.map((cap) => {
                const config = capabilityConfig[cap];
                const Icon = config.icon;
                return (
                    <span
                        key={cap}
                        className="text-muted-foreground/70"
                        title={config.label}
                    >
                        <Icon className="h-3 w-3" />
                    </span>
                );
            })}
        </div>
    );
}

function CapabilityFilter({
    activeFilters,
    onToggleFilter,
}: {
    activeFilters: Set<ModelCapability>;
    onToggleFilter: (cap: ModelCapability) => void;
}) {
    return (
        <TooltipProvider>
            <div className="flex items-center gap-1 px-2 py-1.5 border-b">
                <Filter className="h-3 w-3 text-muted-foreground mr-1" />
                {filterableCapabilities.map((cap) => {
                    const config = capabilityConfig[cap];
                    const Icon = config.icon;
                    const isActive = activeFilters.has(cap);

                    return (
                        <Tooltip key={cap}>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onToggleFilter(cap);
                                    }}
                                    className={cn(
                                        "p-1 rounded transition-colors",
                                        isActive
                                            ? "bg-primary text-primary-foreground"
                                            : "hover:bg-muted text-muted-foreground"
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                <p className="font-medium">{config.label}</p>
                                <p className="text-xs text-muted-foreground">{config.description}</p>
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
                {activeFilters.size > 0 && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            activeFilters.clear();
                            onToggleFilter("text" as ModelCapability); // Trigger re-render
                        }}
                        className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground"
                        title="Clear filters"
                    >
                        <X className="h-3 w-3" />
                    </button>
                )}
            </div>
        </TooltipProvider>
    );
}

function ModelMenuItem({
    model,
    isSelected,
    onClick,
}: {
    model: ModelConfig;
    isSelected: boolean;
    onClick: () => void;
}) {
    return (
        <DropdownMenuItem
            onClick={onClick}
            className={cn("flex items-center justify-between gap-4 py-2", isSelected && "bg-accent")}
        >
            <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{model.name}</span>
                    {model.beta && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            Beta
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {formatPrice(model.pricing.input)}/{formatPrice(model.pricing.output)}
                    </span>
                    <ModelCapabilityBadges capabilities={model.capabilities} />
                </div>
            </div>
            {isSelected && <span className="text-primary">✓</span>}
        </DropdownMenuItem>
    );
}

// Hook to detect mobile viewport
function useIsMobile(breakpoint: number = 768) {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        // Check initial value
        const checkMobile = () => setIsMobile(window.innerWidth < breakpoint);
        checkMobile();

        // Listen for resize
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, [breakpoint]);

    return isMobile;
}

export function ModelSelector({
    selectedModel,
    onModelChange,
    disabled = false,
    compact = false,
}: ModelSelectorProps) {
    const [open, setOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState<Set<ModelCapability>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

    const isMobile = useIsMobile();

    // Fetch models dynamically
    const { models: dynamicModels, isLoading, isFallback } = useModels();

    // Use dynamic models if available, otherwise fallback to static
    const allModels = useMemo(() => {
        return dynamicModels.length > 0 ? dynamicModels : getAllModels();
    }, [dynamicModels]);

    // Handle filter toggle
    const handleToggleFilter = useCallback((cap: ModelCapability) => {
        setActiveFilters((prev) => {
            const next = new Set(prev);
            if (next.has(cap)) {
                next.delete(cap);
            } else {
                next.add(cap);
            }
            return next;
        });
    }, []);

    // Filter models based on search query and capability filters
    const filterModels = useCallback((models: ModelConfig[]): ModelConfig[] => {
        let filtered = models;

        // Apply search filter
        if (searchQuery.trim()) {
            filtered = searchModels(filtered, searchQuery);
        }

        // Apply capability filters
        if (activeFilters.size > 0) {
            filtered = filtered.filter((model) =>
                Array.from(activeFilters).every((cap) => model.capabilities.includes(cap))
            );
        }

        return filtered;
    }, [searchQuery, activeFilters]);

    // Find current model info - use useMemo to prevent hydration issues
    const currentModel = useMemo(() =>
        allModels.find((m) => m.id === selectedModel),
        [allModels, selectedModel]
    );

    // Get provider color - memoized to prevent hydration mismatch
    const providerColor = useMemo(() => {
        if (!currentModel) return "#525252";
        const provider = currentModel.provider;
        switch (provider) {
            case "openai": return "#16a34a";
            case "anthropic": return "#ea580c";
            case "google": return "#2563eb";
            case "openrouter": return "#9333ea";
            case "xai": return "#525252";
            default: return "#525252";
        }
    }, [currentModel]);

    const handleSelect = useCallback((modelId: string) => {
        onModelChange(modelId);
        setOpen(false);
        setSearchQuery("");
    }, [onModelChange]);

    // Count matching models
    const filteredModels = useMemo(() => filterModels(allModels), [filterModels, allModels]);
    const matchingCount = filteredModels.length;

    // Group filtered models by provider
    const modelsByProvider = useMemo(() => groupByProvider(filteredModels), [filteredModels]);

    // Model name for display - prevent hydration mismatch
    const displayName = useMemo(() => {
        if (!currentModel) return "Select Model";
        return compact ? currentModel.name.split(" ")[0] : currentModel.name;
    }, [currentModel, compact]);

    // Get provider color for a provider ID
    const getProviderColorHex = (providerId: string) => {
        const style = providerStyles[providerId as ProviderId];
        if (!style) return "#525252";
        if (style.color.includes("green")) return "#16a34a";
        if (style.color.includes("orange")) return "#ea580c";
        if (style.color.includes("blue")) return "#2563eb";
        if (style.color.includes("purple")) return "#9333ea";
        if (style.color.includes("cyan")) return "#0891b2";
        if (style.color.includes("indigo")) return "#4f46e5";
        return "#525252";
    };

    // Trigger button - shared between mobile and desktop
    const TriggerButton = (
        <Button
            variant="outline"
            size={compact ? "sm" : "default"}
            disabled={disabled}
            className={cn(
                "justify-between gap-2",
                compact ? "h-8 px-2" : "min-w-[180px]"
            )}
        >
            <div className="flex items-center gap-2">
                <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: providerColor }}
                />
                <span className="truncate max-w-[100px] sm:max-w-none">
                    {displayName}
                </span>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
    );

    // Mobile Sheet version
    if (isMobile) {
        return (
            <>
                <div onClick={() => setOpen(true)}>
                    {TriggerButton}
                </div>
                <Sheet open={open} onOpenChange={setOpen}>
                    <SheetContent side="bottom" className="h-[85vh] p-0 rounded-t-xl">
                        <SheetHeader className="px-4 py-3 border-b">
                            <SheetTitle>Select Model</SheetTitle>
                        </SheetHeader>

                        {/* Search Input */}
                        <div className="px-4 py-3 border-b">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search models..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 h-11 text-base"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Capability Filters */}
                        <CapabilityFilter
                            activeFilters={activeFilters}
                            onToggleFilter={handleToggleFilter}
                        />

                        {/* Model count */}
                        <div className="px-4 py-2 text-xs text-muted-foreground flex items-center justify-between border-b">
                            <span>
                                {isLoading ? (
                                    <span className="flex items-center gap-1">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Loading models...
                                    </span>
                                ) : (
                                    `${matchingCount} models available`
                                )}
                            </span>
                            {(activeFilters.size > 0 || searchQuery) && (
                                <span className="text-primary">{matchingCount} matching</span>
                            )}
                        </div>

                        {/* Provider list with expandable models */}
                        <ScrollArea className="flex-1 h-[calc(85vh-200px)]">
                            <div className="p-2">
                                {Object.entries(modelsByProvider).map(([providerId, models]) => {
                                    const provider = PROVIDERS[providerId as ProviderId];
                                    if (!models || models.length === 0) return null;

                                    const isExpanded = expandedProvider === providerId;
                                    const hasSelectedModel = models.some(m => m.id === selectedModel);

                                    return (
                                        <div key={providerId} className="mb-1">
                                            {/* Provider header */}
                                            <button
                                                type="button"
                                                onClick={() => setExpandedProvider(isExpanded ? null : providerId)}
                                                className={cn(
                                                    "w-full flex items-center justify-between p-3 rounded-lg transition-colors",
                                                    isExpanded ? "bg-muted" : "hover:bg-muted/50",
                                                    hasSelectedModel && !isExpanded && "bg-primary/5"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="h-3 w-3 rounded-full"
                                                        style={{ backgroundColor: getProviderColorHex(providerId) }}
                                                    />
                                                    <span className="font-medium">{provider?.name || providerId}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {models.length}
                                                    </span>
                                                </div>
                                                <ChevronRight className={cn(
                                                    "h-5 w-5 text-muted-foreground transition-transform",
                                                    isExpanded && "rotate-90"
                                                )} />
                                            </button>

                                            {/* Expanded models */}
                                            {isExpanded && (
                                                <div className="ml-4 mt-1 space-y-1 pb-2">
                                                    {models.map((model) => {
                                                        const isSelected = selectedModel === model.id;
                                                        return (
                                                            <button
                                                                key={model.id}
                                                                type="button"
                                                                onClick={() => handleSelect(model.id)}
                                                                className={cn(
                                                                    "w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left",
                                                                    isSelected
                                                                        ? "bg-primary text-primary-foreground"
                                                                        : "hover:bg-muted/50"
                                                                )}
                                                            >
                                                                <div className="flex flex-col gap-1 min-w-0 flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-medium truncate">{model.name}</span>
                                                                        {model.beta && (
                                                                            <Badge variant={isSelected ? "outline" : "secondary"} className="text-[10px] px-1 py-0">
                                                                                Beta
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    <div className={cn(
                                                                        "flex items-center gap-2 text-xs",
                                                                        isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                                                                    )}>
                                                                        <span className="flex items-center gap-1">
                                                                            <DollarSign className="h-3 w-3" />
                                                                            {formatPrice(model.pricing.input)}/{formatPrice(model.pricing.output)}
                                                                        </span>
                                                                        <ModelCapabilityBadges capabilities={model.capabilities} />
                                                                    </div>
                                                                </div>
                                                                {isSelected && <Check className="h-5 w-5 shrink-0" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {matchingCount === 0 && (
                                    <div className="px-4 py-8 text-center text-muted-foreground">
                                        <p>No models match your search</p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearchQuery("");
                                                setActiveFilters(new Set());
                                            }}
                                            className="text-primary text-sm mt-2 hover:underline"
                                        >
                                            Clear filters
                                        </button>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        {/* Footer */}
                        <div className="px-4 py-3 border-t text-xs text-muted-foreground">
                            <div className="flex items-center justify-between">
                                <span>Pricing: Input/Output per 1M tokens</span>
                                {!isFallback && <span className="text-green-600">Dynamic</span>}
                            </div>
                        </div>
                    </SheetContent>
                </Sheet>
            </>
        );
    }

    // Desktop dropdown version
    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                {TriggerButton}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[360px]">
                {/* Search Input */}
                <div className="px-2 py-2 border-b">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search models..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-8 text-sm"
                            onClick={(e) => e.stopPropagation()}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSearchQuery("");
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Capability Filters */}
                <CapabilityFilter
                    activeFilters={activeFilters}
                    onToggleFilter={handleToggleFilter}
                />

                <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>
                        {isLoading ? (
                            <span className="flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading models...
                            </span>
                        ) : (
                            `${matchingCount} models available`
                        )}
                    </span>
                    {(activeFilters.size > 0 || searchQuery) && (
                        <span className="text-primary">{matchingCount} matching</span>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <ScrollArea className="h-[300px]">
                    {Object.entries(modelsByProvider).map(([providerId, models]) => {
                        const provider = PROVIDERS[providerId as ProviderId];
                        const style = providerStyles[providerId as ProviderId];

                        // Skip provider if no models
                        if (!models || models.length === 0) return null;

                        return (
                            <DropdownMenuSub key={providerId}>
                                <DropdownMenuSubTrigger className="py-2">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className={cn("h-2 w-2 rounded-full")}
                                            style={{
                                                backgroundColor: style?.color.includes("green")
                                                    ? "#16a34a"
                                                    : style?.color.includes("orange")
                                                    ? "#ea580c"
                                                    : style?.color.includes("blue")
                                                    ? "#2563eb"
                                                    : style?.color.includes("purple")
                                                    ? "#9333ea"
                                                    : "#525252",
                                            }}
                                        />
                                        <span>{provider?.name || providerId}</span>
                                        <span className="text-xs text-muted-foreground ml-auto">
                                            {models.length} models
                                        </span>
                                    </div>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="w-[320px]">
                                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                                        {provider?.description || `${providerId} models`}
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <ScrollArea className="h-[250px]">
                                        {models.map((model) => (
                                            <ModelMenuItem
                                                key={model.id}
                                                model={model}
                                                isSelected={selectedModel === model.id}
                                                onClick={() => handleSelect(model.id)}
                                            />
                                        ))}
                                    </ScrollArea>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                        );
                    })}

                    {matchingCount === 0 && (
                        <div className="px-4 py-8 text-center text-muted-foreground">
                            <p>No models match your search</p>
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchQuery("");
                                    setActiveFilters(new Set());
                                }}
                                className="text-primary text-sm mt-2 hover:underline"
                            >
                                Clear filters
                            </button>
                        </div>
                    )}
                </ScrollArea>

                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                        <span>Pricing: Input/Output per 1M tokens</span>
                        {!isFallback && <span className="text-green-600">Dynamic</span>}
                    </div>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
