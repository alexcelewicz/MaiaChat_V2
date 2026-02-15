"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Activity,
    AlertTriangle,
    Bell,
    CheckCircle,
    ChevronRight,
    Clock,
    Heart,
    HelpCircle,
    Info,
    Lightbulb,
    Loader2,
    MessageSquare,
    Play,
    Power,
    Radio,
    RefreshCw,
    Send,
    Server,
    Square,
    Zap,
} from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface DaemonInfo {
    agentKey: string;
    status: "running" | "stopped" | "error" | "starting" | "stopping";
    uptime: number | null;
    lastHeartbeat: number | null;
    processId: string | null;
    hostName: string | null;
    stats: {
        totalTasksRun: number;
        errorCount: number;
    };
}

interface ChannelStatus {
    type: string;
    connected: boolean;
    model?: string;
    provider?: string;
    lastError?: string;
}

interface ScheduledTaskInfo {
    id: string;
    name: string;
    nextRunAt: string | null;
    lastRunAt: string | null;
    lastError: string | null;
    cron: string;
    hasChannel: boolean;
}

interface HealthIssue {
    severity: "critical" | "warning" | "info";
    component: string;
    message: string;
    suggestion?: string;
    actionable?: boolean;
    actionKey?: string;
}

interface BackgroundStatus {
    daemon: DaemonInfo;
    services: {
        scheduler: { running: boolean; taskCount: number };
        triggers: { enabled: boolean; activeCount: number };
        bootScripts: { enabled: boolean; scriptCount: number };
    };
    channels: {
        total: number;
        running: number;
        list: ChannelStatus[];
    };
    scheduledTasks: ScheduledTaskInfo[];
    healthReport: {
        healthy: boolean;
        issues: HealthIssue[];
        suggestions: string[];
    };
    proactiveStatus: {
        running: boolean;
        lastSentAt: string | null;
    };
    config: {
        backgroundAgentEnabled: boolean;
        backgroundAgentAutoStart: boolean;
        proactiveMessagingEnabled: boolean;
        eventTriggersEnabled: boolean;
        bootScriptsEnabled: boolean;
        deploymentMode: string;
    };
    recentActivity: Array<{
        id: string;
        timestamp: string;
        eventType: string;
        message: string;
        status: "success" | "error" | "skipped";
    }>;
    isAdmin: boolean;
}

function formatUptime(ms: number | null): string {
    if (ms === null) return "—";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function formatLastHeartbeat(ms: number | null): string {
    if (ms === null) return "Never";
    if (ms < 1000) return "Just now";
    if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
    return "Stale";
}

function formatNextRun(dateStr: string | null): string {
    if (!dateStr) return "Not scheduled";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();

    if (diffMs < 0) return "Overdue";
    if (diffMs < 60000) return "< 1 min";
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} min`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h`;
    return `${Math.floor(diffMs / 86400000)}d`;
}

function StatusBadge({ status }: { status: DaemonInfo["status"] }) {
    const variants: Record<DaemonInfo["status"], "default" | "secondary" | "destructive" | "outline"> = {
        running: "default",
        stopped: "outline",
        error: "destructive",
        starting: "secondary",
        stopping: "secondary",
    };

    const labels: Record<DaemonInfo["status"], string> = {
        running: "Running",
        stopped: "Stopped",
        error: "Error",
        starting: "Starting...",
        stopping: "Stopping...",
    };

    return (
        <Badge variant={variants[status]} className="gap-1">
            {status === "running" && <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>}
            {labels[status]}
        </Badge>
    );
}

function HealthBadge({ healthy, issueCount }: { healthy: boolean; issueCount: number }) {
    if (healthy) {
        return (
            <Badge variant="default" className="gap-1 bg-green-600">
                <CheckCircle className="h-3 w-3" />
                Healthy
            </Badge>
        );
    }
    return (
        <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {issueCount} Issue{issueCount !== 1 ? "s" : ""}
        </Badge>
    );
}

