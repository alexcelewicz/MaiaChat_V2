/**
 * Background Agent Heartbeat System
 *
 * Persists heartbeat to database every 30s for:
 * - Health monitoring
 * - Stale process detection
 * - Multi-instance coordination
 */

import { db } from "@/lib/db";
import { backgroundAgentState } from "@/lib/db/schema";
import { eq, lt } from "drizzle-orm";
import { emitDaemonEvent } from "./events";
import type { HeartbeatConfig, HeartbeatStatus } from "./types";
import os from "os";

// ============================================================================
// Heartbeat Manager
// ============================================================================

class HeartbeatManager {
    private static instance: HeartbeatManager | null = null;
    private timers: Map<string, NodeJS.Timeout> = new Map();
    private configs: Map<string, HeartbeatConfig> = new Map();
    private processId: string;
    private hostName: string;

    private constructor() {
        this.processId = `${process.pid}-${Date.now()}`;
        this.hostName = os.hostname();
    }

    static getInstance(): HeartbeatManager {
        if (!HeartbeatManager.instance) {
            HeartbeatManager.instance = new HeartbeatManager();
        }
        return HeartbeatManager.instance;
    }

    /**
     * Start heartbeat for an agent
     */
    async start(agentKey: string, config?: Partial<HeartbeatConfig>): Promise<void> {
        // Stop existing heartbeat if any
        this.stop(agentKey);

        const heartbeatConfig: HeartbeatConfig = {
            intervalMs: config?.intervalMs ?? 900000,
            staleThresholdMs: config?.staleThresholdMs ?? 2700000,
            maxRetries: config?.maxRetries ?? 3,
        };

        this.configs.set(agentKey, heartbeatConfig);

        // Ensure agent state record exists
        await this.ensureAgentState(agentKey, heartbeatConfig.intervalMs);

        // Perform initial heartbeat
        await this.beat(agentKey);

        // Start periodic heartbeat
        const timer = setInterval(async () => {
            try {
                await this.beat(agentKey);
            } catch (error) {
                console.error(`[Heartbeat] Error for ${agentKey}:`, error);
                emitDaemonEvent("daemon:error", agentKey, {
                    error: error instanceof Error ? error.message : "Heartbeat failed",
                });
            }
        }, heartbeatConfig.intervalMs);

        this.timers.set(agentKey, timer);
        console.log(`[Heartbeat] Started for ${agentKey} (${heartbeatConfig.intervalMs}ms interval)`);
    }

    /**
     * Stop heartbeat for an agent
     */
    stop(agentKey: string): void {
        const timer = this.timers.get(agentKey);
        if (timer) {
            clearInterval(timer);
            this.timers.delete(agentKey);
            this.configs.delete(agentKey);
            console.log(`[Heartbeat] Stopped for ${agentKey}`);
        }
    }

    /**
     * Stop all heartbeats
     */
    stopAll(): void {
        for (const [agentKey] of this.timers) {
            this.stop(agentKey);
        }
    }

    /**
     * Perform a single heartbeat
     */
    async beat(agentKey: string): Promise<void> {
        const now = new Date();

        await db
            .update(backgroundAgentState)
            .set({
                lastHeartbeatAt: now,
                processId: this.processId,
                hostName: this.hostName,
                updatedAt: now,
            })
            .where(eq(backgroundAgentState.agentKey, agentKey));

        emitDaemonEvent("daemon:heartbeat", agentKey, {
            processId: this.processId,
            hostName: this.hostName,
        });
    }

    /**
     * Ensure agent state record exists in database
     */
    private async ensureAgentState(agentKey: string, heartbeatIntervalMs: number): Promise<void> {
        const [existing] = await db
            .select()
            .from(backgroundAgentState)
            .where(eq(backgroundAgentState.agentKey, agentKey))
            .limit(1);

        if (!existing) {
            await db.insert(backgroundAgentState).values({
                agentKey,
                status: "stopped",
                heartbeatIntervalMs,
                processId: this.processId,
                hostName: this.hostName,
            });
        }
    }

    /**
     * Get heartbeat status for an agent
     */
    async getStatus(agentKey: string): Promise<HeartbeatStatus> {
        const config = this.configs.get(agentKey);
        const staleThreshold = config?.staleThresholdMs ?? 90000;

        const [state] = await db
            .select()
            .from(backgroundAgentState)
            .where(eq(backgroundAgentState.agentKey, agentKey))
            .limit(1);

        if (!state) {
            return {
                isHealthy: false,
                lastBeat: null,
                missedBeats: 0,
                isStale: true,
            };
        }

        const lastBeat = state.lastHeartbeatAt;
        const now = Date.now();
        const timeSinceLastBeat = lastBeat ? now - lastBeat.getTime() : Infinity;
        const intervalMs = state.heartbeatIntervalMs ?? 30000;
        const missedBeats = Math.floor(timeSinceLastBeat / intervalMs);
        const isStale = timeSinceLastBeat > staleThreshold;
        const isHealthy = state.status === "running" && !isStale;

        return {
            isHealthy,
            lastBeat,
            missedBeats,
            isStale,
        };
    }

