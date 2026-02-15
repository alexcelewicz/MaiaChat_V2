export const dynamic = 'force-dynamic';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { usageRecords, users, conversations, messages } from "@/lib/db/schema";
import { sql, gte, desc, eq } from "drizzle-orm";
import {
    TrendingUp,
    Users,
    MessageSquare,
    DollarSign,
    Zap,
} from "lucide-react";

async function getAnalyticsData() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Usage by provider (last 30 days)
    const usageByProvider = await db
        .select({
            provider: usageRecords.provider,
            totalInputTokens: sql<number>`sum(input_tokens)`,
            totalOutputTokens: sql<number>`sum(output_tokens)`,
            totalCost: sql<number>`sum(cost_usd_cents_e6)`,
            requestCount: sql<number>`count(*)`,
        })
        .from(usageRecords)
        .where(gte(usageRecords.createdAt, thirtyDaysAgo))
        .groupBy(usageRecords.provider);

    // Top models by usage
    const topModels = await db
        .select({
            model: usageRecords.model,
            provider: usageRecords.provider,
            totalTokens: sql<number>`sum(input_tokens + output_tokens)`,
            requestCount: sql<number>`count(*)`,
        })
        .from(usageRecords)
        .where(gte(usageRecords.createdAt, thirtyDaysAgo))
        .groupBy(usageRecords.model, usageRecords.provider)
        .orderBy(desc(sql`sum(input_tokens + output_tokens)`))
        .limit(5);

    // Active users (last 7 days)
    const activeUsersResult = await db
        .select({ userId: conversations.userId })
        .from(conversations)
        .where(gte(conversations.createdAt, sevenDaysAgo))
        .groupBy(conversations.userId);

    // Daily message counts (last 7 days)
    const dailyMessages = await db
        .select({
            date: sql<string>`date(created_at)`,
            count: sql<number>`count(*)`,
        })
        .from(messages)
        .where(gte(messages.createdAt, sevenDaysAgo))
        .groupBy(sql`date(created_at)`)
        .orderBy(sql`date(created_at)`);

    // Total tokens (last 30 days)
    const totalTokensResult = await db
        .select({
            totalInput: sql<number>`sum(input_tokens)`,
            totalOutput: sql<number>`sum(output_tokens)`,
        })
        .from(usageRecords)
        .where(gte(usageRecords.createdAt, thirtyDaysAgo));

    const totalInput = Number(totalTokensResult[0]?.totalInput || 0);
    const totalOutput = Number(totalTokensResult[0]?.totalOutput || 0);

    return {
        usageByProvider: usageByProvider.map(p => ({
            provider: p.provider,
            inputTokens: Number(p.totalInputTokens || 0),
            outputTokens: Number(p.totalOutputTokens || 0),
            cost: Number(p.totalCost || 0) / 1_000_000,
            requests: Number(p.requestCount || 0),
        })),
        topModels: topModels.map(m => ({
            model: m.model,
            provider: m.provider,
            totalTokens: Number(m.totalTokens || 0),
            requests: Number(m.requestCount || 0),
        })),
        activeUsers: activeUsersResult.length,
        dailyMessages: dailyMessages.map(d => ({
            date: d.date,
            count: Number(d.count || 0),
        })),
        totalTokens: {
            input: totalInput,
            output: totalOutput,
            total: totalInput + totalOutput,
        },
    };
}

function formatNumber(num: number): string {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
}

export default async function AdminAnalyticsPage() {
    const data = await getAnalyticsData();

    return (
        <div className="p-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
                <p className="text-muted-foreground mt-1">
                    Usage statistics and trends (last 30 days)
                </p>
            </div>

            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
                        <Zap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatNumber(data.totalTokens.total)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {formatNumber(data.totalTokens.input)} in / {formatNumber(data.totalTokens.output)} out
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Active Users (7d)</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.activeUsers}</div>
                        <p className="text-xs text-muted-foreground">
                            Users with conversations
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${data.usageByProvider.reduce((sum, p) => sum + p.cost, 0).toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            API provider costs
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">API Requests</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatNumber(data.usageByProvider.reduce((sum, p) => sum + p.requests, 0))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Total API calls
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Usage by Provider */}
            <Card>
                <CardHeader>
                    <CardTitle>Usage by Provider</CardTitle>
                    <CardDescription>Token usage and costs per AI provider</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {data.usageByProvider.length === 0 ? (
                            <p className="text-muted-foreground text-center py-4">No usage data yet</p>
                        ) : (
                            data.usageByProvider.map((provider) => (
                                <div
                                    key={provider.provider}
                                    className="flex items-center justify-between p-4 border rounded-lg"
                                >
                                    <div className="flex items-center gap-4">
                                        <Badge variant="outline">{provider.provider}</Badge>
                                        <div>
                                            <p className="text-sm font-medium">
                                                {formatNumber(provider.inputTokens + provider.outputTokens)} tokens
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {provider.requests.toLocaleString()} requests
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium">${provider.cost.toFixed(2)}</p>
                                        <p className="text-xs text-muted-foreground">cost</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Top Models */}
            <Card>
                <CardHeader>
                    <CardTitle>Top Models</CardTitle>
                    <CardDescription>Most used AI models by token count</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {data.topModels.length === 0 ? (
                            <p className="text-muted-foreground text-center py-4">No model data yet</p>
                        ) : (
                            data.topModels.map((model, index) => (
                                <div
                                    key={model.model}
                                    className="flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-lg font-bold text-muted-foreground">
                                            #{index + 1}
                                        </span>
                                        <div>
                                            <p className="text-sm font-medium">{model.model}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {model.provider}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium">
                                            {formatNumber(model.totalTokens)} tokens
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {model.requests.toLocaleString()} requests
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Daily Messages Chart (simplified) */}
            <Card>
                <CardHeader>
                    <CardTitle>Daily Activity (7d)</CardTitle>
                    <CardDescription>Messages per day</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-end gap-2 h-40">
                        {data.dailyMessages.map((day) => {
                            const maxCount = Math.max(...data.dailyMessages.map(d => d.count), 1);
                            const height = (day.count / maxCount) * 100;
                            return (
                                <div
                                    key={day.date}
                                    className="flex-1 flex flex-col items-center gap-1"
                                >
                                    <div
                                        className="w-full bg-primary rounded-t"
                                        style={{ height: `${height}%`, minHeight: day.count > 0 ? "4px" : "0" }}
                                    />
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(day.date).toLocaleDateString(undefined, { weekday: "short" })}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
