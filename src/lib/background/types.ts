/**
 * Background Agent Types
 *
 * Type definitions for the background agent system including:
 * - Daemon status and state
 * - Heartbeat system
 * - Event broadcasting
 * - Service configuration
 */

// ============================================================================
// Daemon Types
// ============================================================================

export type DaemonStatus = "running" | "stopped" | "error" | "starting" | "stopping";

export interface DaemonState {
    agentKey: string;
    status: DaemonStatus;
    startedAt: Date | null;
    stoppedAt: Date | null;
    lastHeartbeatAt: Date | null;
    heartbeatIntervalMs: number;
    processId: string | null;
    hostName: string | null;
    lastError: string | null;
    errorCount: number;
    totalTasksRun: number;
    metadata: Record<string, unknown>;
}

export interface DaemonInfo {
    agentKey: string;
    status: DaemonStatus;
    uptime: number | null; // milliseconds since start
    lastHeartbeat: number | null; // milliseconds since last heartbeat
    processId: string | null;
    hostName: string | null;
    stats: {
        totalTasksRun: number;
        errorCount: number;
    };
}

// ============================================================================
// Heartbeat Types
// ============================================================================

export interface HeartbeatConfig {
    intervalMs: number;
    staleThresholdMs: number; // How long before a process is considered stale
    maxRetries: number;
}

export interface HeartbeatStatus {
    isHealthy: boolean;
    lastBeat: Date | null;
    missedBeats: number;
    isStale: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

export type BackgroundEventType =
    | "daemon:started"
    | "daemon:stopped"
    | "daemon:error"
    | "daemon:heartbeat"
    | "task:started"
    | "task:completed"
    | "task:failed"
    | "trigger:fired"
    | "trigger:completed"
    | "boot:started"
    | "boot:completed"
    | "message:sent"
    | "message:failed";

export interface BackgroundEvent<T = unknown> {
    type: BackgroundEventType;
    timestamp: Date;
    agentKey: string;
    payload: T;
}

export interface TaskEvent {
    taskId: string;
    taskName: string;
    userId: string;
    channelAccountId?: string;
    status: "started" | "completed" | "failed";
    error?: string;
    output?: string;
    durationMs?: number;
}

export interface TriggerEvent {
    triggerId: string;
    triggerName: string;
    userId: string;
    sourceType: string;
    status: "fired" | "completed" | "failed" | "rate_limited";
    error?: string;
    durationMs?: number;
}

export interface MessageEvent {
    userId: string;
    channelAccountId: string;
    channelType: string;
    targetId: string;
    status: "sent" | "failed";
    error?: string;
}

// ============================================================================
// Service Configuration Types
// ============================================================================

export interface BackgroundServiceConfig {
    // Daemon settings
    daemonEnabled: boolean;
    autoStartOnBoot: boolean;
    heartbeatIntervalMs: number;
    staleThresholdMs: number;

    // Feature flags (controlled by admin settings)
    proactiveMessagingEnabled: boolean;
    eventTriggersEnabled: boolean;
    bootScriptsEnabled: boolean;

    // Rate limiting defaults
    defaultProactiveMaxPerHour: number;
    defaultProactiveMaxPerDay: number;
    defaultTriggerMaxPerHour: number;

    // Security (for hosted mode)
    isHostedMode: boolean;
    maxTasksPerUser: number;
    maxTriggersPerUser: number;
    maxBootScriptsPerUser: number;
}

export const DEFAULT_SERVICE_CONFIG: BackgroundServiceConfig = {
    daemonEnabled: false,
    autoStartOnBoot: false,
    heartbeatIntervalMs: 900000,
    staleThresholdMs: 2700000, // 3x heartbeat interval

    proactiveMessagingEnabled: false,
    eventTriggersEnabled: false,
    bootScriptsEnabled: false,

    defaultProactiveMaxPerHour: 10,
    defaultProactiveMaxPerDay: 100,
    defaultTriggerMaxPerHour: 60,

    isHostedMode: false,
    maxTasksPerUser: 100,
    maxTriggersPerUser: 50,
    maxBootScriptsPerUser: 20,
};

// ============================================================================
// Activity Log Types
// ============================================================================

export interface BackgroundActivityLog {
    id: string;
    timestamp: Date;
    eventType: BackgroundEventType;
    agentKey: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    status: "success" | "error" | "skipped";
    message: string;
    metadata?: Record<string, unknown>;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface BackgroundStatusResponse {
    daemon: DaemonInfo;
    services: {
        scheduler: { running: boolean; taskCount: number };
        triggers: { enabled: boolean; activeCount: number };
        bootScripts: { enabled: boolean; scriptCount: number };
    };
    recentActivity: BackgroundActivityLog[];
}

export interface BackgroundControlResponse {
    success: boolean;
    action: "start" | "stop" | "restart";
    previousStatus: DaemonStatus;
    newStatus: DaemonStatus;
    error?: string;
}