    /**
     * Check if a process is stale (hasn't heartbeated in too long)
     */
    async isStale(agentKey: string): Promise<boolean> {
        const status = await this.getStatus(agentKey);
        return status.isStale;
    }

    /**
     * Claim leadership by checking for stale processes
     * Returns true if this process should take over
     */
    async claimLeadership(agentKey: string, staleThresholdOverrideMs?: number): Promise<boolean> {
        const config = this.configs.get(agentKey);
        const staleThreshold = staleThresholdOverrideMs ?? config?.staleThresholdMs ?? 90000;

        const [state] = await db
            .select()
            .from(backgroundAgentState)
            .where(eq(backgroundAgentState.agentKey, agentKey))
            .limit(1);

        if (!state) {
            // No existing state, we can claim
            return true;
        }

        // If it's our process, we already have leadership
        if (state.processId === this.processId) {
            return true;
        }

        // If the process is running but stale, we can take over
        if (state.status === "running") {
            const lastBeat = state.lastHeartbeatAt;
            if (!lastBeat) {
                return true;
            }
            const timeSinceLastBeat = Date.now() - lastBeat.getTime();
            if (timeSinceLastBeat > staleThreshold) {
                console.log(
                    `[Heartbeat] Stale process detected for ${agentKey} ` +
                    `(last beat ${Math.round(timeSinceLastBeat / 1000)}s ago), claiming leadership`
                );
                return true;
            }
            // Another process is actively running
            return false;
        }

        // Process is stopped, we can claim
        return true;
    }

    /**
     * Mark agent as started
     */
    async markStarted(agentKey: string): Promise<void> {
        const now = new Date();
        await db
            .update(backgroundAgentState)
            .set({
                status: "running",
                startedAt: now,
                stoppedAt: null,
                lastHeartbeatAt: now,
                processId: this.processId,
                hostName: this.hostName,
                lastError: null,
                updatedAt: now,
            })
            .where(eq(backgroundAgentState.agentKey, agentKey));

        emitDaemonEvent("daemon:started", agentKey, {
            processId: this.processId,
            hostName: this.hostName,
        });
    }

    /**
     * Mark agent as stopped
     */
    async markStopped(agentKey: string, error?: string): Promise<void> {
        const now = new Date();
        const status = error ? "error" : "stopped";

        // Only update if this process owns the agent
        const [state] = await db
            .select()
            .from(backgroundAgentState)
            .where(eq(backgroundAgentState.agentKey, agentKey))
            .limit(1);

        if (state && state.processId !== this.processId) {
            console.log(`[Heartbeat] Not marking ${agentKey} as stopped - owned by different process`);
            return;
        }

        await db
            .update(backgroundAgentState)
            .set({
                status,
                stoppedAt: now,
                lastError: error ?? null,
                errorCount: error ? (state?.errorCount ?? 0) + 1 : state?.errorCount ?? 0,
                updatedAt: now,
            })
            .where(eq(backgroundAgentState.agentKey, agentKey));

        if (error) {
            emitDaemonEvent("daemon:error", agentKey, { error });
        } else {
            emitDaemonEvent("daemon:stopped", agentKey, {});
        }
    }

    /**
     * Increment task count
     */
    async incrementTaskCount(agentKey: string): Promise<void> {
        const [state] = await db
            .select({ count: backgroundAgentState.totalTasksRun })
            .from(backgroundAgentState)
            .where(eq(backgroundAgentState.agentKey, agentKey))
            .limit(1);

        await db
            .update(backgroundAgentState)
            .set({
                totalTasksRun: (state?.count ?? 0) + 1,
                updatedAt: new Date(),
            })
            .where(eq(backgroundAgentState.agentKey, agentKey));
    }

    /**
     * Get process info
     */
    getProcessInfo(): { processId: string; hostName: string } {
        return {
            processId: this.processId,
            hostName: this.hostName,
        };
    }

    /**
     * Clean up stale processes (for admin/maintenance)
     */
    async cleanupStaleProcesses(staleThresholdMs = 300000): Promise<number> {
        const staleTime = new Date(Date.now() - staleThresholdMs);

        const result = await db
            .update(backgroundAgentState)
            .set({
                status: "stopped",
                stoppedAt: new Date(),
                lastError: "Process became stale and was cleaned up",
                updatedAt: new Date(),
            })
            .where(
                lt(backgroundAgentState.lastHeartbeatAt, staleTime)
            );

        return 0; // Drizzle doesn't return count, would need raw query
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const heartbeatManager = HeartbeatManager.getInstance();

// ============================================================================
// Convenience Functions
// ============================================================================

export function startHeartbeat(agentKey: string, config?: Partial<HeartbeatConfig>): Promise<void> {
    return heartbeatManager.start(agentKey, config);
}

export function stopHeartbeat(agentKey: string): void {
    heartbeatManager.stop(agentKey);
}

export function getHeartbeatStatus(agentKey: string): Promise<HeartbeatStatus> {
    return heartbeatManager.getStatus(agentKey);
}

export function isProcessStale(agentKey: string): Promise<boolean> {
    return heartbeatManager.isStale(agentKey);
}
