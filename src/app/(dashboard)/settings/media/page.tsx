"use client";

import { useEffect, useMemo, useState } from "react";
import NextImage from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Image as ImageIcon, Sparkles, Settings2, BarChart3, ImageOff, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface MediaHistoryItem {
    key: string;
    url: string;
    sizeBytes: number;
    createdAt: string;
    provider: string | null;
    model: string | null;
    prompt: string | null;
    action: string;
}

interface MediaUsage {
    totalImages: number;
    totalBytes: number;
    mostUsedProvider: string | null;
}

interface MediaSettingsResponse {
    settings: {
        provider: "auto" | "openai" | "gemini" | "openrouter";
        quality: "standard" | "hd";
        size: "256x256" | "512x512" | "1024x1024" | "1024x1792" | "1792x1024";
        style: "natural" | "vivid";
        saveHistory: boolean;
    };
    history: MediaHistoryItem[];
    usage: MediaUsage;
}

function formatBytes(bytes: number): string {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exp);
    return `${value.toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

export default function MediaGenerationPage() {
    const [provider, setProvider] = useState<MediaSettingsResponse["settings"]["provider"]>("auto");
    const [quality, setQuality] = useState<MediaSettingsResponse["settings"]["quality"]>("standard");
    const [size, setSize] = useState<MediaSettingsResponse["settings"]["size"]>("1024x1024");
    const [style, setStyle] = useState<MediaSettingsResponse["settings"]["style"]>("natural");
    const [saveHistory, setSaveHistory] = useState(true);
    const [history, setHistory] = useState<MediaHistoryItem[]>([]);
    const [usage, setUsage] = useState<MediaUsage>({
        totalImages: 0,
        totalBytes: 0,
        mostUsedProvider: null,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const mostRecentHistory = useMemo(
        () => [...history].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [history]
    );

    async function loadMediaSettings() {
        try {
            setLoading(true);
            const response = await fetch("/api/settings/media", { credentials: "include" });
            if (!response.ok) {
                throw new Error("Failed to load media settings");
            }

            const data = (await response.json()) as MediaSettingsResponse;
            setProvider(data.settings.provider);
            setQuality(data.settings.quality);
            setSize(data.settings.size);
            setStyle(data.settings.style);
            setSaveHistory(data.settings.saveHistory);
            setHistory(data.history || []);
            setUsage(data.usage || { totalImages: 0, totalBytes: 0, mostUsedProvider: null });
        } catch (error) {
            console.error("[Media Settings] Load error:", error);
            toast.error("Failed to load media settings");
        } finally {
            setLoading(false);
        }
    }

    async function saveMediaSettings() {
        try {
            setSaving(true);
            const response = await fetch("/api/settings/media", {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider,
                    quality,
                    size,
                    style,
                    saveHistory,
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to save media settings");
            }

            toast.success("Media settings saved");
        } catch (error) {
            console.error("[Media Settings] Save error:", error);
            toast.error("Failed to save media settings");
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        void loadMediaSettings();
    }, []);

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4 space-y-8">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Media Generation</h1>
                    <p className="text-muted-foreground mt-1">
                        Configure default image generation behavior and review your output history.
                    </p>
                </div>
                <Button onClick={saveMediaSettings} disabled={saving || loading}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Settings
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings2 className="h-5 w-5" />
                        Generation Defaults
                    </CardTitle>
                    <CardDescription>
                        These defaults are used when the image tool is called without explicit overrides.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="provider-select" className="text-sm font-medium">
                                Default Provider
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Auto prioritizes OpenAI, then Gemini, then OpenRouter based on your API keys.
                            </p>
                        </div>
                        <Select value={provider} onValueChange={(value) => setProvider(value as typeof provider)}>
                            <SelectTrigger id="provider-select" className="w-[180px]">
                                <SelectValue placeholder="Select provider" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto">
                                    <span className="flex items-center gap-2">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                        Auto
                                    </span>
                                </SelectItem>
                                <SelectItem value="openai">OpenAI (gpt-image-1)</SelectItem>
                                <SelectItem value="gemini">Google Gemini</SelectItem>
                                <SelectItem value="openrouter">OpenRouter</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="border-t" />

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="quality-select" className="text-sm font-medium">
                                Default Quality
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                HD gives better detail but increases cost and generation time.
                            </p>
                        </div>
                        <Select value={quality} onValueChange={(value) => setQuality(value as typeof quality)}>
                            <SelectTrigger id="quality-select" className="w-[180px]">
                                <SelectValue placeholder="Select quality" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="standard">
                                    <span className="flex items-center gap-2">
                                        Standard
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                            1x
                                        </Badge>
                                    </span>
                                </SelectItem>
                                <SelectItem value="hd">
                                    <span className="flex items-center gap-2">
                                        HD
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                            2x
                                        </Badge>
                                    </span>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="border-t" />

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="size-select" className="text-sm font-medium">
                                Default Size
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Large sizes improve detail but can significantly increase cost.
                            </p>
                        </div>
                        <Select value={size} onValueChange={(value) => setSize(value as typeof size)}>
                            <SelectTrigger id="size-select" className="w-[180px]">
                                <SelectValue placeholder="Select size" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="256x256">256 x 256</SelectItem>
                                <SelectItem value="512x512">512 x 512</SelectItem>
                                <SelectItem value="1024x1024">1024 x 1024</SelectItem>
                                <SelectItem value="1024x1792">1024 x 1792 (Portrait)</SelectItem>
                                <SelectItem value="1792x1024">1792 x 1024 (Landscape)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="border-t" />

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="style-select" className="text-sm font-medium">
                                Default Style
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Natural favors realism. Vivid favors dramatic/artistic outputs.
                            </p>
                        </div>
                        <Select value={style} onValueChange={(value) => setStyle(value as typeof style)}>
                            <SelectTrigger id="style-select" className="w-[180px]">
                                <SelectValue placeholder="Select style" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="natural">Natural</SelectItem>
                                <SelectItem value="vivid">Vivid</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="border-t" />

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="history-toggle" className="text-sm font-medium">
                                Save Generation History
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Disable to store generated images in a temporary prefix excluded from gallery history.
                            </p>
                        </div>
                        <Switch
                            id="history-toggle"
                            checked={saveHistory}
                            onCheckedChange={setSaveHistory}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5" />
                        Generation History
                    </CardTitle>
                    <CardDescription>
                        Recent images generated through the image tool.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-10 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
                            Loading history...
                        </div>
                    ) : mostRecentHistory.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <ImageOff className="h-10 w-10 mx-auto mb-3 opacity-40" />
                            <p className="font-medium">No generated images yet</p>
                            <p className="text-sm mt-1">
                                Generated images will appear here when history saving is enabled.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {mostRecentHistory.map((item) => (
                                <a
                                    key={item.key}
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group rounded-lg border overflow-hidden bg-muted/10 hover:bg-muted/20 transition-colors"
                                >
                                    <div className="aspect-square bg-muted/40">
                                        <NextImage
                                            src={item.url}
                                            alt={item.prompt || "Generated image"}
                                            width={512}
                                            height={512}
                                            unoptimized
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                    <div className="p-3 space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <Badge variant="outline" className="text-[10px]">
                                                {(item.provider || "unknown").toUpperCase()}
                                            </Badge>
                                            <span className="text-[11px] text-muted-foreground">
                                                {formatBytes(item.sizeBytes)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                            {item.prompt || "No prompt metadata"}
                                        </p>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Usage Snapshot
                    </CardTitle>
                    <CardDescription>
                        Current totals based on your stored generation history.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid sm:grid-cols-3 gap-4">
                        <div className="p-4 rounded-lg border bg-muted/30 text-center">
                            <div className="text-2xl font-bold">{usage.totalImages.toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground mt-1">Images Stored</div>
                        </div>
                        <div className="p-4 rounded-lg border bg-muted/30 text-center">
                            <div className="text-2xl font-bold">{formatBytes(usage.totalBytes)}</div>
                            <div className="text-xs text-muted-foreground mt-1">Storage Used</div>
                        </div>
                        <div className="p-4 rounded-lg border bg-muted/30 text-center">
                            <div className="text-2xl font-bold">
                                {usage.mostUsedProvider ? usage.mostUsedProvider.toUpperCase() : "--"}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">Most Used Provider</div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
