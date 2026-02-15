/**
 * Background Event System
 *
 * In-memory event emitter for real-time updates.
 * Can be extended to use Redis pub/sub for multi-instance deployments.
 */

import { EventEmitter } from "events";
import type {
    BackgroundEvent,
    BackgroundEventType,
    TaskEvent,
    TriggerEvent,
    MessageEvent,
    BackgroundActivityLog,
} from "./types";

// ============================================================================
// Event Emitter Singleton
// ============================================================================

class BackgroundEventEmitter extends EventEmitter {
    private static instance: BackgroundEventEmitter | null = null;
    private activityLog: BackgroundActivityLog[] = [];
    private readonly maxLogSize = 1000;

    private constructor() {
        super();
        this.setMaxListeners(100);
    }

    static getInstance(): BackgroundEventEmitter {
        if (!BackgroundEventEmitter.instance) {
            BackgroundEventEmitter.instance = new BackgroundEventEmitter();
        }
        return BackgroundEventEmitter.instance;
    }

    /**
     * Emit a background event
     */
    emitEvent<T>(type: BackgroundEventType, agentKey: string, payload: T): void {
        const event: BackgroundEvent<T> = {
            type,
            timestamp: new Date(),
            agentKey,
            payload,
        };

        this.emit(type, event);
        this.emit("*", event); // Wildcard listener for all events

        // Log the event
        this.logActivity(event);
    }

    /**
     * Subscribe to a specific event type
     */
    subscribe<T>(
        type: BackgroundEventType | "*",
        handler: (event: BackgroundEvent<T>) => void
    ): () => void {
        this.on(type, handler);
        return () => this.off(type, handler);
    }

    /**
     * Subscribe to all events
     */
    subscribeAll<T>(handler: (event: BackgroundEvent<T>) => void): () => void {
        return this.subscribe("*", handler);
    }

    /**
     * Log activity for later retrieval
     */
    private logActivity(event: BackgroundEvent): void {
        const log: BackgroundActivityLog = {
            id: `${event.timestamp.getTime()}-${Math.random().toString(36).slice(2, 9)}`,
            timestamp: event.timestamp,
            eventType: event.type,
            agentKey: event.agentKey,
            status: this.getStatusFromEvent(event),
            message: this.getMessageFromEvent(event),
            metadata: event.payload as Record<string, unknown>,
        };

        // Extract user/resource info if available
        const payload = event.payload as Record<string, unknown>;
        if (payload?.userId) log.userId = payload.userId as string;
        if (payload?.taskId) {
            log.resourceType = "task";
            log.resourceId = payload.taskId as string;
        }
        if (payload?.triggerId) {
            log.resourceType = "trigger";
            log.resourceId = payload.triggerId as string;
        }

        this.activityLog.unshift(log);

        // Trim log to max size
        if (this.activityLog.length > this.maxLogSize) {
            this.activityLog = this.activityLog.slice(0, this.maxLogSize);
        }
    }

    /**
     * Get status from event
     */
    private getStatusFromEvent(event: BackgroundEvent): "success" | "error" | "skipped" {
        const payload = event.payload as Record<string, unknown>;
        if (event.type.includes("error") || event.type.includes("failed")) {
            return "error";
        }
        if (payload?.status === "failed" || payload?.status === "error") {
            return "error";
        }
        if (payload?.status === "skipped" || payload?.status === "rate_limited") {
            return "skipped";
        }
        return "success";
    }

    /**
     * Get human-readable message from event
     */
    private getMessageFromEvent(event: BackgroundEvent): string {
        const payload = event.payload as Record<string, unknown>;

        switch (event.type) {
            case "daemon:started":
                return "Background daemon started";
            case "daemon:stopped":
                return "Background daemon stopped";
            case "daemon:error":
                return `Daemon error: ${payload?.error || "Unknown error"}`;
            case "daemon:heartbeat":
                return "Heartbeat recorded";
            case "task:started":
                return `Task "${payload?.taskName || "unknown"}" started`;
            case "task:completed":
                return `Task "${payload?.taskName || "unknown"}" completed`;
            case "task:failed":
                return `Task "${payload?.taskName || "unknown"}" failed: ${payload?.error || "Unknown error"}`;
            case "trigger:fired":
                return `Trigger "${payload?.triggerName || "unknown"}" fired`;
            case "trigger:completed":
                return `Trigger "${payload?.triggerName || "unknown"}" completed`;
            case "boot:started":
                return "Boot scripts execution started";
            case "boot:completed":
                return "Boot scripts execution completed";
            case "message:sent":
                return `Proactive message sent to ${payload?.channelType || "channel"}`;
            case "message:failed":
                return `Failed to send message: ${payload?.error || "Unknown error"}`;
            default:
                return `Event: ${event.type}`;
        }
    }

    /**
     * Get recent activity logs
     */
    getRecentActivity(limit = 50): BackgroundActivityLog[] {
        return this.activityLog.slice(0, limit);
    }

    /**
     * Get activity logs for a specific user
     */
    getUserActivity(userId: string, limit = 50): BackgroundActivityLog[] {
        return this.activityLog
            .filter((log) => log.userId === userId)
            .slice(0, limit);
    }

    /**
     * Clear activity logs
     */
    clearActivityLog(): void {
        this.activityLog = [];
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const backgroundEvents = BackgroundEventEmitter.getInstance();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Emit a daemon event
 */
export function emitDaemonEvent(
    type: "daemon:started" | "daemon:stopped" | "daemon:error" | "daemon:heartbeat",
    agentKey: string,
    payload: { error?: string; [key: string]: unknown } = {}
): void {
    backgroundEvents.emitEvent(type, agentKey, payload);
}

/**
 * Emit a task event
 */
export function emitTaskEvent(
    type: "task:started" | "task:completed" | "task:failed",
    agentKey: string,
    event: TaskEvent
): void {
    backgroundEvents.emitEvent(type, agentKey, event);
}

/**
 * Emit a trigger event
 */
export function emitTriggerEvent(
    type: "trigger:fired" | "trigger:completed",
    agentKey: string,
    event: TriggerEvent
): void {
    backgroundEvents.emitEvent(type, agentKey, event);
}

/**
 * Emit a message event
 */
export function emitMessageEvent(
    type: "message:sent" | "message:failed",
    agentKey: string,
    event: MessageEvent
): void {
    backgroundEvents.emitEvent(type, agentKey, event);
}

/**
 * Emit a boot event
 */
export function emitBootEvent(
    type: "boot:started" | "boot:completed",
    agentKey: string,
    payload: { scriptCount?: number; error?: string; [key: string]: unknown } = {}
): void {
    backgroundEvents.emitEvent(type, agentKey, payload);
}

/**
 * Subscribe to background events
 */
export function subscribeToEvents(
    handler: (event: BackgroundEvent) => void
): () => void {
    return backgroundEvents.subscribeAll(handler);
}

/**
 * Get recent activity
 */
export function getRecentActivity(limit = 50): BackgroundActivityLog[] {
    return backgroundEvents.getRecentActivity(limit);
}
