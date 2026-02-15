/**
 * Background Agent Daemon
 *
 * Main daemon class that coordinates all background services:
 * - Scheduled task runner
 * - Event triggers
 * - Boot scripts
 * - Proactive messaging
 *
 * Singleton with graceful shutdown and health monitoring.
 */

import { db } from "@/lib/db";
import { backgroundAgentState } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { heartbeatManager, startHeartbeat, stopHeartbeat } from "./heartbeat";
import { emitBootEvent } from "./events";
import type {
    DaemonState,
    DaemonInfo,
    DaemonStatus,
    BackgroundServiceConfig,
} from "./types";
import { getAdminSettings, getDeploymentMode } from "@/lib/admin/settings";
import { getConfigSection } from "@/lib/config";

// ============================================================================
// Constants
// ============================================================================

const MAIN_AGENT_KEY = "main";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 900000;
const DEFAULT_STALE_THRESHOLD_MS = 2700000;
const DEFAULT_WATCHDOG_INTERVAL_MS = 60000;

let watchdogTimer: NodeJS.Timeout | null = null;
let watchdogInFlight = false;

// ============================================================================
// Background Daemon
// ============================================================================

class BackgroundDaemon {
    private static instance: BackgroundDaemon | null = null;
    private status: DaemonStatus = "stopped";
    private startedAt: Date | null = null;
    private config: BackgroundServiceConfig | null = null;
    private shutdownHandlers: Array<() => Promise<void>> = [];
    private isShuttingDown = false;

    private constructor() {
        // Register process handlers for graceful shutdown
        this.registerProcessHandlers();
    }

    static getInstance(): BackgroundDaemon {
        if (!BackgroundDaemon.instance) {
            BackgroundDaemon.instance = new BackgroundDaemon();
        }
        return BackgroundDaemon.instance;
    }

    /**
     * Start the daemon
     */
    async start(): Promise<boolean> {
        if (this.status === "running") {
            console.log("[Daemon] Already running");
            return true;
        }

        if (this.status === "starting") {
            console.log("[Daemon] Already starting");
            return false;
        }

        this.status = "starting";
        console.log("[Daemon] Starting background agent daemon...");

        try {
            // Load configuration from admin settings
            this.config = await this.loadConfig();

            // Check if daemon is enabled
            if (!this.config.daemonEnabled) {
                console.log("[Daemon] Background agent is disabled in admin settings");
                this.status = "stopped";
                return false;
            }

            // Check for leadership (stale process detection)
            const canClaim = await heartbeatManager.claimLeadership(
                MAIN_AGENT_KEY,
                this.config.staleThresholdMs
            );
            if (!canClaim) {
                console.log("[Daemon] Another process is already running as the background agent");
                this.status = "stopped";
                return false;
            }

            // Start heartbeat
            await startHeartbeat(MAIN_AGENT_KEY, {
                intervalMs: this.config.heartbeatIntervalMs,
                staleThresholdMs: this.config.staleThresholdMs,
            });

            // Mark as started in database
            await heartbeatManager.markStarted(MAIN_AGENT_KEY);

            // Start services
            await this.startServices();

            // Run boot scripts if enabled
            if (this.config.bootScriptsEnabled) {
                await this.runBootScripts();
            }

            this.status = "running";
            this.startedAt = new Date();

            console.log("[Daemon] Background agent daemon started successfully");
            return true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error("[Daemon] Failed to start:", error);

            await heartbeatManager.markStopped(MAIN_AGENT_KEY, errorMessage);
            stopHeartbeat(MAIN_AGENT_KEY);

            this.status = "error";
            return false;
        }
    }

    /**
     * Stop the daemon
     */
    async stop(): Promise<void> {
        if (this.status === "stopped") {
            console.log("[Daemon] Already stopped");
            return;
        }

        if (this.isShuttingDown) {
            console.log("[Daemon] Already shutting down");
            return;
        }

        this.isShuttingDown = true;
        this.status = "stopping";
        console.log("[Daemon] Stopping background agent daemon...");

        // Stop the watchdog so it doesn't auto-restart after manual stop
        stopDaemonWatchdog();

        try {
            // Stop services
            await this.stopServices();

            // Stop heartbeat
            stopHeartbeat(MAIN_AGENT_KEY);

            // Mark as stopped in database
            await heartbeatManager.markStopped(MAIN_AGENT_KEY);

            this.status = "stopped";
            this.startedAt = null;

            console.log("[Daemon] Background agent daemon stopped");
        } catch (error) {
            console.error("[Daemon] Error during shutdown:", error);
            const errorMessage = error instanceof Error ? error.message : "Shutdown error";
            await heartbeatManager.markStopped(MAIN_AGENT_KEY, errorMessage);
            this.status = "error";
        } finally {
            this.isShuttingDown = false;
        }
    }

