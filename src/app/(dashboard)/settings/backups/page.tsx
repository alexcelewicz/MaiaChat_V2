"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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
import {
    Database,
    Download,
    Upload,
    Loader2,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Activity,
    Shield,
    RefreshCw,
    HardDrive,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

interface BackupInfo {
    id: string;
    key: string;
    date: string;
    sizeBytes: number;
    target: string;
}

interface BackupStatus {
    lastBackupAt: string | null;
    backupCount: number;
    totalSizeBytes: number;
}

interface HealthCheck {
    name: string;
    status: "ok" | "warning" | "error";
    message: string;
    latencyMs?: number;
}

interface HealthResult {
    overall: "healthy" | "degraded" | "unhealthy";
    checks: HealthCheck[];
    checkedAt: string;
}

interface SystemMetrics {
    conversations: number;
    messages: number;
    users: number;
    agents: number;
    activeChannels: number;
    scheduledTasks: number;
    crmContacts: number;
    backupCount: number;
}

interface AgentAudit {
    agentId: string;
    agentName: string;
    score: number;
    issues: string[];
    suggestions: string[];
}

interface AuditResult {
    agents: AgentAudit[];
    overallScore: number;
    auditedAt: string;
}

// ============================================================================
// Helpers
// ============================================================================

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
}

function statusColor(status: "ok" | "warning" | "error"): string {
    switch (status) {
        case "ok":
            return "text-green-600 dark:text-green-400";
        case "warning":
            return "text-yellow-600 dark:text-yellow-400";
        case "error":
            return "text-red-600 dark:text-red-400";
    }
}

function StatusIcon({ status }: { status: "ok" | "warning" | "error" }) {
    switch (status) {
        case "ok":
            return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
        case "warning":
            return <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
        case "error":
            return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    }
}

function scoreColor(score: number): string {
    if (score < 0) return "text-muted-foreground";
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
}

// ============================================================================
// Page Component
// ============================================================================

