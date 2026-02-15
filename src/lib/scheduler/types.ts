/**
 * Scheduler Types
 *
 * Type definitions for the enhanced scheduled task system.
 * Compatible with Clawdbot's scheduling model.
 */

// Re-export schema types for convenience
export type {
    CronSchedule,
    CronPayload,
    CronJobState,
} from "@/lib/db/schema";

// ============================================================================
// Schedule Types
// ============================================================================

/**
 * Parsed schedule with computed next run time
 */
export interface ParsedSchedule {
    kind: "at" | "every" | "cron";
    nextRunAt: Date | null;
    isOneShot: boolean;
    humanReadable: string;
}

/**
 * Schedule validation result
 */
export interface ScheduleValidation {
    valid: boolean;
    error?: string;
    nextRun?: Date;
}

// ============================================================================
// Payload Types
// ============================================================================

/**
 * Payload execution context
 */
export interface PayloadContext {
    userId: string;
    taskId: string;
    taskName: string;
    channelAccountId?: string;
    sessionTarget: "main" | "isolated";
    includeRecentMessages: number;
    isolation?: {
        maxTokens?: number;
        timeout?: number;
    };
}

/**
 * Payload execution result
 */
export interface PayloadResult {
    success: boolean;
    output?: string;
    error?: string;
    durationMs: number;
    tokensUsed?: {
        input: number;
        output: number;
    };
    deliveredTo?: string; // Channel/target where message was delivered
}

// ============================================================================
// Task Execution Types
// ============================================================================

/**
 * Task run context
 */
export interface TaskRunContext {
    taskId: string;
    userId: string;
    channelAccountId?: string;
    runAt: Date;
    isManualRun: boolean;
}

/**
 * Task run result
 */
export interface TaskRunResult {
    success: boolean;
    output?: string;
    error?: string;
    nextRunAt: Date | null;
    durationMs: number;
    payloadResult?: PayloadResult;
}

// ============================================================================
// Cron Job Types
// ============================================================================

/**
 * Active cron job handle
 */
export interface CronJobHandle {
    taskId: string;
    userId: string;
    stop: () => void;
    getNextRun: () => Date | null;
    isRunning: () => boolean;
}

/**
 * Cron service statistics
 */
export interface CronServiceStats {
    activeJobs: number;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    lastRunAt: Date | null;
}

// ============================================================================
// Timer Types
// ============================================================================

/**
 * Timer job configuration
 */
export interface TimerJobConfig {
    taskId: string;
    userId: string;
    schedule: import("@/lib/db/schema").CronSchedule;
    payload: import("@/lib/db/schema").CronPayload;
    channelAccountId?: string;
    sessionTarget: "main" | "isolated";
    includeRecentMessages: number;
    isolation?: {
        maxTokens?: number;
        timeout?: number;
    };
    onComplete?: (result: TaskRunResult) => void;
    onError?: (error: Error) => void;
}

// ============================================================================
// Migration Types (for backward compatibility)
// ============================================================================

/**
 * Legacy task format (before Phase H)
 */
export interface LegacyScheduledTask {
    id: string;
    name: string;
    prompt: string;
    cron: string;
    timezone?: string;
}

/**
 * Convert legacy task to new format
 */
export function convertLegacyTask(legacy: LegacyScheduledTask): {
    schedule: import("@/lib/db/schema").CronSchedule;
    payload: import("@/lib/db/schema").CronPayload;
} {
    return {
        schedule: {
            kind: "cron",
            expr: legacy.cron,
            tz: legacy.timezone,
        },
        payload: {
            kind: "agentTurn",
            message: legacy.prompt,
            deliver: true,
        },
    };
}