    /**
     * Restart the daemon
     */
    async restart(): Promise<boolean> {
        console.log("[Daemon] Restarting...");
        await this.stop();
        return await this.start();
    }

    /**
     * Get daemon status
     */
    getStatus(): DaemonStatus {
        return this.status;
    }

    /**
     * Get daemon info
     */
    async getInfo(): Promise<DaemonInfo> {
        const processInfo = heartbeatManager.getProcessInfo();

        const [state] = await db
            .select()
            .from(backgroundAgentState)
            .where(eq(backgroundAgentState.agentKey, MAIN_AGENT_KEY))
            .limit(1);

        const lastHeartbeat = state?.lastHeartbeatAt
            ? Date.now() - state.lastHeartbeatAt.getTime()
            : null;

        // Derive actual status from database state, not in-memory status
        // This handles cases where daemon runs in a different process
        let actualStatus: DaemonStatus = this.status;
        if (state) {
            const staleThresholdMs = this.config?.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;
            const isHeartbeatRecent = lastHeartbeat !== null && lastHeartbeat < staleThresholdMs;
            if (isHeartbeatRecent && state.status === "running") {
                actualStatus = "running";
            } else if (state.status === "running" && !isHeartbeatRecent) {
                // Heartbeat is stale - daemon crashed or was killed
                actualStatus = "error";
            } else if (state.status === "stopped" || state.status === "error") {
                actualStatus = state.status as DaemonStatus;
            }
        }

        // Calculate uptime from database startedAt if in-memory startedAt is not available
        let uptime: number | null = null;
        if (this.startedAt) {
            uptime = Date.now() - this.startedAt.getTime();
        } else if (actualStatus === "running" && state?.startedAt) {
            uptime = Date.now() - state.startedAt.getTime();
        }

        return {
            agentKey: MAIN_AGENT_KEY,
            status: actualStatus,
            uptime,
            lastHeartbeat,
            processId: state?.processId ?? processInfo.processId,
            hostName: state?.hostName ?? processInfo.hostName,
            stats: {
                totalTasksRun: state?.totalTasksRun ?? 0,
                errorCount: state?.errorCount ?? 0,
            },
        };
    }

    /**
     * Get daemon state from database
     */
    async getState(): Promise<DaemonState | null> {
        const [state] = await db
            .select()
            .from(backgroundAgentState)
            .where(eq(backgroundAgentState.agentKey, MAIN_AGENT_KEY))
            .limit(1);

        if (!state) {
            return null;
        }

        return {
            agentKey: state.agentKey,
            status: state.status as DaemonStatus,
            startedAt: state.startedAt,
            stoppedAt: state.stoppedAt,
            lastHeartbeatAt: state.lastHeartbeatAt,
            heartbeatIntervalMs: state.heartbeatIntervalMs ?? this.config?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
            processId: state.processId,
            hostName: state.hostName,
            lastError: state.lastError,
            errorCount: state.errorCount ?? 0,
            totalTasksRun: state.totalTasksRun ?? 0,
            metadata: (state.metadata as Record<string, unknown>) ?? {},
        };
    }

    /**
     * Check if daemon is running
     */
    isRunning(): boolean {
        return this.status === "running";
    }

    /**
     * Register a shutdown handler
     */
    onShutdown(handler: () => Promise<void>): void {
        this.shutdownHandlers.push(handler);
    }

    /**
     * Load configuration from admin settings
     */
    private async loadConfig(): Promise<BackgroundServiceConfig> {
        const [settings, agentConfig, rateConfig] = await Promise.all([
            getAdminSettings(),
            getConfigSection("agents"),
            getConfigSection("rateLimits"),
        ]);
        const deploymentMode = getDeploymentMode();
        const isHostedMode = deploymentMode === "hosted";
        const heartbeatIntervalMs = agentConfig?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
        const staleThresholdMs = agentConfig?.staleThresholdMs ?? heartbeatIntervalMs * 3;

        return {
            daemonEnabled: settings.backgroundAgentEnabled ?? agentConfig.backgroundAgentEnabled ?? false,
            autoStartOnBoot: settings.backgroundAgentAutoStart ?? agentConfig.backgroundAgentAutoStart ?? false,
            heartbeatIntervalMs,
            staleThresholdMs,

            proactiveMessagingEnabled: settings.proactiveMessagingEnabled ?? agentConfig.proactiveMessagingEnabled ?? false,
            eventTriggersEnabled: settings.eventTriggersEnabled ?? agentConfig.eventTriggersEnabled ?? false,
            bootScriptsEnabled: settings.bootScriptsEnabled ?? agentConfig.bootScriptsEnabled ?? false,

            defaultProactiveMaxPerHour: rateConfig.proactiveMaxPerHour ?? settings.defaultProactiveMaxPerHour ?? 10,
            defaultProactiveMaxPerDay: rateConfig.proactiveMaxPerDay ?? settings.defaultProactiveMaxPerDay ?? 100,
            defaultTriggerMaxPerHour: rateConfig.triggerMaxPerHour ?? settings.defaultTriggerMaxPerHour ?? 60,

            isHostedMode,
            // Limits for hosted mode (to prevent abuse)
            maxTasksPerUser: isHostedMode ? 50 : 1000,
            maxTriggersPerUser: isHostedMode ? 25 : 500,
            maxBootScriptsPerUser: isHostedMode ? 10 : 100,
        };
    }