export default function BackupsPage() {
    // Backup state
    const [backups, setBackups] = useState<BackupInfo[]>([]);
    const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
    const [backupTarget, setBackupTarget] = useState<"s3" | "local">("s3");
    const [retentionCount, setRetentionCount] = useState(10);
    const [isLoadingBackups, setIsLoadingBackups] = useState(true);
    const [isCreatingBackup, setIsCreatingBackup] = useState(false);
    const [restoringId, setRestoringId] = useState<string | null>(null);

    // Health state
    const [health, setHealth] = useState<HealthResult | null>(null);
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [isLoadingHealth, setIsLoadingHealth] = useState(false);

    // Audit state
    const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
    const [isAuditing, setIsAuditing] = useState(false);

    // ========================================================================
    // Data Fetching
    // ========================================================================

    const fetchBackups = useCallback(async () => {
        try {
            setIsLoadingBackups(true);
            const res = await fetch("/api/backups", { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch backups");
            const data = await res.json();
            setBackups(data.backups || []);
            setBackupStatus(data.status || null);
        } catch (error) {
            console.error("Fetch backups error:", error);
            toast.error("Failed to load backups");
        } finally {
            setIsLoadingBackups(false);
        }
    }, []);

    const fetchHealth = useCallback(async () => {
        try {
            setIsLoadingHealth(true);
            const res = await fetch("/api/health/audit", { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch health");
            const data = await res.json();
            setHealth(data.health || null);
            setMetrics(data.metrics || null);
        } catch (error) {
            console.error("Fetch health error:", error);
            toast.error("Failed to load health status");
        } finally {
            setIsLoadingHealth(false);
        }
    }, []);

    useEffect(() => {
        fetchBackups();
        fetchHealth();
    }, [fetchBackups, fetchHealth]);

    // ========================================================================
    // Actions
    // ========================================================================

    const handleCreateBackup = async () => {
        try {
            setIsCreatingBackup(true);
            const res = await fetch("/api/backups", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    target: backupTarget,
                    retentionCount,
                }),
            });

            if (!res.ok) throw new Error("Failed to create backup");

            const data = await res.json();
            const deleted = Number(data.deletedBackups || 0);
            toast.success(
                `Backup created: ${Object.values(data.result?.rowCounts || {}).reduce(
                    (a: number, b: unknown) => a + (b as number),
                    0
                )} rows exported (${formatBytes(data.result?.sizeBytes || 0)})${
                    deleted > 0 ? `, cleaned up ${deleted} old backup(s)` : ""
                }`
            );
            fetchBackups();
        } catch (error) {
            console.error("Create backup error:", error);
            toast.error("Failed to create backup");
        } finally {
            setIsCreatingBackup(false);
        }
    };

    const handleDownload = (backupId: string) => {
        window.open(`/api/backups/${encodeURIComponent(backupId)}`, "_blank");
    };

    const handleRestore = async (backupId: string) => {
        try {
            setRestoringId(backupId);
            const res = await fetch(`/api/backups/${encodeURIComponent(backupId)}`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            if (!res.ok) throw new Error("Failed to restore backup");

            const data = await res.json();
            const result = data.result;

            if (result?.warnings?.length > 0) {
                toast.warning(`Restored with warnings: ${result.warnings[0]}`);
            } else {
                toast.success(`Restored ${result?.tablesRestored?.length || 0} tables successfully`);
            }
        } catch (error) {
            console.error("Restore error:", error);
            toast.error("Failed to restore backup");
        } finally {
            setRestoringId(null);
        }
    };

    const handleRunAudit = async () => {
        try {
            setIsAuditing(true);
            const res = await fetch("/api/health/audit", {
                method: "POST",
                credentials: "include",
            });

            if (!res.ok) throw new Error("Failed to run audit");

            const data = await res.json();
            setAuditResult(data.result || null);
            toast.success("System prompt audit complete");
        } catch (error) {
            console.error("Audit error:", error);
            toast.error("Failed to run audit");
        } finally {
            setIsAuditing(false);
        }
    };

    // ========================================================================
    // Render
    // ========================================================================

    return (
        <div className="container max-w-5xl mx-auto py-8 px-4 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Backups & System Health</h1>
                <p className="text-muted-foreground mt-1">
                    Manage database backups, monitor system health, and audit AI agent configurations
                </p>
            </div>

            {/* ============================================================ */}
            {/* Health Status Dashboard */}
            {/* ============================================================ */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="h-5 w-5" />
                                System Health
                            </CardTitle>
                            <CardDescription>
                                Real-time status of core infrastructure services
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchHealth}
                            disabled={isLoadingHealth}
                        >
                            {isLoadingHealth ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoadingHealth && !health ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : health ? (
                        <div className="space-y-4">
                            {/* Overall status */}
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium">Overall:</span>
                                <Badge
                                    variant={
                                        health.overall === "healthy"
                                            ? "default"
                                            : health.overall === "degraded"
                                            ? "secondary"
                                            : "destructive"
                                    }
                                >
                                    {health.overall.toUpperCase()}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                    Checked {formatDate(health.checkedAt)}
                                </span>
                            </div>

                            {/* Service checks */}
                            <div className="grid gap-2 sm:grid-cols-2">
                                {health.checks.map((check) => (
                                    <div
                                        key={check.name}
                                        className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                                    >
                                        <StatusIcon status={check.status} />
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium ${statusColor(check.status)}`}>
                                                {check.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {check.message}
                                            </p>
                                        </div>
                                        {check.latencyMs !== undefined && (
                                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                {check.latencyMs}ms
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* System metrics */}
                            {metrics && (
                                <div className="pt-2 border-t">
                                    <p className="text-sm font-medium mb-2">System Metrics</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {[
                                            { label: "Users", value: metrics.users },
                                            { label: "Conversations", value: metrics.conversations },
                                            { label: "Messages", value: metrics.messages },
                                            { label: "Agents", value: metrics.agents },
                                            { label: "Active Channels", value: metrics.activeChannels },
                                            { label: "Scheduled Tasks", value: metrics.scheduledTasks },
                                            { label: "CRM Contacts", value: metrics.crmContacts },
                                            { label: "Backups", value: metrics.backupCount },
                                        ].map((m) => (
                                            <div
                                                key={m.label}
                                                className="p-2 rounded-md bg-muted/50 text-center"
                                            >
                                                <p className="text-lg font-bold">{m.value.toLocaleString()}</p>
                                                <p className="text-xs text-muted-foreground">{m.label}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No health data available.</p>
                    )}
                </CardContent>
            </Card>

            {/* ============================================================ */}
            {/* Backup Controls */}
            {/* ============================================================ */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Database Backups
                    </CardTitle>
                    <CardDescription>
                        Export and restore your MaiaChat data. Backups include users, conversations,
                        messages, agents, profiles, CRM data, workflows, and scheduled tasks.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Backup configuration row */}
                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                        <div className="space-y-2 flex-1">
                            <Label htmlFor="backup-target">Backup Target</Label>
                            <Select
                                value={backupTarget}
                                onValueChange={(v) => setBackupTarget(v as "s3" | "local")}
                            >
                                <SelectTrigger id="backup-target">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="s3">S3 / MinIO</SelectItem>
                                    <SelectItem value="local">Local Storage</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="retention">Keep Last N Backups</Label>
                            <Input
                                id="retention"
                                type="number"
                                min={1}
                                max={100}
                                value={retentionCount}
                                onChange={(e) => setRetentionCount(Number(e.target.value) || 10)}
                                className="w-24"
                            />
                        </div>
                        <Button
                            onClick={handleCreateBackup}
                            disabled={isCreatingBackup}
                        >
                            {isCreatingBackup ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Backing up...
                                </>
                            ) : (
                                <>
                                    <HardDrive className="h-4 w-4 mr-2" />
                                    Run Backup Now
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Backup status summary */}
                    {backupStatus && (
                        <div className="flex gap-4 text-sm text-muted-foreground">
                            <span>
                                Last backup:{" "}
                                {backupStatus.lastBackupAt
                                    ? formatDate(backupStatus.lastBackupAt)
                                    : "Never"}
                            </span>
                            <span>Total: {backupStatus.backupCount} backups</span>
                            <span>Size: {formatBytes(backupStatus.totalSizeBytes)}</span>
                        </div>
                    )}

                    {/* Backup history table */}
                    <div>
                        <h3 className="text-sm font-medium mb-3">Backup History</h3>
                        {isLoadingBackups ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : backups.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No backups yet.</p>
                                <p className="text-sm">Run a backup above to get started.</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Size</TableHead>
                                        <TableHead>Target</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {backups.map((backup) => (
                                        <TableRow key={backup.id}>
                                            <TableCell className="font-mono text-sm">
                                                {formatDate(backup.date)}
                                            </TableCell>
                                            <TableCell>{formatBytes(backup.sizeBytes)}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{backup.target}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDownload(backup.id)}
                                                    >
                                                        <Download className="h-4 w-4 mr-1" />
                                                        Download
                                                    </Button>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                disabled={restoringId === backup.id}
                                                            >
                                                                {restoringId === backup.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                                                ) : (
                                                                    <Upload className="h-4 w-4 mr-1" />
                                                                )}
                                                                Restore
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>
                                                                    Restore Backup
                                                                </AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    This is a destructive operation. Restoring will
                                                                    insert data from the backup into your database.
                                                                    Existing records with the same IDs will be skipped.
                                                                    It is recommended to create a fresh backup before
                                                                    restoring.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction
                                                                    onClick={() => handleRestore(backup.id)}
                                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                >
                                                                    Restore
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* ============================================================ */}
            {/* System Prompt Audit */}
            {/* ============================================================ */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5" />
                                System Prompt Audit
                            </CardTitle>
                            <CardDescription>
                                Analyze your agent system prompts for anti-patterns, biases, and improvement
                                opportunities using an LLM review
                            </CardDescription>
                        </div>
                        <Button
                            onClick={handleRunAudit}
                            disabled={isAuditing}
                            variant="outline"
                        >
                            {isAuditing ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Auditing...
                                </>
                            ) : (
                                "Run Audit Now"
                            )}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {auditResult ? (
                        <div className="space-y-4">
                            {/* Overall score */}
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium">Overall Score:</span>
                                <span className={`text-2xl font-bold ${scoreColor(auditResult.overallScore)}`}>
                                    {auditResult.overallScore >= 0
                                        ? `${auditResult.overallScore}/100`
                                        : "N/A"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {auditResult.agents.length} agent(s) audited at{" "}
                                    {formatDate(auditResult.auditedAt)}
                                </span>
                            </div>

                            {/* Per-agent results */}
                            <div className="space-y-3">
                                {auditResult.agents.map((agent) => (
                                    <div
                                        key={agent.agentId}
                                        className="p-4 rounded-lg border bg-muted/30 space-y-2"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-sm">{agent.agentName}</span>
                                            <Badge
                                                variant={
                                                    agent.score >= 80
                                                        ? "default"
                                                        : agent.score >= 50
                                                        ? "secondary"
                                                        : "destructive"
                                                }
                                            >
                                                {agent.score >= 0 ? `${agent.score}/100` : "Error"}
                                            </Badge>
                                        </div>

                                        {agent.issues.length > 0 && (
                                            <div>
                                                <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                                                    Issues
                                                </p>
                                                <ul className="text-xs text-muted-foreground space-y-0.5">
                                                    {agent.issues.map((issue, i) => (
                                                        <li key={i} className="flex gap-1">
                                                            <span className="text-red-500 shrink-0">-</span>
                                                            {issue}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {agent.suggestions.length > 0 && (
                                            <div>
                                                <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                                                    Suggestions
                                                </p>
                                                <ul className="text-xs text-muted-foreground space-y-0.5">
                                                    {agent.suggestions.map((suggestion, i) => (
                                                        <li key={i} className="flex gap-1">
                                                            <span className="text-blue-500 shrink-0">+</span>
                                                            {suggestion}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            Click &quot;Run Audit Now&quot; to analyze your agent system prompts.
                            Requires a Google or OpenAI API key.
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
