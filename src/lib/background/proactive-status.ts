/**
 * Proactive Status Service
 *
 * Sends periodic status reports through configured channels.
 * Monitors system health and suggests fixes for detected issues.
 */

import { db } from "@/lib/db";
import {
    scheduledTasks,
    eventTriggers,
    bootScripts,
    channelAccounts,
    users
} from "@/lib/db/schema";
import { eq, and, count, lt, isNotNull, sql } from "drizzle-orm";
import { backgroundService } from "@/lib/channels/background-service";
import { getChannelManager } from "@/lib/channels/manager";
import { resolveTelegramChatIdFromAccount } from "@/lib/channels/telegram/chat-id";
import { getDaemonInfo } from "./daemon";
import { getAdminSettings } from "@/lib/admin/settings";

// ============================================================================
// Types
// ============================================================================

export interface HealthIssue {
    severity: "critical" | "warning" | "info";
    component: string;
    message: string;
    suggestion?: string;
    actionable?: boolean;
    actionKey?: string;
}

export interface StatusReport {
    timestamp: Date;
    healthy: boolean;
    daemonStatus: "running" | "stopped" | "error" | "starting" | "stopping";
    uptime: string | null;
    services: {
        channels: {
            total: number;
            running: number;
            disconnected: number;
            channels: Array<{
                type: string;
                name: string;
                status: "running" | "stopped" | "error";
                model?: string;
            }>;
        };
        scheduledTasks: {
            total: number;
            enabled: number;
            recentlyFailed: number;
            upcomingTasks: Array<{
                name: string;
                nextRun: Date | null;
                lastError?: string;
            }>;
        };
        triggers: {
            total: number;
            enabled: number;
        };
        bootScripts: {
            total: number;
            enabled: number;
        };
    };
    issues: HealthIssue[];
    suggestions: string[];
}

// ============================================================================
// Status Collection
// ============================================================================

