/**
 * Background Agent Status API
 *
 * GET - Get daemon status, uptime, and stats
 * PATCH - Start/stop daemon (admin only)
 * POST - Trigger actions (send status report, fix issues)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users, backgroundAgentState, scheduledTasks, eventTriggers, bootScripts, channelAccounts } from "@/lib/db/schema";
import { eq, and, count, isNotNull } from "drizzle-orm";
import {
    backgroundDaemon,
    startDaemon,
    stopDaemon,
    restartDaemon,
    getDaemonInfo,
    getRecentActivity,
    collectStatusReport,
    proactiveStatusService,
} from "@/lib/background";
import { backgroundService } from "@/lib/channels/background-service";
import { getAdminSettings, getDeploymentMode } from "@/lib/admin/settings";
import { getConfig } from "@/lib/config";
import { ensureBackgroundDaemonInitialized } from "@/lib/background/boot";

// ============================================================================
// GET - Get daemon status
// ============================================================================

export async function GET(request: NextRequest) {
    try {
        await ensureBackgroundDaemonInitialized("background_status_api");
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check if user is admin
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        const isAdmin = user?.role === "admin";

        // Get daemon info
        const daemonInfo = await getDaemonInfo();

        // Get comprehensive status report
        const statusReport = await collectStatusReport();

        // Get service counts
        const [taskCount] = await db
            .select({ count: count() })
            .from(scheduledTasks)
            .where(eq(scheduledTasks.isEnabled, true));

        const [triggerCount] = await db
            .select({ count: count() })
            .from(eventTriggers)
            .where(eq(eventTriggers.isEnabled, true));

        const [bootScriptCount] = await db
            .select({ count: count() })
            .from(bootScripts)
            .where(eq(bootScripts.isEnabled, true));

        // Get channel details from backgroundService (same source as Channels page)
        // This is the authoritative source for running channels
        const runningChannels = backgroundService.getRunningChannels();

        // Get all active channel accounts from database
        const activeChannelsList = await db
            .select({
                id: channelAccounts.id,
                userId: channelAccounts.userId,
                channelType: channelAccounts.channelType,
                channelId: channelAccounts.channelId,
            })
            .from(channelAccounts)
            .where(eq(channelAccounts.isActive, true));

        // Build channel list - check if each account has a running channel in backgroundService
        const channelsList = activeChannelsList.map((account) => {
            // Find matching running channel from backgroundService
            const runningState = runningChannels.find(
                (ch) => ch.channelAccountId === account.id
            );

            return {
                type: account.channelType,
                connected: runningState?.running && runningState?.connected ? true : false,
                model: runningState?.model,
                provider: runningState?.provider,
                lastError: runningState?.lastError,
            };
        });

        const connectedChannelsCount = channelsList.filter((ch) => ch.connected).length;

        // Get upcoming scheduled tasks with details
        const upcomingTasks = await db
            .select({
                id: scheduledTasks.id,
                name: scheduledTasks.name,
                nextRunAt: scheduledTasks.nextRunAt,
                lastRunAt: scheduledTasks.lastRunAt,
                lastError: scheduledTasks.lastError,
                cron: scheduledTasks.cron,
                channelAccountId: scheduledTasks.channelAccountId,
            })
            .from(scheduledTasks)
            .where(eq(scheduledTasks.isEnabled, true))
            .orderBy(scheduledTasks.nextRunAt)
            .limit(10);

        // Get admin settings
        const [settings, config] = await Promise.all([
            getAdminSettings(),
            getConfig(),
        ]);
        const deploymentMode = getDeploymentMode();

        // Get recent activity (last 20 events)
        const recentActivity = getRecentActivity(20);

        // Proactive status info
        const proactiveStatus = {
            running: proactiveStatusService.isRunning(),
            lastSentAt: proactiveStatusService.getLastSentAt(),
        };

        return NextResponse.json({
            daemon: daemonInfo,
            services: {
                scheduler: {
                    running: daemonInfo.status === "running",
                    taskCount: taskCount?.count ?? 0,
                },
                triggers: {
                    enabled: settings.eventTriggersEnabled ?? false,
                    activeCount: triggerCount?.count ?? 0,
                },
                bootScripts: {
                    enabled: settings.bootScriptsEnabled ?? false,
                    scriptCount: bootScriptCount?.count ?? 0,
                },
            },
            channels: {
                total: activeChannelsList.length,
                running: connectedChannelsCount,
                list: channelsList,
            },
            scheduledTasks: upcomingTasks.map((t) => ({
                id: t.id,
                name: t.name,
                nextRunAt: t.nextRunAt,
                lastRunAt: t.lastRunAt,
                lastError: t.lastError,
                cron: t.cron,
                hasChannel: !!t.channelAccountId,
            })),
            healthReport: {
                healthy: statusReport.healthy,
                issues: statusReport.issues,
                suggestions: statusReport.suggestions,
            },
            proactiveStatus,
            config: {
                backgroundAgentEnabled: config.agents.backgroundAgentEnabled,
                backgroundAgentAutoStart: config.agents.backgroundAgentAutoStart,
                proactiveMessagingEnabled: config.agents.proactiveMessagingEnabled,
                eventTriggersEnabled: config.agents.eventTriggersEnabled,
                bootScriptsEnabled: config.agents.bootScriptsEnabled,
                deploymentMode,
            },
            recentActivity,
            isAdmin,
        });
    } catch (error) {
        console.error("[API] Background status error:", error);
        return NextResponse.json(
            { error: "Failed to get background status" },
            { status: 500 }
        );
    }
}

// ============================================================================
// PATCH - Control daemon (admin only)
// ============================================================================

export async function PATCH(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check if user is admin
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user?.role !== "admin") {
            return NextResponse.json(
                { error: "Admin access required" },
                { status: 403 }
            );
        }

        // Check deployment mode - only allow daemon control in self-hosted/local mode
        const deploymentMode = getDeploymentMode();
        if (deploymentMode === "hosted") {
            return NextResponse.json(
                { error: "Daemon control is not available in hosted mode" },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { action } = body as { action: "start" | "stop" | "restart" };

        if (!action || !["start", "stop", "restart"].includes(action)) {
            return NextResponse.json(
                { error: "Invalid action. Must be 'start', 'stop', or 'restart'" },
                { status: 400 }
            );
        }

        const previousStatus = backgroundDaemon.getStatus();
        let success = false;
        let error: string | undefined;

        switch (action) {
            case "start":
                success = await startDaemon();
                if (!success) {
                    error = "Failed to start daemon (may be disabled in settings or another process is running)";
                }
                break;
            case "stop":
                await stopDaemon();
                success = true;
                break;
            case "restart":
                success = await restartDaemon();
                if (!success) {
                    error = "Failed to restart daemon";
                }
                break;
        }

        const newStatus = backgroundDaemon.getStatus();

        return NextResponse.json({
            success,
            action,
            previousStatus,
            newStatus,
            error,
        });
    } catch (error) {
        console.error("[API] Background control error:", error);
        return NextResponse.json(
            { error: "Failed to control daemon" },
            { status: 500 }
        );
    }
}

// ============================================================================
// POST - Trigger actions (send status report, activate channels)
// ============================================================================

export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check if user is admin
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user?.role !== "admin") {
            return NextResponse.json(
                { error: "Admin access required" },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { action, data } = body as { action: string; data?: Record<string, unknown> };

        switch (action) {
            case "send-status-report": {
                // Trigger a status report to be sent to connected channels
                const report = await proactiveStatusService.triggerReport();
                return NextResponse.json({
                    success: true,
                    action,
                    report: {
                        healthy: report.healthy,
                        issueCount: report.issues.length,
                        sentAt: new Date().toISOString(),
                    },
                });
            }

            case "activate-all-channels": {
                // Activate all configured channels
                await backgroundService.startAllChannels();
                const running = backgroundService.getRunningChannels();
                return NextResponse.json({
                    success: true,
                    action,
                    channelsActivated: running.length,
                });
            }

            default:
                return NextResponse.json(
                    { error: `Unknown action: ${action}` },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error("[API] Background action error:", error);
        return NextResponse.json(
            { error: "Failed to execute action" },
            { status: 500 }
        );
    }
}
