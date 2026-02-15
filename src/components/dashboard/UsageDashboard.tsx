"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
    Coins,
    Zap,
    BarChart3,
    TrendingUp,
    Loader2,
    RefreshCw,
    Calendar,
} from "lucide-react";
import { PROVIDERS } from "@/lib/ai/models";
import type { ProviderId } from "@/lib/ai/providers/types";

interface UsageSummary {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCostUsd: number;
    messageCount: number;
}

interface UsageBreakdown {
    provider?: string;
    model?: string;
    date?: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    costUsd: number;
    count: number;
}

interface UsageData {
    success: boolean;
    summary: UsageSummary;
    breakdown: UsageBreakdown[];
    groupBy: string;
}

// Provider colors for future chart visualization
// const providerColors: Record<ProviderId, string> = {
//     openai: "bg-green-500",
//     anthropic: "bg-orange-500",
//     google: "bg-blue-500",
//     xai: "bg-gray-500",
//     openrouter: "bg-purple-500",
// };

function formatNumber(num: number): string {
    if (num >= 1_000_000) {
        return (num / 1_000_000).toFixed(1) + "M";
    }
    if (num >= 1_000) {
        return (num / 1_000).toFixed(1) + "K";
    }
    return num.toString();
}

function formatCost(cost: number): string {
    if (cost < 0.01) {
        return `$${(cost * 100).toFixed(2)}¢`;
    }
    return `$${cost.toFixed(4)}`;
}

export function UsageDashboard() {
    const [data, setData] = useState<UsageData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [groupBy, setGroupBy] = useState<string>("provider");
    const [dateRange, setDateRange] = useState<string>("30d");

    const fetchUsage = async () => {
        try {
            setIsLoading(true);

            // Calculate date range
            let startDate: string | undefined;
            const now = new Date();
            
            if (dateRange === "7d") {
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            } else if (dateRange === "30d") {
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
            } else if (dateRange === "90d") {
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
            }

            const params = new URLSearchParams({ groupBy });
            if (startDate) params.append("startDate", startDate);

            const response = await fetch(`/api/usage?${params}`);
            if (!response.ok) throw new Error("Failed to fetch usage");
            const result = await response.json();
            setData(result);
        } catch (error) {
            console.error("Fetch usage error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUsage();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupBy, dateRange]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <p>Failed to load usage data</p>
                <Button variant="outline" onClick={fetchUsage} className="mt-4">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                </Button>
            </div>
        );
    }

    const { summary, breakdown } = data;
    const totalCost = summary.totalCostUsd;
    const maxCost = breakdown.length > 0 
        ? Math.max(...breakdown.map((b) => b.costUsd)) 
        : 0;

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Select value={dateRange} onValueChange={setDateRange}>
                        <SelectTrigger className="w-[140px]">
                            <Calendar className="h-4 w-4 mr-2" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7d">Last 7 days</SelectItem>
                            <SelectItem value="30d">Last 30 days</SelectItem>
                            <SelectItem value="90d">Last 90 days</SelectItem>
                            <SelectItem value="all">All time</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={groupBy} onValueChange={setGroupBy}>
                        <SelectTrigger className="w-[140px]">
                            <BarChart3 className="h-4 w-4 mr-2" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="provider">By Provider</SelectItem>
                            <SelectItem value="model">By Model</SelectItem>
                            <SelectItem value="day">By Day</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <Button variant="outline" size="sm" onClick={fetchUsage}>
                    <RefreshCw className="h-4 w-4" />
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                        <Coins className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCost(totalCost)}</div>
                        <p className="text-xs text-muted-foreground">
                            {summary.messageCount} messages
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Input Tokens</CardTitle>
                        <Zap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatNumber(summary.totalInputTokens)}
                        </div>
                        <p className="text-xs text-muted-foreground">Prompts sent</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Output Tokens</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatNumber(summary.totalOutputTokens)}
                        </div>
                        <p className="text-xs text-muted-foreground">Responses received</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatNumber(summary.totalTokens)}
                        </div>
                        <p className="text-xs text-muted-foreground">Combined usage</p>
                    </CardContent>
                </Card>
            </div>

            {/* Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle>Usage Breakdown</CardTitle>
                    <CardDescription>
                        {groupBy === "provider" && "Cost breakdown by AI provider"}
                        {groupBy === "model" && "Cost breakdown by model"}
                        {groupBy === "day" && "Daily usage over time"}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {breakdown.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <p>No usage data for this period</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {breakdown.map((item, index) => {
                                const label = groupBy === "provider"
                                    ? PROVIDERS[item.provider as ProviderId]?.name || item.provider
                                    : groupBy === "model"
                                    ? item.model
                                    : item.date;

                                const percentage = maxCost > 0 ? (item.costUsd / maxCost) * 100 : 0;

                                return (
                                    <div key={index} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {item.provider && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-xs"
                                                    >
                                                        {PROVIDERS[item.provider as ProviderId]?.name || item.provider}
                                                    </Badge>
                                                )}
                                                <span className="text-sm font-medium">{label}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="font-medium">{formatCost(item.costUsd)}</span>
                                                <span className="text-xs text-muted-foreground ml-2">
                                                    ({item.count} msgs)
                                                </span>
                                            </div>
                                        </div>
                                        <Progress value={percentage} className="h-2" />
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>
                                                {formatNumber(item.inputTokens)} in / {formatNumber(item.outputTokens)} out
                                            </span>
                                            <span>
                                                {formatNumber(item.inputTokens + item.outputTokens)} total tokens
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
