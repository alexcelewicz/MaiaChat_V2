"use client";

import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Search, Database } from "lucide-react";
import { StoreSelector } from "@/components/gemini/StoreSelector";
import {
    agentConfigSchema,
    type AgentConfig,
    type AgentRole,
    type AgentTool,
    DEFAULT_AGENT_CONFIG,
} from "@/types/agent";
import { PROVIDERS } from "@/lib/ai/models";
import { useModels, filterModels, groupByProvider } from "@/lib/hooks/useModels";
import type { ProviderId } from "@/lib/ai/providers/types";

interface AgentConfigFormProps {
    initialValues?: Partial<AgentConfig>;
    onSubmit: (values: AgentConfig) => Promise<void>;
    onCancel?: () => void;
    isLoading?: boolean;
}

const ROLES: { value: AgentRole; label: string; description: string }[] = [
    { value: "assistant", label: "General Assistant", description: "Helpful general-purpose assistant" },
    { value: "coder", label: "Code Expert", description: "Code generation and review" },
    { value: "analyst", label: "Data Analyst", description: "Data analysis and insights" },
    { value: "writer", label: "Content Writer", description: "Written content creation" },
    { value: "researcher", label: "Researcher", description: "Information gathering" },
    { value: "coordinator", label: "Coordinator", description: "Orchestrates other agents" },
    { value: "reviewer", label: "Reviewer", description: "Reviews and validates" },
    { value: "custom", label: "Custom", description: "Define your own role" },
];

const TOOLS: { value: AgentTool; label: string; description: string }[] = [
    { value: "web_search", label: "Web Search", description: "Search the internet" },
    { value: "code_exec", label: "Code Execution", description: "Execute code" },
    { value: "file_read", label: "File Read", description: "Read files" },
    { value: "file_write", label: "File Write", description: "Write files" },
    { value: "rag_search", label: "Document Search", description: "Search user documents" },
    { value: "calculator", label: "Calculator", description: "Mathematical calculations" },
    { value: "skill", label: "Skills", description: "Plugin/skill tools (calculator, web search, etc.)" },
];

