/**
 * Background Agent Module
 *
 * Exports all background agent functionality.
 */

// Types
export * from "./types";

// Event system
export {
    backgroundEvents,
    emitDaemonEvent,
    emitTaskEvent,
    emitTriggerEvent,
    emitMessageEvent,
    emitBootEvent,
    subscribeToEvents,
    getRecentActivity,
} from "./events";

// Heartbeat system
export {
    heartbeatManager,
    startHeartbeat,
    stopHeartbeat,
    getHeartbeatStatus,
    isProcessStale,
} from "./heartbeat";

// Main daemon
export {
    backgroundDaemon,
    startDaemon,
    stopDaemon,
    restartDaemon,
    isDaemonRunning,
    getDaemonStatus,
    getDaemonInfo,
    initializeDaemon,
} from "./daemon";

// Proactive status service
export {
    proactiveStatusService,
    startProactiveStatus,
    stopProactiveStatus,
    isProactiveStatusRunning,
    collectStatusReport,
    formatStatusMessage,
    type StatusReport,
    type HealthIssue,
} from "./proactive-status";
