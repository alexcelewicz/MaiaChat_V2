"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Key, Plus, Trash2, Check, AlertCircle, Loader2, ExternalLink, ShieldCheck, ShieldX, Cpu, CheckCircle2, XCircle, Shield, Brain, Sparkles, Plug, Workflow, Search, Eraser, DollarSign, Image, Database } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { PROVIDERS } from "@/lib/ai/models";
import type { ProviderId } from "@/lib/ai/providers/types";

// Local providers don't need API keys
const LOCAL_PROVIDERS: ProviderId[] = ["ollama", "lmstudio"];
const CLOUD_PROVIDERS = Object.keys(PROVIDERS).filter(
    (id) => !LOCAL_PROVIDERS.includes(id as ProviderId)
) as ProviderId[];

interface StoredKey {
    id: string;
    provider: string;
    keyHint: string;
    isActive: boolean;
    lastUsedAt: string | null;
    createdAt: string;
}

const providerColors: Record<ProviderId, string> = {
    openai: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    anthropic: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    google: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    xai: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    perplexity: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
    openrouter: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    ollama: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    lmstudio: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    deepgram: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

interface LocalModelStatus {
    ollama: { available: boolean; models: { id: string; name: string }[] };
    lmstudio: { available: boolean; models: { id: string; name: string }[] };
}

export default function SettingsPage() {
    const [keys, setKeys] = useState<StoredKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [validationStatus, setValidationStatus] = useState<"none" | "valid" | "invalid">("none");
    const [validationError, setValidationError] = useState<string>("");
    const [selectedProvider, setSelectedProvider] = useState<ProviderId>("openai");
    const [newApiKey, setNewApiKey] = useState("");
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [localModels, setLocalModels] = useState<LocalModelStatus>({
        ollama: { available: false, models: [] },
        lmstudio: { available: false, models: [] },
    });
    const [checkingLocal, setCheckingLocal] = useState(false);

    // Chat feature toggles (moved from chat input toolbar)
    const [memoryEnabled, setMemoryEnabled] = useState(false);
    const [geminiFileSearchEnabled, setGeminiFileSearchEnabled] = useState(false);

    // Web search preferences (server-side)
    const [webSearchModel, setWebSearchModel] = useState("auto");
    const [deepResearchModel, setDeepResearchModel] = useState("none");
    const [isSavingWebSearch, setIsSavingWebSearch] = useState(false);

    // Fetch existing keys and local model status
    useEffect(() => {
        fetchKeys();
        checkLocalModels();
        fetch("/api/auth/me", { credentials: "include" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data?.user) {
                    setIsAuthenticated(true);
                    if (data.user.role === "admin") {
                        setIsAdmin(true);
                    }
                }
            })
            .catch(() => null);

        // Load web search preferences from server
        fetch("/api/user/preferences", { credentials: "include" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data?.preferences) {
                    if (data.preferences.webSearchModel) setWebSearchModel(data.preferences.webSearchModel);
                    if (data.preferences.deepResearchModel) setDeepResearchModel(data.preferences.deepResearchModel);
                }
            })
            .catch(() => null);

        // Load chat feature preferences from localStorage
        const savedMemory = localStorage.getItem("maiachat-memory-enabled");
        if (savedMemory !== null) {
            setMemoryEnabled(savedMemory === "true");
        }
        const savedGemini = localStorage.getItem("maiachat-gemini-file-search");
        if (savedGemini !== null) {
            setGeminiFileSearchEnabled(savedGemini === "true");
        }
    }, []);

    // Handlers for chat feature toggles
    const handleMemoryEnabledChange = (enabled: boolean) => {
        setMemoryEnabled(enabled);
        localStorage.setItem("maiachat-memory-enabled", String(enabled));
    };

    const handleGeminiEnabledChange = (enabled: boolean) => {
        setGeminiFileSearchEnabled(enabled);
        localStorage.setItem("maiachat-gemini-file-search", String(enabled));
    };

    const saveWebSearchPreferences = async (newWebSearch?: string, newDeepResearch?: string) => {
        setIsSavingWebSearch(true);
        try {
            const body: Record<string, string> = {};
            if (newWebSearch !== undefined) body.webSearchModel = newWebSearch;
            if (newDeepResearch !== undefined) body.deepResearchModel = newDeepResearch;
            const res = await fetch("/api/user/preferences", {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                toast.success("Web search preferences saved");
            } else {
                toast.error("Failed to save preferences");
            }
        } catch {
            toast.error("Failed to save preferences");
        } finally {
            setIsSavingWebSearch(false);
        }
    };

    const checkLocalModels = async () => {
        try {
            setCheckingLocal(true);
            const response = await fetch("/api/models/local", { credentials: "include" });
            if (response.ok) {
                const data = await response.json();
                setLocalModels({
                    ollama: { available: data.ollama?.available || false, models: data.ollama?.models || [] },
                    lmstudio: { available: data.lmstudio?.available || false, models: data.lmstudio?.models || [] },
                });
            }
        } catch (error) {
            console.error("Check local models error:", error);
        } finally {
            setCheckingLocal(false);
        }
    };

    // Reset validation when provider or key changes
    useEffect(() => {
        setValidationStatus("none");
        setValidationError("");
    }, [selectedProvider, newApiKey]);

    const fetchKeys = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/api-keys", { credentials: "include" });
            if (!response.ok) throw new Error("Failed to fetch keys");
            const data = await response.json();
            setKeys(data.apiKeys || []);
        } catch (error) {
            console.error("Fetch keys error:", error);
            toast.error("Failed to load API keys");
        } finally {
            setIsLoading(false);
        }
    };

    const handleValidateKey = async () => {
        if (!newApiKey.trim()) return;

        try {
            setIsValidating(true);
            setValidationStatus("none");
            setValidationError("");

            const response = await fetch("/api/api-keys/validate", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: selectedProvider,
                    apiKey: newApiKey.trim(),
                }),
            });

            const data = await response.json();

            if (data.valid) {
                setValidationStatus("valid");
                toast.success("API key is valid!");
            } else {
                setValidationStatus("invalid");
                setValidationError(data.error || "Invalid API key");
                toast.error(data.error || "Invalid API key");
            }
        } catch (error) {
            console.error("Validate key error:", error);
            setValidationStatus("invalid");
            setValidationError("Failed to validate key");
            toast.error("Failed to validate API key");
        } finally {
            setIsValidating(false);
        }
    };

    const handleAddKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newApiKey.trim()) return;

        try {
            setIsSaving(true);
            const response = await fetch("/api/api-keys", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: selectedProvider,
                    apiKey: newApiKey.trim(),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to save API key");
            }

            toast.success(data.message || "API key saved");
            setNewApiKey("");
            setValidationStatus("none");
            fetchKeys(); // Refresh the list
        } catch (error) {
            console.error("Save key error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to save API key");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteKey = async (provider: string) => {
        try {
            const response = await fetch(`/api/api-keys?provider=${provider}`, {
                method: "DELETE",
                credentials: "include",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to delete API key");
            }

            toast.success("API key deleted");
            fetchKeys(); // Refresh the list
        } catch (error) {
            console.error("Delete key error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to delete API key");
        }
    };

    const getProviderWebsite = (providerId: string) => {
        return PROVIDERS[providerId]?.website || "#";
    };

    const existingProviders = keys.map((k) => k.provider);

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground mt-1">
                    Manage your API keys and preferences
                </p>
            </div>

            {/* API Keys Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Key className="h-5 w-5" />
                        API Keys
                    </CardTitle>
                    <CardDescription>
                        Add your API keys to use different AI providers. Keys are encrypted and stored securely.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Add New Key Form */}
                    <form onSubmit={handleAddKey} className="space-y-4" suppressHydrationWarning>
                        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                            <div className="space-y-2">
                                <Label htmlFor="provider">Provider</Label>
                                <Select
                                    value={selectedProvider}
                                    onValueChange={(v) => setSelectedProvider(v as ProviderId)}
                                >
                                    <SelectTrigger id="provider">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CLOUD_PROVIDERS.map((id) => {
                                            const provider = PROVIDERS[id];
                                            return (
                                                <SelectItem key={id} value={id}>
                                                    <div className="flex items-center gap-2">
                                                        <span>{provider.name}</span>
                                                        {existingProviders.includes(id) && (
                                                            <Check className="h-3 w-3 text-green-500" />
                                                        )}
                                                    </div>
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>

                                {/* Anthropic Auth Mode Info */}
                                {selectedProvider === "anthropic" && (
                                    <div className="pt-2 text-xs text-amber-600 dark:text-amber-400">
                                        <p className="font-medium">Note: Claude subscription tokens no longer work with third-party apps.</p>
                                        <p className="text-muted-foreground mt-0.5">Use an API key from console.anthropic.com</p>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="apiKey">API Key</Label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Input
                                            id="apiKey"
                                            type="password"
                                            placeholder="Enter your API key"
                                            value={newApiKey}
                                            onChange={(e) => setNewApiKey(e.target.value)}
                                            className="font-mono pr-10"
                                        />
                                        {validationStatus !== "none" && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                {validationStatus === "valid" ? (
                                                    <ShieldCheck className="h-4 w-4 text-green-500" />
                                                ) : (
                                                    <ShieldX className="h-4 w-4 text-red-500" />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleValidateKey}
                                        disabled={isValidating || !newApiKey.trim()}
                                    >
                                        {isValidating ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            "Validate"
                                        )}
                                    </Button>
                                </div>
                                {validationStatus === "invalid" && validationError && (
                                    <p className="text-xs text-red-500">{validationError}</p>
                                )}
                                {validationStatus === "valid" && (
                                    <p className="text-xs text-green-500">✓ API key validated successfully</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                                Get your API key from{" "}
                                <a
                                    href={getProviderWebsite(selectedProvider)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline inline-flex items-center gap-1"
                                >
                                    {PROVIDERS[selectedProvider]?.name} <ExternalLink className="h-3 w-3" />
                                </a>
                            </p>
                            <Button type="submit" disabled={isSaving || !newApiKey.trim()}>
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="h-4 w-4 mr-2" />
                                        {existingProviders.includes(selectedProvider) ? "Update Key" : "Add Key"}
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>

                    {/* Existing Keys List */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium">Your API Keys</h3>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : keys.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No API keys configured yet.</p>
                                <p className="text-sm">Add an API key above to get started.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {keys.map((key) => (
                                    <div
                                        key={key.id}
                                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Badge
                                                variant="secondary"
                                                className={providerColors[key.provider as ProviderId]}
                                            >
                                                {PROVIDERS[key.provider]?.name || key.provider}
                                            </Badge>
                                            <span className="font-mono text-sm text-muted-foreground">
                                                {key.keyHint}
                                            </span>
                                            {key.isActive && (
                                                <Badge variant="outline" className="text-green-600">
                                                    Active
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {key.lastUsedAt && (
                                                <span className="text-xs text-muted-foreground">
                                                    Last used: {new Date(key.lastUsedAt).toLocaleDateString()}
                                                </span>
                                            )}
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Are you sure you want to delete your {PROVIDERS[key.provider]?.name} API key?
                                                            You will need to add it again to use this provider.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() => handleDeleteKey(key.provider)}
                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        >
                                                            Delete
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Local Models Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Cpu className="h-5 w-5" />
                        Local Models
                    </CardTitle>
                    <CardDescription>
                        Run AI models locally with Ollama or LM Studio. No API keys required.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {checkingLocal ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Checking local services...
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Ollama Status */}
                            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                                <div className="flex items-center gap-3">
                                    <Badge variant="secondary" className={providerColors.ollama}>
                                        Ollama
                                    </Badge>
                                    {localModels.ollama.available ? (
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                                            <span className="text-sm text-green-600">
                                                Running ({localModels.ollama.models.length} model{localModels.ollama.models.length !== 1 ? "s" : ""})
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <XCircle className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm text-muted-foreground">Not running</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <a
                                        href="https://ollama.ai"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-primary hover:underline flex items-center gap-1"
                                    >
                                        Get Ollama <ExternalLink className="h-3 w-3" />
                                    </a>
                                    <Button variant="outline" size="sm" onClick={checkLocalModels}>
                                        Refresh
                                    </Button>
                                </div>
                            </div>

                            {/* LM Studio Status */}
                            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                                <div className="flex items-center gap-3">
                                    <Badge variant="secondary" className={providerColors.lmstudio}>
                                        LM Studio
                                    </Badge>
                                    {localModels.lmstudio.available ? (
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                                            <span className="text-sm text-green-600">
                                                Running ({localModels.lmstudio.models.length} model{localModels.lmstudio.models.length !== 1 ? "s" : ""})
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <XCircle className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm text-muted-foreground">Not running</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <a
                                        href="https://lmstudio.ai"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-primary hover:underline flex items-center gap-1"
                                    >
                                        Get LM Studio <ExternalLink className="h-3 w-3" />
                                    </a>
                                    <Button variant="outline" size="sm" onClick={checkLocalModels}>
                                        Refresh
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Start Ollama with <code className="bg-muted px-1 rounded">ollama serve</code> or launch LM Studio and load a model. Local models will appear in the chat model selector.
                    </p>
                </CardContent>
            </Card>

            {/* Chat Features Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        Chat Features
                    </CardTitle>
                    <CardDescription>
                        Configure AI memory and file search capabilities for your conversations
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Memory Toggle */}
                    <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-muted/30">
                        <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                                <Brain className="h-4 w-4 text-purple-500" />
                                <Label htmlFor="memory-toggle" className="font-medium cursor-pointer">
                                    Conversation Memory
                                </Label>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Enable AI to remember and recall information from your past conversations.
                                When enabled, conversation summaries are automatically saved to your personal
                                memory store, allowing the AI to provide more personalized and contextually
                                relevant responses based on your history.
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                                Requires a Google API key for Gemini file search storage.
                            </p>
                        </div>
                        <Switch
                            id="memory-toggle"
                            checked={memoryEnabled}
                            onCheckedChange={handleMemoryEnabledChange}
                        />
                    </div>

                    {/* Gemini File Search Toggle */}
                    <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-muted/30">
                        <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-blue-500" />
                                <Label htmlFor="gemini-toggle" className="font-medium cursor-pointer">
                                    Gemini File Search
                                </Label>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Enable AI to search through your uploaded documents using Google&apos;s Gemini
                                file search technology. This provides advanced semantic search across your
                                document stores, allowing the AI to find and reference relevant information
                                from your files during conversations.
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                                Requires a Google API key. Manage document stores in the Documents section.
                            </p>
                        </div>
                        <Switch
                            id="gemini-toggle"
                            checked={geminiFileSearchEnabled}
                            onCheckedChange={handleGeminiEnabledChange}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Web Search Configuration */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Search className="h-5 w-5" />
                        Web Search Configuration
                    </CardTitle>
                    <CardDescription>
                        Choose which AI model powers web searches and deep research. Requires the corresponding API key to be configured above.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Web Search Model */}
                    <div className="space-y-2">
                        <Label htmlFor="web-search-model">Web Search Model</Label>
                        <p className="text-sm text-muted-foreground">
                            Used for all web search queries from chat and agents.
                        </p>
                        <Select
                            value={webSearchModel}
                            onValueChange={(value) => {
                                setWebSearchModel(value);
                                saveWebSearchPreferences(value, undefined);
                            }}
                            disabled={isSavingWebSearch}
                        >
                            <SelectTrigger id="web-search-model" className="w-full">
                                <SelectValue placeholder="Select web search model" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto">Auto (Perplexity → Gemini → DuckDuckGo)</SelectItem>
                                <SelectItem value="perplexity-sonar">Perplexity Sonar (fast, with citations)</SelectItem>
                                <SelectItem value="perplexity-sonar-pro">Perplexity Sonar Pro (advanced search)</SelectItem>
                                <SelectItem value="gemini">Gemini Grounding (Google search)</SelectItem>
                                <SelectItem value="duckduckgo">DuckDuckGo (free, no API key)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Deep Research Model */}
                    <div className="space-y-2">
                        <Label htmlFor="deep-research-model">Deep Research Model</Label>
                        <p className="text-sm text-muted-foreground">
                            Used when you ask the AI to perform in-depth research on a topic. Perplexity Deep Research conducts multi-step investigation across many sources.
                        </p>
                        <Select
                            value={deepResearchModel}
                            onValueChange={(value) => {
                                setDeepResearchModel(value);
                                saveWebSearchPreferences(undefined, value);
                            }}
                            disabled={isSavingWebSearch}
                        >
                            <SelectTrigger id="deep-research-model" className="w-full">
                                <SelectValue placeholder="Select deep research model" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Disabled (use regular search)</SelectItem>
                                <SelectItem value="perplexity-sonar-deep-research">Perplexity Deep Research (multi-step agent)</SelectItem>
                                <SelectItem value="perplexity-sonar-reasoning-pro">Perplexity Reasoning Pro (chain-of-thought search)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Tip: You can also ask the AI to change these settings in chat, e.g. &quot;Switch my web search to Perplexity Sonar Pro&quot;
                    </p>
                </CardContent>
            </Card>

            {/* AI Skills Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        AI Skills
                    </CardTitle>
                    <CardDescription>
                        Enable community skills to give your AI assistant additional capabilities
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row">
                    <Link href="/settings/skills">
                        <Button variant="outline">
                            <Sparkles className="h-4 w-4 mr-2" />
                            Manage AI Skills
                        </Button>
                    </Link>
                </CardContent>
            </Card>

            {/* Integrations Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Plug className="h-5 w-5" />
                        Integrations
                    </CardTitle>
                    <CardDescription>
                        Connect external services like Gmail and Calendar to enhance your AI assistant
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row">
                    <Link href="/settings/integrations">
                        <Button variant="outline">
                            <Plug className="h-4 w-4 mr-2" />
                            Manage Integrations
                        </Button>
                    </Link>
                </CardContent>
            </Card>

            {/* Workflows Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Workflow className="h-5 w-5" />
                        Workflows
                    </CardTitle>
                    <CardDescription>
                        Create automated pipelines with approval gates for complex tasks
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row">
                    <Link href="/settings/workflows">
                        <Button variant="outline">
                            <Workflow className="h-4 w-4 mr-2" />
                            Manage Workflows
                        </Button>
                    </Link>
                </CardContent>
            </Card>

            {/* Content Humanizer Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Eraser className="h-5 w-5" />
                        Content Humanizer
                    </CardTitle>
                    <CardDescription>
                        Remove AI-sounding patterns from responses. Configure intensity per-profile or per-channel.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row">
                    <Link href="/settings/humanizer">
                        <Button variant="outline">
                            <Eraser className="h-4 w-4 mr-2" />
                            Configure Humanizer
                        </Button>
                    </Link>
                </CardContent>
            </Card>

            {/* Media Generation Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Image className="h-5 w-5" />
                        Media Generation
                    </CardTitle>
                    <CardDescription>
                        Configure default providers and preferences for AI image generation
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row">
                    <Link href="/settings/media">
                        <Button variant="outline">
                            <Image className="h-4 w-4 mr-2" />
                            Media Settings
                        </Button>
                    </Link>
                </CardContent>
            </Card>

            {/* Cost Management Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5" />
                        Cost Management
                    </CardTitle>
                    <CardDescription>
                        Set monthly budgets, enable cost-aware model routing, and track API spending
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row">
                    <Link href="/settings/cost">
                        <Button variant="outline">
                            <DollarSign className="h-4 w-4 mr-2" />
                            Manage Costs
                        </Button>
                    </Link>
                </CardContent>
            </Card>

            {/* Backups Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Backups & Health
                    </CardTitle>
                    <CardDescription>
                        Automated backups, system health monitoring, and prompt auditing
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row">
                    <Link href="/settings/backups">
                        <Button variant="outline">
                            <Database className="h-4 w-4 mr-2" />
                            Manage Backups
                        </Button>
                    </Link>
                </CardContent>
            </Card>

            {/* My Data (Privacy) Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        My Data & Privacy
                    </CardTitle>
                    <CardDescription>
                        View and manage personal information learned by AI agents
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row">
                    <Link href="/settings/my-data">
                        <Button variant="outline">View My Data</Button>
                    </Link>
                    <Link href="/settings/memory">
                        <Button variant="ghost">
                            <Brain className="h-4 w-4 mr-2" />
                            Conversation Memory
                        </Button>
                    </Link>
                </CardContent>
            </Card>

            {isAuthenticated && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5" />
                            Admin Panel
                        </CardTitle>
                        <CardDescription>
                            {isAdmin
                                ? "Manage users, analytics, visitors, and system settings"
                                : "Admin access required to view this panel"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 sm:flex-row">
                        {isAdmin ? (
                            <>
                                <Link href="/admin">
                                    <Button>Open Admin Dashboard</Button>
                                </Link>
                                <Link href="/admin/settings">
                                    <Button variant="outline">Admin Settings</Button>
                                </Link>
                            </>
                        ) : (
                            <Button variant="outline" disabled>
                                Admin access required
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">About API Keys</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>
                        • API keys are encrypted using AES-256-GCM before storage
                    </p>
                    <p>
                        • Keys are never exposed in the browser - only the last 4 characters are shown
                    </p>
                    <p>
                        • Use the &quot;Validate&quot; button to test your key before saving
                    </p>
                    <p>
                        • You can use environment variables for server-side keys (recommended for production)
                    </p>
                    <p>
                        • User-provided keys take priority over environment variables
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