export default function BackgroundDashboardPage() {
    const [status, setStatus] = useState<BackgroundStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isControlling, setIsControlling] = useState(false);
    const [isSendingReport, setIsSendingReport] = useState(false);

    const fetchStatus = async () => {
        try {
            setIsLoading(true);

            // Fetch background status
            const response = await fetch("/api/background/status", {
                credentials: "include",
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to load status");
            }

            // Also fetch channel status from the activate endpoint (same source as Channels page)
            // This ensures we see the correct running state
            try {
                const channelResponse = await fetch("/api/channels/activate", {
                    credentials: "include",
                });
                if (channelResponse.ok) {
                    const channelData = await channelResponse.json();
                    // Merge channel status - if activate endpoint shows running, use that
                    if (channelData.channels && channelData.channels.length > 0) {
                        const runningTypes = new Set(channelData.channels.map((ch: { type: string }) => ch.type));
                        // Update channel connection status based on activate endpoint
                        if (data.channels && data.channels.list) {
                            data.channels.list = data.channels.list.map((ch: ChannelStatus) => ({
                                ...ch,
                                connected: runningTypes.has(ch.type) ? true : ch.connected,
                                model: channelData.channels.find((rc: { type: string; model?: string }) => rc.type === ch.type)?.model || ch.model,
                            }));
                            data.channels.running = data.channels.list.filter((ch: ChannelStatus) => ch.connected).length;
                        }
                        // Update health report - remove channel warning if channels are actually running
                        if (data.healthReport && data.channels.running === data.channels.total) {
                            data.healthReport.issues = data.healthReport.issues.filter(
                                (issue: HealthIssue) => issue.component !== "Channels"
                            );
                            if (data.healthReport.issues.length === 0) {
                                data.healthReport.healthy = true;
                            }
                        }
                    }
                }
            } catch {
                // Ignore channel status fetch errors
            }

            setStatus(data);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load status");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 10000); // Refresh every 10s
        return () => clearInterval(interval);
    }, []);

    const handleControl = async (action: "start" | "stop" | "restart") => {
        if (!status?.isAdmin) {
            toast.error("Admin access required");
            return;
        }

        try {
            setIsControlling(true);
            const response = await fetch("/api/background/status", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `Failed to ${action} daemon`);
            }
            toast.success(`Daemon ${action === "start" ? "started" : action === "stop" ? "stopped" : "restarted"}`);
            fetchStatus();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : `Failed to ${action} daemon`);
        } finally {
            setIsControlling(false);
        }
    };

    const handleSendStatusReport = async () => {
        try {
            setIsSendingReport(true);
            const response = await fetch("/api/background/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "send-status-report" }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to send status report");
            }
            toast.success("Status report sent to connected channels");
            fetchStatus();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to send status report");
        } finally {
            setIsSendingReport(false);
        }
    };

    const handleActivateChannels = async () => {
        try {
            const response = await fetch("/api/background/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "activate-all-channels" }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to activate channels");
            }
            toast.success(`${data.channelsActivated} channel(s) activated`);
            fetchStatus();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to activate channels");
        }
    };

    if (isLoading && !status) {
        return (
            <div className="container max-w-6xl mx-auto py-8 px-4 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const daemon = status?.daemon;
    const services = status?.services;
    const config = status?.config;
    const channels = status?.channels;
    const healthReport = status?.healthReport;
    const scheduledTasks = status?.scheduledTasks;

    return (
        <div className="container max-w-6xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Background Agent</h1>
                    <p className="text-muted-foreground mt-1">
                        Monitor and control the always-on AI assistant daemon
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {status?.isAdmin && config?.proactiveMessagingEnabled && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleSendStatusReport}
                                        disabled={isSendingReport}
                                    >
                                        {isSendingReport ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                        ) : (
                                            <Send className="h-4 w-4 mr-1" />
                                        )}
                                        Send Report
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Send a status report to your connected channels now</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    <Button variant="outline" size="icon" onClick={fetchStatus} disabled={isLoading}>
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    </Button>
                </div>
            </div>

            {/* Health Status Banner */}
            {healthReport && (
                <Card className={cn(
                    "border-2",
                    healthReport.healthy ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/30 bg-yellow-500/5"
                )}>
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {healthReport.healthy ? (
                                    <CheckCircle className="h-6 w-6 text-green-500" />
                                ) : (
                                    <AlertTriangle className="h-6 w-6 text-yellow-500" />
                                )}
                                <div>
                                    <h3 className="font-semibold">
                                        {healthReport.healthy ? "All Systems Operational" : "Issues Detected"}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {healthReport.healthy
                                            ? "Your MaiaChat instance is running smoothly"
                                            : `${healthReport.issues.length} issue(s) need attention`}
                                    </p>
                                </div>
                            </div>
                            <HealthBadge healthy={healthReport.healthy} issueCount={healthReport.issues.length} />
                        </div>

                        {/* Issues List */}
                        {healthReport.issues.length > 0 && (
                            <div className="mt-4 space-y-2">
                                {healthReport.issues.map((issue, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border"
                                    >
                                        <div className={cn(
                                            "mt-0.5",
                                            issue.severity === "critical" && "text-red-500",
                                            issue.severity === "warning" && "text-yellow-500",
                                            issue.severity === "info" && "text-blue-500"
                                        )}>
                                            <AlertTriangle className="h-4 w-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-xs">
                                                    {issue.component}
                                                </Badge>
                                                <span className="text-sm font-medium">{issue.message}</span>
                                            </div>
                                            {issue.suggestion && (
                                                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                                                    <Lightbulb className="h-3 w-3" />
                                                    {issue.suggestion}
                                                </p>
                                            )}
                                        </div>
                                        {issue.actionable && issue.actionKey === "activate-channels" && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleActivateChannels}
                                            >
                                                Fix
                                            </Button>
                                        )}
                                        {issue.actionable && issue.actionKey === "restart-daemon" && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleControl("restart")}
                                            >
                                                Restart
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Suggestions */}
                        {healthReport.healthy && healthReport.suggestions.length > 0 && (
                            <div className="mt-4 space-y-2">
                                <h4 className="text-sm font-medium flex items-center gap-1">
                                    <Lightbulb className="h-4 w-4" />
                                    Suggestions
                                </h4>
                                {healthReport.suggestions.map((suggestion, idx) => (
                                    <p key={idx} className="text-sm text-muted-foreground pl-5">
                                        • {suggestion}
                                    </p>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* What is Background Agent - Info Card */}
            <Card className="bg-muted/30 border-primary/20">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Info className="h-4 w-4 text-primary" />
                        What is the Background Agent?
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                    <p>
                        The <strong>Background Agent</strong> is a daemon that runs continuously on the server,
                        handling tasks even when you&apos;re not actively using the application. Think of it as
                        your AI butler that&apos;s always on duty.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex gap-2">
                            <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div>
                                <strong>Channel Connections</strong>
                                <p className="text-muted-foreground text-xs">
                                    Keeps your Telegram, Discord, and other bots running 24/7.
                                    Messages sent to your bots are processed and responded to automatically.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div>
                                <strong>Scheduled Tasks</strong>
                                <p className="text-muted-foreground text-xs">
                                    Run AI tasks on a schedule (e.g., &quot;Send me a news summary every morning at 9 AM&quot;).
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Bell className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div>
                                <strong>Proactive Status Reports</strong>
                                <p className="text-muted-foreground text-xs">
                                    Sends periodic status updates to your channels so you know everything is working.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Activity className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div>
                                <strong>Event Triggers</strong>
                                <p className="text-muted-foreground text-xs">
                                    React to webhooks, file changes, and other events to trigger AI actions automatically.
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Daemon Status */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Server className="h-5 w-5" />
                            Daemon Status
                        </div>
                        {daemon && <StatusBadge status={daemon.status} />}
                    </CardTitle>
                    <CardDescription>
                        {config?.deploymentMode === "hosted"
                            ? "Running in hosted mode with usage limits"
                            : "Running in self-hosted mode with full access"}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <TooltipProvider>
                        <div className="grid gap-4 md:grid-cols-4">
                            <div className="space-y-1">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="text-sm text-muted-foreground flex items-center gap-1 cursor-help">
                                            <Clock className="h-4 w-4" /> Uptime
                                            <HelpCircle className="h-3 w-3" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                        <p>How long the daemon has been running continuously since it was last started.</p>
                                    </TooltipContent>
                                </Tooltip>
                                <div className="text-2xl font-bold">{formatUptime(daemon?.uptime ?? null)}</div>
                            </div>
                            <div className="space-y-1">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="text-sm text-muted-foreground flex items-center gap-1 cursor-help">
                                            <Heart className="h-4 w-4" /> Last Heartbeat
                                            <HelpCircle className="h-3 w-3" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                        <p>The daemon sends a &quot;heartbeat&quot; every 30 seconds to confirm it&apos;s alive.
                                        If this shows &quot;Stale&quot;, the daemon may have crashed or been disconnected.</p>
                                    </TooltipContent>
                                </Tooltip>
                                <div className="text-2xl font-bold">{formatLastHeartbeat(daemon?.lastHeartbeat ?? null)}</div>
                            </div>
                            <div className="space-y-1">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="text-sm text-muted-foreground flex items-center gap-1 cursor-help">
                                            <Zap className="h-4 w-4" /> Tasks Run
                                            <HelpCircle className="h-3 w-3" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                        <p>Total number of tasks executed since the daemon started. Includes scheduled tasks,
                                        autonomous tasks, and event-triggered actions.</p>
                                    </TooltipContent>
                                </Tooltip>
                                <div className="text-2xl font-bold">{daemon?.stats.totalTasksRun ?? 0}</div>
                            </div>
                            <div className="space-y-1">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="text-sm text-muted-foreground flex items-center gap-1 cursor-help">
                                            <Activity className="h-4 w-4" /> Errors
                                            <HelpCircle className="h-3 w-3" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                        <p>Number of errors encountered. Check the Activity Feed below for details.
                                        Common causes: API rate limits, network issues, or invalid task configurations.</p>
                                    </TooltipContent>
                                </Tooltip>
                                <div className="text-2xl font-bold text-destructive">{daemon?.stats.errorCount ?? 0}</div>
                            </div>
                        </div>
                    </TooltipProvider>

                    {status?.isAdmin && config?.deploymentMode !== "hosted" && (
                        <div className="flex gap-2 mt-6 pt-4 border-t">
                            <Button
                                onClick={() => handleControl("start")}
                                disabled={isControlling || daemon?.status === "running"}
                                size="sm"
                            >
                                <Play className="h-4 w-4 mr-1" /> Start
                            </Button>
                            <Button
                                onClick={() => handleControl("stop")}
                                disabled={isControlling || daemon?.status === "stopped"}
                                variant="outline"
                                size="sm"
                            >
                                <Square className="h-4 w-4 mr-1" /> Stop
                            </Button>
                            <Button
                                onClick={() => handleControl("restart")}
                                disabled={isControlling}
                                variant="outline"
                                size="sm"
                            >
                                <RefreshCw className="h-4 w-4 mr-1" /> Restart
                            </Button>
                        </div>
                    )}

                    {daemon?.processId && (
                        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                            Process: {daemon.processId} | Host: {daemon.hostName}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Channels Status */}
            {channels && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Radio className="h-5 w-5" />
                                Connected Channels
                            </div>
                            <Badge variant={channels.running > 0 ? "default" : "outline"}>
                                {channels.running}/{channels.total} Active
                            </Badge>
                        </CardTitle>
                        <CardDescription>
                            Channels can run independently of the daemon via the Channels settings page
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {channels.list.length > 0 ? (
                            <div className="space-y-3">
                                {channels.list.map((ch, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-2 h-2 rounded-full",
                                                ch.connected ? "bg-green-500" : "bg-red-500"
                                            )} />
                                            <div>
                                                <div className="font-medium capitalize">{ch.type}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {ch.provider}/{ch.model}
                                                </div>
                                            </div>
                                        </div>
                                        <Badge variant={ch.connected ? "default" : "destructive"}>
                                            {ch.connected ? "Connected" : "Disconnected"}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-muted-foreground">
                                <Radio className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No channels connected</p>
                                <Link href="/channels">
                                    <Button variant="link" className="mt-2">
                                        Set up a channel <ChevronRight className="h-4 w-4 ml-1" />
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Scheduled Tasks Preview */}
            {scheduledTasks && scheduledTasks.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Clock className="h-5 w-5" />
                                Upcoming Scheduled Tasks
                            </div>
                            <Link href="/scheduled-tasks">
                                <Button variant="ghost" size="sm">
                                    View All <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </Link>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {scheduledTasks.slice(0, 5).map((task) => (
                                <div
                                    key={task.id}
                                    className="flex items-center justify-between py-2 border-b last:border-0"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-2 h-2 rounded-full",
                                            task.lastError ? "bg-red-500" : "bg-green-500"
                                        )} />
                                        <div>
                                            <div className="text-sm font-medium">{task.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {task.cron}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm">
                                            {formatNextRun(task.nextRunAt)}
                                        </div>
                                        {task.lastError && (
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <Badge variant="destructive" className="text-xs">
                                                            Error
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-xs">
                                                        <p>{task.lastError}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Services */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="flex items-center gap-1 cursor-help">
                                            Scheduled Tasks
                                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                        <p>Cron-based tasks that run automatically at specified times.
                                        Example: &quot;Summarize my emails every morning at 8 AM&quot;.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <Badge variant={services?.scheduler.running ? "default" : "outline"}>
                                {services?.scheduler.running ? "Active" : "Idle"}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{services?.scheduler.taskCount ?? 0}</div>
                        <div className="text-sm text-muted-foreground">enabled tasks</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="flex items-center gap-1 cursor-help">
                                            Event Triggers
                                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                        <p>React to external events like webhooks, file changes, or incoming emails.
                                        Example: &quot;When a new GitHub issue is created, summarize it and post to Discord&quot;.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <Badge variant={config?.eventTriggersEnabled ? "default" : "outline"}>
                                {config?.eventTriggersEnabled ? "Enabled" : "Disabled"}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{services?.triggers.activeCount ?? 0}</div>
                        <div className="text-sm text-muted-foreground">active triggers</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="flex items-center gap-1 cursor-help">
                                            Boot Scripts
                                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                        <p>Scripts that run when the daemon starts or when channels connect.
                                        Useful for initialization, loading data, or sending startup notifications.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <Badge variant={config?.bootScriptsEnabled ? "default" : "outline"}>
                                {config?.bootScriptsEnabled ? "Enabled" : "Disabled"}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{services?.bootScripts.scriptCount ?? 0}</div>
                        <div className="text-sm text-muted-foreground">boot scripts</div>
                    </CardContent>
                </Card>
            </div>

            {/* Proactive Status Info */}
            {config?.proactiveMessagingEnabled && (
                <Card className="bg-muted/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Bell className="h-4 w-4" />
                            Proactive Status Reports
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    Status reports are sent every 30 minutes to your connected channels
                                </p>
                                {status?.proactiveStatus?.lastSentAt && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Last sent: {new Date(status.proactiveStatus.lastSentAt).toLocaleString()}
                                    </p>
                                )}
                            </div>
                            <Badge variant={status?.proactiveStatus?.running ? "default" : "outline"}>
                                {status?.proactiveStatus?.running ? "Active" : "Inactive"}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Configuration */}
            {status?.isAdmin && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Power className="h-5 w-5" />
                            Feature Configuration
                        </CardTitle>
                        <CardDescription>
                            Enable or disable background agent features (admin only)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium">Background Agent</div>
                                    <div className="text-sm text-muted-foreground">Enable the daemon to run tasks in the background</div>
                                </div>
                                <Switch checked={config?.backgroundAgentEnabled} disabled />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium">Auto-start on Boot</div>
                                    <div className="text-sm text-muted-foreground">Automatically start daemon when server starts</div>
                                </div>
                                <Switch checked={config?.backgroundAgentAutoStart} disabled />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium">Proactive Messaging</div>
                                    <div className="text-sm text-muted-foreground">Send periodic status reports to connected channels</div>
                                </div>
                                <Switch checked={config?.proactiveMessagingEnabled} disabled />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium">Event Triggers</div>
                                    <div className="text-sm text-muted-foreground">React to webhooks, file changes, and other events</div>
                                </div>
                                <Switch checked={config?.eventTriggersEnabled} disabled />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium">Boot Scripts</div>
                                    <div className="text-sm text-muted-foreground">Run startup scripts when daemon starts</div>
                                </div>
                                <Switch checked={config?.bootScriptsEnabled} disabled />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-4">
                            Configure these settings in the Admin Settings panel.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* How to Interact with Background Agent */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        How to Interact with the Background Agent
                    </CardTitle>
                    <CardDescription>
                        The Background Agent listens for commands through your connected channels
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="p-4 rounded-lg border bg-muted/30">
                                <h4 className="font-medium mb-2">Via Telegram / Discord / Slack</h4>
                                <p className="text-sm text-muted-foreground mb-3">
                                    Send messages directly to your connected bot. The Background Agent processes
                                    them and responds automatically using the AI model configured for that channel.
                                </p>
                                <div className="text-xs bg-muted p-2 rounded font-mono">
                                    You: &quot;What&apos;s the weather like today?&quot;<br />
                                    Bot: &quot;Let me check... It&apos;s 22°C and sunny!&quot;
                                </div>
                            </div>
                            <div className="p-4 rounded-lg border bg-muted/30">
                                <h4 className="font-medium mb-2">Autonomous Mode</h4>
                                <p className="text-sm text-muted-foreground mb-3">
                                    Start multi-step tasks that run independently until complete.
                                    Great for research, analysis, or complex workflows.
                                </p>
                                <div className="text-xs bg-muted p-2 rounded font-mono space-y-1">
                                    <div><code>/autonomous</code> Research AI news and summarize</div>
                                    <div><code>/steer</code> Focus on open-source models</div>
                                    <div><code>/abort</code> Cancel the current task</div>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
                            <h4 className="font-medium mb-2 flex items-center gap-2">
                                <Info className="h-4 w-4" />
                                Key Points
                            </h4>
                            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                                <li>You don&apos;t talk to the Background Agent directly — you talk through your connected channels</li>
                                <li>All messages to your bots are processed by the Background Agent automatically</li>
                                <li>The agent uses the same AI features as the web chat (RAG, memory, tools, skills)</li>
                                <li>Scheduled tasks run without any interaction — they&apos;re triggered by time</li>
                                <li>Event triggers react to external events (webhooks, file changes) automatically</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Activity Feed */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Recent Activity
                    </CardTitle>
                    <CardDescription>
                        Recent background agent events and task executions
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {status?.recentActivity && status.recentActivity.length > 0 ? (
                        <div className="space-y-2">
                            {status.recentActivity.map((activity) => (
                                <div
                                    key={activity.id}
                                    className="flex items-center justify-between py-2 border-b last:border-0"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-2 h-2 rounded-full",
                                            activity.status === "success" && "bg-green-500",
                                            activity.status === "error" && "bg-red-500",
                                            activity.status === "skipped" && "bg-yellow-500"
                                        )} />
                                        <div>
                                            <div className="text-sm">{activity.message}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(activity.timestamp).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                        {activity.eventType}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center text-muted-foreground">
                            No recent activity
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