    /**
     * Start all background services
     */
    private async startServices(): Promise<void> {
        console.log("[Daemon] Starting background services...");

        // Initialize session manager for task recovery and sub-task spawning
        try {
            const { initializeSessionManager } = await import("@/lib/autonomous/session-manager");
            const result = await initializeSessionManager();
            console.log(`[Daemon] Session manager initialized: ${result.recoverableTasks} recoverable, ${result.pausedTasks} paused`);
        } catch (error) {
            console.error("[Daemon] Failed to initialize session manager:", error);
        }

        // Import and start the scheduled task runner
        try {
            if (
                process.env.MAIACHAT_DISABLE_AUTOSTART !== "1" &&
                process.env.MAIACHAT_DISABLE_SCHEDULER_BOOT !== "1"
            ) {
                const { startScheduledTaskRunner } = await import("@/lib/scheduler");
                startScheduledTaskRunner();
            }
            console.log("[Daemon] Scheduled task runner started");
        } catch (error) {
            console.error("[Daemon] Failed to start scheduled task runner:", error);
        }

        // Import and start the channel background service if auto-start is enabled
        if (this.config?.autoStartOnBoot) {
            try {
                const { backgroundService } = await import("@/lib/channels/background-service");
                await backgroundService.startAllChannels();
                console.log("[Daemon] Channel background service started");
            } catch (error) {
                console.error("[Daemon] Failed to start channel background service:", error);
            }
        }

        // Start event trigger service if enabled
        if (this.config?.eventTriggersEnabled) {
            try {
                const { startTriggerService } = await import("@/lib/events/trigger-service");
                await startTriggerService();
                console.log("[Daemon] Event trigger service started");
            } catch (error) {
                console.error("[Daemon] Failed to start event trigger service:", error);
            }
        }

        // Start proactive status service if enabled
        if (this.config?.proactiveMessagingEnabled) {
            try {
                const { startProactiveStatus } = await import("./proactive-status");
                // Send status every 30 minutes by default
                startProactiveStatus(30 * 60 * 1000);
                console.log("[Daemon] Proactive status service started");
            } catch (error) {
                console.error("[Daemon] Failed to start proactive status service:", error);
            }
        }

        // Start automated maintenance tasks (backup/health/audit)
        try {
            const { startMaintenanceService } = await import("./maintenance");
            startMaintenanceService();
            console.log("[Daemon] Maintenance service started");
        } catch (error) {
            console.error("[Daemon] Failed to start maintenance service:", error);
        }
    }

    /**
     * Stop all background services
     */
    private async stopServices(): Promise<void> {
        console.log("[Daemon] Stopping background services...");

        // Run registered shutdown handlers
        for (const handler of this.shutdownHandlers) {
            try {
                await handler();
            } catch (error) {
                console.error("[Daemon] Shutdown handler error:", error);
            }
        }

        // Stop scheduled task runner
        try {
            const { stopScheduledTaskRunner } = await import("@/lib/scheduler");
            stopScheduledTaskRunner();
            console.log("[Daemon] Scheduled task runner stopped");
        } catch (error) {
            console.error("[Daemon] Error stopping scheduled task runner:", error);
        }

        // Stop channel background service
        try {
            const { backgroundService } = await import("@/lib/channels/background-service");
            await backgroundService.shutdown();
            console.log("[Daemon] Channel background service stopped");
        } catch (error) {
            console.error("[Daemon] Error stopping channel background service:", error);
        }

        // Stop event trigger service
        try {
            const { stopTriggerService } = await import("@/lib/events/trigger-service");
            await stopTriggerService();
            console.log("[Daemon] Event trigger service stopped");
        } catch (error) {
            console.error("[Daemon] Error stopping event trigger service:", error);
        }

        // Stop proactive status service
        try {
            const { stopProactiveStatus } = await import("./proactive-status");
            stopProactiveStatus();
            console.log("[Daemon] Proactive status service stopped");
        } catch (error) {
            console.error("[Daemon] Error stopping proactive status service:", error);
        }

        // Stop maintenance service
        try {
            const { stopMaintenanceService } = await import("./maintenance");
            stopMaintenanceService();
            console.log("[Daemon] Maintenance service stopped");
        } catch (error) {
            console.error("[Daemon] Error stopping maintenance service:", error);
        }
    }