export async function collectStatusReport(): Promise<StatusReport> {
    const issues: HealthIssue[] = [];
    const suggestions: string[] = [];

    // Get daemon info - this now correctly derives status from database
    const daemonInfo = await getDaemonInfo();
    const daemonActuallyRunning = daemonInfo.status === "running";

    const requiredTaskColumns = ["lock_owner", "lock_expires_at", "running_at"];
    try {
        // Use raw SQL with explicit array cast for PostgreSQL compatibility
        const columnResult = await db.execute(sql`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'scheduled_tasks'
              AND column_name IN ('lock_owner', 'lock_expires_at', 'running_at')
        `);
        const existingColumns = new Set(
            (columnResult.rows as Array<{ column_name: string }>).map((row) => row.column_name)
        );
        const missingColumns = requiredTaskColumns.filter((col) => !existingColumns.has(col));

        if (missingColumns.length > 0) {
            issues.push({
                severity: "warning",
                component: "Database",
                message: "Migration pending for scheduled tasks",
                suggestion: `Run database migrations to add columns: ${missingColumns.join(", ")}`,
                actionable: false,
            });
            suggestions.push("Run database migrations to keep scheduled task schema up to date.");
        }
    } catch (error) {
        issues.push({
            severity: "warning",
            component: "Database",
            message: "Could not verify scheduled task schema",
            suggestion: "Ensure migrations are applied (scheduled_tasks lock columns)",
            actionable: false,
        });
    }

    // Format uptime
    let uptime: string | null = null;
    if (daemonInfo.uptime) {
        const seconds = Math.floor(daemonInfo.uptime / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0) uptime = `${days}d ${hours % 24}h`;
        else if (hours > 0) uptime = `${hours}h ${minutes % 60}m`;
        else if (minutes > 0) uptime = `${minutes}m ${seconds % 60}s`;
        else uptime = `${seconds}s`;
    }

    // Check daemon status - only report error if status is explicitly "error"
    if (daemonInfo.status === "error") {
        issues.push({
            severity: "critical",
            component: "Daemon",
            message: "Daemon has encountered an error or heartbeat is stale",
            suggestion: "Try restarting the daemon from the Background Agent page",
            actionable: true,
            actionKey: "restart-daemon",
        });
    }

    // Get channel info from backgroundService (authoritative source for running channels)
    const runningChannels = backgroundService.getRunningChannels();

    // Get active channel accounts from database
    const activeAccounts = await db
        .select({
            id: channelAccounts.id,
            userId: channelAccounts.userId,
            channelType: channelAccounts.channelType,
            channelId: channelAccounts.channelId,
        })
        .from(channelAccounts)
        .where(eq(channelAccounts.isActive, true));

    const totalActiveChannels = activeAccounts.length;

    // Check which channels are actually connected via backgroundService
    let connectedCount = 0;
    const channelsList: Array<{
        type: string;
        name: string;
        status: "running" | "stopped" | "error";
        model?: string;
    }> = [];

    for (const account of activeAccounts) {
        // Find matching running channel from backgroundService
        const runningState = runningChannels.find(
            (ch) => ch.channelAccountId === account.id
        );

        const isConnected = runningState?.running && runningState?.connected;

        if (isConnected) {
            connectedCount++;
            channelsList.push({
                type: account.channelType,
                name: account.channelType.charAt(0).toUpperCase() + account.channelType.slice(1),
                status: "running",
                model: runningState?.model,
            });
        } else {
            channelsList.push({
                type: account.channelType,
                name: account.channelType.charAt(0).toUpperCase() + account.channelType.slice(1),
                status: "stopped",
            });
        }
    }

    const disconnectedChannels = totalActiveChannels - connectedCount;

    if (disconnectedChannels > 0) {
        issues.push({
            severity: "warning",
            component: "Channels",
            message: `${disconnectedChannels} channel(s) are configured but not connected`,
            suggestion: "Go to Channels settings to activate disconnected channels",
            actionable: true,
            actionKey: "activate-channels",
        });
    }

    // Get scheduled tasks info
    const [taskCounts] = await db
        .select({
            total: count(),
        })
        .from(scheduledTasks);

    const [enabledTaskCount] = await db
        .select({ count: count() })
        .from(scheduledTasks)
        .where(eq(scheduledTasks.isEnabled, true));

    // Get recently failed tasks (last error not null, within last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [failedTaskCount] = await db
        .select({ count: count() })
        .from(scheduledTasks)
        .where(
            and(
                isNotNull(scheduledTasks.lastError),
                eq(scheduledTasks.isEnabled, true)
            )
        );

    // Get upcoming tasks
    const upcomingTasks = await db
        .select({
            name: scheduledTasks.name,
            nextRunAt: scheduledTasks.nextRunAt,
            lastError: scheduledTasks.lastError,
        })
        .from(scheduledTasks)
        .where(eq(scheduledTasks.isEnabled, true))
        .orderBy(scheduledTasks.nextRunAt)
        .limit(5);

    if ((failedTaskCount?.count ?? 0) > 0) {
        issues.push({
            severity: "warning",
            component: "Scheduled Tasks",
            message: `${failedTaskCount?.count} task(s) have recent errors`,
            suggestion: "Review failed tasks in the Scheduled Tasks page",
            actionable: true,
            actionKey: "view-failed-tasks",
        });
    }

    // Get triggers info
    const [triggerCounts] = await db.select({ total: count() }).from(eventTriggers);
    const [enabledTriggers] = await db
        .select({ count: count() })
        .from(eventTriggers)
        .where(eq(eventTriggers.isEnabled, true));

    // Get boot scripts info
    const [bootScriptCounts] = await db.select({ total: count() }).from(bootScripts);
    const [enabledBootScripts] = await db
        .select({ count: count() })
        .from(bootScripts)
        .where(eq(bootScripts.isEnabled, true));

    // Check daemon errors
    if ((daemonInfo.stats?.errorCount ?? 0) > 10) {
        issues.push({
            severity: "warning",
            component: "Daemon",
            message: `High error count: ${daemonInfo.stats.errorCount} errors`,
            suggestion: "Check Activity Feed for error details",
        });
    }

    // Generate helpful suggestions based on state
    if (totalActiveChannels === 0) {
        suggestions.push("Connect a channel (Telegram, Discord) to receive AI responses on your devices");
    }

    if ((taskCounts?.total ?? 0) === 0) {
        suggestions.push("Create scheduled tasks to automate recurring AI tasks");
    }

    if (!daemonActuallyRunning && totalActiveChannels > 0) {
        suggestions.push("Start the Background Agent to enable automatic channel processing");
    }

    // Determine overall health
    const criticalIssues = issues.filter((i) => i.severity === "critical");
    const healthy = criticalIssues.length === 0 && daemonActuallyRunning;

    return {
        timestamp: new Date(),
        healthy,
        daemonStatus: daemonInfo.status,
        uptime,
        services: {
            channels: {
                total: totalActiveChannels,
                running: connectedCount,
                disconnected: disconnectedChannels,
                channels: channelsList,
            },
            scheduledTasks: {
                total: taskCounts?.total ?? 0,
                enabled: enabledTaskCount?.count ?? 0,
                recentlyFailed: failedTaskCount?.count ?? 0,
                upcomingTasks: upcomingTasks.map((t) => ({
                    name: t.name,
                    nextRun: t.nextRunAt,
                    lastError: t.lastError ?? undefined,
                })),
            },
            triggers: {
                total: triggerCounts?.total ?? 0,
                enabled: enabledTriggers?.count ?? 0,
            },
            bootScripts: {
                total: bootScriptCounts?.total ?? 0,
                enabled: enabledBootScripts?.count ?? 0,
            },
        },
        issues,
        suggestions,
    };
}

