export const dynamic = 'force-dynamic';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { users, conversations, messages, documents, usageRecords } from "@/lib/db/schema";
import { sql, gte } from "drizzle-orm";
import {
    Users,
    MessageSquare,
    Files,
    Activity,
    DollarSign,
    TrendingUp,
} from "lucide-react";

async function getDashboardStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Total users
    const totalUsersResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(users);
    const totalUsers = Number(totalUsersResult[0]?.count || 0);

    // New users (last 7 days)
    const newUsersResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(gte(users.createdAt, sevenDaysAgo));
    const newUsers = Number(newUsersResult[0]?.count || 0);

    // Total conversations
    const totalConversationsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversations);
    const totalConversations = Number(totalConversationsResult[0]?.count || 0);

    // Total messages
    const totalMessagesResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages);
    const totalMessages = Number(totalMessagesResult[0]?.count || 0);

    // Total documents
    const totalDocsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(documents);
    const totalDocs = Number(totalDocsResult[0]?.count || 0);

    // Usage cost (last 30 days) - stored in micro-cents
    const usageCostResult = await db
        .select({ total: sql<number>`sum(cost_usd_cents_e6)` })
        .from(usageRecords)
        .where(gte(usageRecords.createdAt, thirtyDaysAgo));
    const usageCostMicroCents = Number(usageCostResult[0]?.total || 0);
    const usageCost = usageCostMicroCents / 1_000_000; // Convert to dollars

    return {
        totalUsers,
        newUsers,
        totalConversations,
        totalMessages,
        totalDocs,
        usageCost,
    };
}

export default async function AdminDashboardPage() {
    const stats = await getDashboardStats();

    return (
        <div className="p-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-muted-foreground mt-1">
                    Overview of your application&apos;s performance
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Users
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalUsers.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            +{stats.newUsers} this week
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">
                            Conversations
                        </CardTitle>
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalConversations.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.totalMessages.toLocaleString()} total messages
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">
                            Documents
                        </CardTitle>
                        <Files className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalDocs.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            Uploaded for RAG
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">
                            API Cost (30d)
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${stats.usageCost.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            AI provider costs
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">
                            System Status
                        </CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                                Operational
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            All systems running
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">
                            Active Features
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-1">
                            <Badge variant="secondary" className="text-xs">Multi-Agent</Badge>
                            <Badge variant="secondary" className="text-xs">RAG</Badge>
                            <Badge variant="secondary" className="text-xs">Tools</Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions */}
            <Card>
                <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                    <CardDescription>Common administrative tasks</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <a href="/admin/users" className="block p-4 border rounded-lg hover:bg-muted transition-colors">
                        <Users className="h-8 w-8 mb-2 text-primary" />
                        <h3 className="font-medium">Manage Users</h3>
                        <p className="text-sm text-muted-foreground">View and edit user accounts</p>
                    </a>
                    <a href="/admin/logs" className="block p-4 border rounded-lg hover:bg-muted transition-colors">
                        <Activity className="h-8 w-8 mb-2 text-primary" />
                        <h3 className="font-medium">View Logs</h3>
                        <p className="text-sm text-muted-foreground">Monitor system activity</p>
                    </a>
                    <a href="/admin/analytics" className="block p-4 border rounded-lg hover:bg-muted transition-colors">
                        <TrendingUp className="h-8 w-8 mb-2 text-primary" />
                        <h3 className="font-medium">Analytics</h3>
                        <p className="text-sm text-muted-foreground">Usage statistics and trends</p>
                    </a>
                    <a href="/admin/visitors" className="block p-4 border rounded-lg hover:bg-muted transition-colors">
                        <TrendingUp className="h-8 w-8 mb-2 text-primary" />
                        <h3 className="font-medium">Visitors</h3>
                        <p className="text-sm text-muted-foreground">Traffic and IP insights</p>
                    </a>
                    <a href="/admin/system" className="block p-4 border rounded-lg hover:bg-muted transition-colors">
                        <Activity className="h-8 w-8 mb-2 text-primary" />
                        <h3 className="font-medium">System Health</h3>
                        <p className="text-sm text-muted-foreground">Monitor infrastructure</p>
                    </a>
                </CardContent>
            </Card>
        </div>
    );
}