    /**
     * Run boot scripts
     */
    private async runBootScripts(): Promise<void> {
        console.log("[Daemon] Running boot scripts...");
        emitBootEvent("boot:started", MAIN_AGENT_KEY);

        try {
            const { runBootScripts } = await import("@/lib/boot/boot-runner");
            const result = await runBootScripts({ runOnServerStart: true });
            console.log(`[Daemon] Boot scripts completed: ${result.ran}/${result.total} scripts ran`);
            emitBootEvent("boot:completed", MAIN_AGENT_KEY, {
                scriptCount: result.total,
                ranCount: result.ran,
                errors: result.errors,
            });
        } catch (error) {
            console.error("[Daemon] Boot scripts failed:", error);
            emitBootEvent("boot:completed", MAIN_AGENT_KEY, {
                error: error instanceof Error ? error.message : "Boot scripts failed",
            });
        }
    }

    /**
     * Register process signal handlers for graceful shutdown
     */
    private registerProcessHandlers(): void {
        const gracefulShutdown = async (signal: string) => {
            console.log(`[Daemon] Received ${signal}, initiating graceful shutdown...`);
            await this.stop();
            process.exit(0);
        };

        // Only register once
        if (!process.listenerCount("SIGTERM")) {
            process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
        }
        if (!process.listenerCount("SIGINT")) {
            process.on("SIGINT", () => gracefulShutdown("SIGINT"));
        }
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const backgroundDaemon = BackgroundDaemon.getInstance();

// ============================================================================
// Convenience Functions
// ============================================================================

export async function startDaemon(): Promise<boolean> {
    return backgroundDaemon.start();
}

export async function stopDaemon(): Promise<void> {
    return backgroundDaemon.stop();
}

export async function restartDaemon(): Promise<boolean> {
    return backgroundDaemon.restart();
}

export function isDaemonRunning(): boolean {
    return backgroundDaemon.isRunning();
}

export function getDaemonStatus(): DaemonStatus {
    return backgroundDaemon.getStatus();
}

export async function getDaemonInfo(): Promise<DaemonInfo> {
    return backgroundDaemon.getInfo();
}

function startDaemonWatchdog(intervalMs = DEFAULT_WATCHDOG_INTERVAL_MS): void {
    if (watchdogTimer || typeof window !== "undefined" || process.env.NEXT_RUNTIME === "edge") {
        return;
    }

    watchdogTimer = setInterval(async () => {
        if (watchdogInFlight) return;
        watchdogInFlight = true;
        try {
            const agentConfig = await getConfigSection("agents");
            if (!agentConfig.backgroundAgentEnabled || !agentConfig.backgroundAgentAutoStart) {
                return;
            }

            const info = await getDaemonInfo();
            const status = info.status;
            if (status === "running" || status === "starting" || status === "stopping") {
                return;
            }

            console.warn(`[Daemon] Watchdog detected status=${status}; attempting auto-restart`);
            await startDaemon();
        } catch (error) {
            console.error("[Daemon] Watchdog check failed:", error);
        } finally {
            watchdogInFlight = false;
        }
    }, intervalMs);

    console.log(`[Daemon] Watchdog started (${intervalMs}ms interval)`);
}

export function stopDaemonWatchdog(): void {
    if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
        console.log("[Daemon] Watchdog stopped");
    }
}

/**
 * Initialize daemon on server startup (called from instrumentation or app startup)
 */
export async function initializeDaemon(): Promise<void> {
    try {
        const agentConfig = await getConfigSection("agents");
        if (agentConfig.backgroundAgentEnabled && agentConfig.backgroundAgentAutoStart) {
            console.log("[Daemon] Auto-starting background agent daemon...");
            await startDaemon();
            startDaemonWatchdog();
        } else {
            console.log("[Daemon] Background agent daemon not configured for auto-start");
        }
    } catch (error) {
        console.error("[Daemon] Failed to initialize daemon:", error);
    }
}