// ============================================================================
// Format Status Message
// ============================================================================

export function formatStatusMessage(report: StatusReport): string {
    const lines: string[] = [];
    const emoji = report.healthy ? "✅" : "⚠️";

    lines.push(`${emoji} **MaiaChat Status Report**`);
    lines.push(`📅 ${report.timestamp.toLocaleString()}`);
    lines.push("");

    // Daemon status
    const statusEmoji = report.daemonStatus === "running" ? "🟢" : "🔴";
    lines.push(`**Daemon:** ${statusEmoji} ${report.daemonStatus}${report.uptime ? ` (uptime: ${report.uptime})` : ""}`);

    // Channels
    const { channels } = report.services;
    lines.push(`**Channels:** ${channels.running}/${channels.total} connected`);
    if (channels.channels.length > 0) {
        for (const ch of channels.channels) {
            const chEmoji = ch.status === "running" ? "✓" : "✗";
            lines.push(`  ${chEmoji} ${ch.name}${ch.model ? ` (${ch.model})` : ""}`);
        }
    }

    // Scheduled Tasks
    const { scheduledTasks: tasks } = report.services;
    lines.push(`**Scheduled Tasks:** ${tasks.enabled}/${tasks.total} enabled`);
    if (tasks.upcomingTasks.length > 0) {
        const nextTask = tasks.upcomingTasks[0];
        if (nextTask.nextRun) {
            lines.push(`  ⏰ Next: "${nextTask.name}" at ${nextTask.nextRun.toLocaleString()}`);
        }
    }
    if (tasks.recentlyFailed > 0) {
        lines.push(`  ⚠️ ${tasks.recentlyFailed} task(s) with errors`);
    }

    // Issues
    if (report.issues.length > 0) {
        lines.push("");
        lines.push("**Issues Detected:**");
        for (const issue of report.issues) {
            const issueEmoji = issue.severity === "critical" ? "🚨" : issue.severity === "warning" ? "⚠️" : "ℹ️";
            lines.push(`${issueEmoji} [${issue.component}] ${issue.message}`);
            if (issue.suggestion) {
                lines.push(`   💡 ${issue.suggestion}`);
            }
        }
    }

    // Suggestions
    if (report.suggestions.length > 0 && report.issues.length === 0) {
        lines.push("");
        lines.push("**Suggestions:**");
        for (const suggestion of report.suggestions) {
            lines.push(`💡 ${suggestion}`);
        }
    }

    if (report.healthy && report.issues.length === 0) {
        lines.push("");
        lines.push("🎉 All systems operational!");
    }

    return lines.join("\n");
}

// ============================================================================
// Proactive Status Sender
// ============================================================================

