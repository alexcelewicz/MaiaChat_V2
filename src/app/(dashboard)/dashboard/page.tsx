import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MessageSquare, Plus, Key, Bot, Settings } from "lucide-react";
import { UsageDashboard } from "@/components/dashboard/UsageDashboard";

export default function DashboardPage() {
    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground">Overview of your usage and quick actions</p>
                </div>
                <Button asChild>
                    <Link href="/chat">
                        <Plus className="mr-2 h-4 w-4" />
                        New Chat
                    </Link>
                </Button>
            </div>

            {/* Quick Actions */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <Link href="/chat">
                        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <MessageSquare className="h-5 w-5 text-primary" />
                            </div>
                            <CardTitle className="text-base font-medium">Start Chat</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Begin a new conversation with AI
                            </p>
                        </CardContent>
                    </Link>
                </Card>

                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <Link href="/settings">
                        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                            <div className="p-2 rounded-lg bg-green-500/10">
                                <Key className="h-5 w-5 text-green-600" />
                            </div>
                            <CardTitle className="text-base font-medium">API Keys</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Configure your AI provider keys
                            </p>
                        </CardContent>
                    </Link>
                </Card>

                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <Link href="/agents">
                        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                            <div className="p-2 rounded-lg bg-purple-500/10">
                                <Bot className="h-5 w-5 text-purple-600" />
                            </div>
                            <CardTitle className="text-base font-medium">Agents</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Manage custom AI agents
                            </p>
                        </CardContent>
                    </Link>
                </Card>

                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <Link href="/settings">
                        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                            <div className="p-2 rounded-lg bg-orange-500/10">
                                <Settings className="h-5 w-5 text-orange-600" />
                            </div>
                            <CardTitle className="text-base font-medium">Settings</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Customize your experience
                            </p>
                        </CardContent>
                    </Link>
                </Card>
            </div>

            {/* Usage Dashboard */}
            <div className="mt-8">
                <h2 className="text-xl font-semibold mb-4">Usage & Cost Tracking</h2>
                <UsageDashboard />
            </div>
        </div>
    );
}