export function AgentConfigForm({
    initialValues,
    onSubmit,
    onCancel,
    isLoading = false,
}: AgentConfigFormProps) {
    const [selectedProvider, setSelectedProvider] = useState<ProviderId>(
        (initialValues?.provider as ProviderId) || "openrouter"
    );
    const [modelSearch, setModelSearch] = useState("");

    // Fetch models dynamically from API
    const { models: allModels, isLoading: modelsLoading } = useModels();

    const form = useForm({
        resolver: zodResolver(agentConfigSchema),
        defaultValues: {
            ...DEFAULT_AGENT_CONFIG,
            ...initialValues,
            name: initialValues?.name || "",
            provider: initialValues?.provider || "openrouter",
        } as AgentConfig,
    });

    // Filter models by provider and search query
    const models = useMemo(() => {
        const providerModels = allModels.filter((m) => m.provider === selectedProvider);
        return modelSearch ? filterModels(providerModels, modelSearch) : providerModels;
    }, [allModels, selectedProvider, modelSearch]);

    const handleSubmit = async (values: AgentConfig) => {
        await onSubmit(values);
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                {/* Basic Info */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Name</FormLabel>
                                <FormControl>
                                    <Input placeholder="My Agent" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Role</FormLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a role" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {ROLES.map((role) => (
                                            <SelectItem key={role.value} value={role.value}>
                                                <div className="flex flex-col">
                                                    <span>{role.label}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {role.description}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Brief description of this agent"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Model Selection */}
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <h3 className="font-semibold">Model Configuration</h3>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="provider"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Provider</FormLabel>
                                        <Select
                                            onValueChange={(value: ProviderId) => {
                                                field.onChange(value);
                                                setSelectedProvider(value);
                                                setModelSearch(""); // Reset search
                                                // Reset model when provider changes
                                                const firstModel = allModels.find(
                                                    (m) => m.provider === value
                                                );
                                                if (firstModel) {
                                                    form.setValue("modelId", firstModel.id);
                                                }
                                            }}
                                            defaultValue={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select provider" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {Object.entries(PROVIDERS).map(([id, provider]) => (
                                                    <SelectItem key={id} value={id}>
                                                        {provider.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="modelId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Model {modelsLoading && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}</FormLabel>
                                        {/* Search input for filtering many models */}
                                        <div className="relative mb-2">
                                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Search models..."
                                                value={modelSearch}
                                                onChange={(e) => setModelSearch(e.target.value)}
                                                className="pl-8 h-9"
                                            />
                                        </div>
                                        <Select
                                            onValueChange={field.onChange}
                                            value={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select model" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="max-h-[300px]">
                                                {models.length === 0 ? (
                                                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                                                        {modelsLoading ? "Loading models..." : "No models found"}
                                                    </div>
                                                ) : (
                                                    models.slice(0, 100).map((model) => (
                                                        <SelectItem key={model.id} value={model.id}>
                                                            <div className="flex flex-col">
                                                                <span>{model.name}</span>
                                                                {model.description && (
                                                                    <span className="text-xs text-muted-foreground truncate max-w-[250px]">
                                                                        {model.description}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </SelectItem>
                                                    ))
                                                )}
                                                {models.length > 100 && (
                                                    <div className="px-2 py-2 text-xs text-muted-foreground text-center border-t">
                                                        Showing first 100 of {models.length} models. Use search to filter.
                                                    </div>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <FormDescription>
                                            {models.length} models available for this provider
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="temperature"
                            render={({ field }) => (
                                <FormItem>
                                    <div className="flex items-center justify-between">
                                        <FormLabel>Temperature</FormLabel>
                                        <span className="text-sm text-muted-foreground">
                                            {field.value}
                                        </span>
                                    </div>
                                    <FormControl>
                                        <input
                                            type="range"
                                            min="0"
                                            max="2"
                                            step="0.1"
                                            value={field.value}
                                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Lower = more focused, Higher = more creative
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="maxTokens"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Max Tokens (optional)</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            placeholder="Leave empty for model default"
                                            {...field}
                                            value={field.value || ""}
                                            onChange={(e) =>
                                                field.onChange(
                                                    e.target.value ? parseInt(e.target.value) : undefined
                                                )
                                            }
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                {/* System Prompt */}
                <FormField
                    control={form.control}
                    name="systemPrompt"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>System Prompt</FormLabel>
                            <FormControl>
                                <textarea
                                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    placeholder="You are a helpful AI assistant..."
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Instructions that define the agent&apos;s behavior
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Tools */}
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <h3 className="font-semibold">Tools</h3>
                        <FormField
                            control={form.control}
                            name="tools"
                            render={({ field }) => (
                                <FormItem>
                                    <div className="grid grid-cols-2 gap-3">
                                        {TOOLS.map((tool) => (
                                            <div
                                                key={tool.value}
                                                className="flex items-start space-x-3"
                                            >
                                                <Checkbox
                                                    id={tool.value}
                                                    checked={field.value?.includes(tool.value)}
                                                    onCheckedChange={(checked) => {
                                                        const newValue = checked
                                                            ? [...(field.value || []), tool.value]
                                                            : field.value?.filter(
                                                                (v) => v !== tool.value
                                                            );
                                                        field.onChange(newValue);
                                                    }}
                                                />
                                                <div className="grid gap-0.5 leading-none">
                                                    <label
                                                        htmlFor={tool.value}
                                                        className="text-sm font-medium cursor-pointer"
                                                    >
                                                        {tool.label}
                                                    </label>
                                                    <p className="text-xs text-muted-foreground">
                                                        {tool.description}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                {/* Gemini File Search Stores */}
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <div className="flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            <h3 className="font-semibold">Gemini File Search Stores</h3>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Select Gemini stores for this agent to use for document retrieval.
                            When stores are selected, the agent will automatically search them for relevant context.
                        </p>
                        <FormField
                            control={form.control}
                            name="geminiStoreIds"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <StoreSelector
                                            selectedStoreIds={field.value || []}
                                            onStoreChange={(ids) => field.onChange(ids)}
                                            multiSelect={true}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Select one or more stores. Leave empty to disable Gemini retrieval for this agent.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                {/* Advanced Settings */}
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <h3 className="font-semibold">Advanced Settings</h3>

                        <FormField
                            control={form.control}
                            name="canSeeOtherAgents"
                            render={({ field }) => (
                                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                                    <div className="space-y-0.5">
                                        <FormLabel>Can See Other Agents</FormLabel>
                                        <FormDescription>
                                            Allow this agent to see responses from other agents
                                        </FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="priority"
                            render={({ field }) => (
                                <FormItem>
                                    <div className="flex items-center justify-between">
                                        <FormLabel>Priority</FormLabel>
                                        <span className="text-sm text-muted-foreground">
                                            {field.value}
                                        </span>
                                    </div>
                                    <FormControl>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            step="10"
                                            value={field.value}
                                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Higher priority agents respond first in sequential mode
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="isActive"
                            render={({ field }) => (
                                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                                    <div className="space-y-0.5">
                                        <FormLabel>Active</FormLabel>
                                        <FormDescription>
                                            Enable or disable this agent
                                        </FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex justify-end gap-3">
                    {onCancel && (
                        <Button type="button" variant="outline" onClick={onCancel}>
                            Cancel
                        </Button>
                    )}
                    <Button type="submit" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {initialValues?.id ? "Update Agent" : "Create Agent"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