class ProactiveStatusService {
    private static instance: ProactiveStatusService | null = null;
    private timer: NodeJS.Timeout | null = null;
    private running = false;
    private intervalMs = 60 * 60 * 1000; // Default: 1 hour
    private lastSentAt: Date | null = null;

    private constructor() {}

    static getInstance(): ProactiveStatusService {
        if (!ProactiveStatusService.instance) {
            ProactiveStatusService.instance = new ProactiveStatusService();
        }
        return ProactiveStatusService.instance;
    }

    /**
     * Start the proactive status service
     */
    start(intervalMs?: number): void {
        if (this.running) return;

        if (intervalMs) {
            this.intervalMs = intervalMs;
        }

        this.running = true;
        this.timer = setInterval(() => {
            void this.sendStatusReport();
        }, this.intervalMs);

        // Send initial status after 5 minutes
        setTimeout(() => {
            if (this.running) {
                void this.sendStatusReport();
            }
        }, 5 * 60 * 1000);

        console.log(`[ProactiveStatus] Started with interval: ${this.intervalMs / 1000 / 60} minutes`);
    }

    /**
     * Stop the service
     */
    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.running = false;
        console.log("[ProactiveStatus] Stopped");
    }

    /**
     * Check if running
     */
    isRunning(): boolean {
        return this.running;
    }

    /**
     * Get last sent time
     */
    getLastSentAt(): Date | null {
        return this.lastSentAt;
    }

    /**
     * Send status report to all admin channels
     */
    async sendStatusReport(): Promise<void> {
        try {
            const settings = await getAdminSettings();
            if (!settings.proactiveMessagingEnabled) {
                console.log("[ProactiveStatus] Proactive messaging disabled, skipping");
                return;
            }

            const report = await collectStatusReport();
            const message = formatStatusMessage(report);

            // Find admin users with active channels
            const adminUsers = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.role, "admin"));

            if (adminUsers.length === 0) {
                console.log("[ProactiveStatus] No admin users found");
                return;
            }

            // Send to first admin's first active channel
            const adminId = adminUsers[0].id;
            const adminChannels = backgroundService.getUserChannels(adminId);
            const connectedChannel = adminChannels.find((ch) => ch.connected);

            if (!connectedChannel) {
                console.log("[ProactiveStatus] No connected channels for admin");
                return;
            }

            // Get channel manager and send message
            const channelManager = getChannelManager();

            try {
                // Resolve the correct channelId for message delivery
                // channelAccountId is a UUID — we need the actual channel-specific ID
                let resolvedChannelId = connectedChannel.channelAccountId;

                // For Telegram, resolve a real chat_id from account config/inbound history.
                if (connectedChannel.channelType === "telegram") {
                    const resolved = await resolveTelegramChatIdFromAccount(connectedChannel.channelAccountId);
                    if (!resolved.chatId) {
                        console.log(`[ProactiveStatus] No valid Telegram chat ID found (${resolved.source}), skipping`);
                        return;
                    }
                    resolvedChannelId = resolved.chatId;
                }

                await channelManager.sendMessage(
                    adminId,
                    connectedChannel.channelType,
                    resolvedChannelId,
                    message
                );
                this.lastSentAt = new Date();
                console.log(`[ProactiveStatus] Status report sent to ${connectedChannel.channelType}`);
            } catch (sendError) {
                console.error("[ProactiveStatus] Failed to send via sendMessage:", sendError);
            }
        } catch (error) {
            console.error("[ProactiveStatus] Failed to send status report:", error);
        }
    }

    /**
     * Manually trigger a status report
     */
    async triggerReport(): Promise<StatusReport> {
        const report = await collectStatusReport();
        await this.sendStatusReport();
        return report;
    }
}

export const proactiveStatusService = ProactiveStatusService.getInstance();

export function startProactiveStatus(intervalMs?: number): void {
    proactiveStatusService.start(intervalMs);
}

export function stopProactiveStatus(): void {
    proactiveStatusService.stop();
}

export function isProactiveStatusRunning(): boolean {
    return proactiveStatusService.isRunning();
}
