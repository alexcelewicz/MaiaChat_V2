/**
 * Session Manager for Autonomous Tasks
 *
 * Phase 5: Agent Continuation
 * - Tasks survive restarts (session persistence)
 * - Cross-task messaging between agents
 * - Sub-task spawning with session keys
 *
 * @see UNIFIED_ROADMAP.md Phase 5
 */

import { db } from "@/lib/db";
import { autonomousTasks, taskMessages, type SessionState, type TaskMessageType } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { ACTIVE_RUNS, runAutonomousLoop } from "./loop";
import type { AutonomousTaskOptions } from "./types";

// ============================================================================
// Configuration
// ============================================================================

const MAX_SPAWN_DEPTH = 3;  // Maximum nesting level for sub-tasks
const SESSION_RECOVERY_GRACE_MS = 5 * 60 * 1000;  // 5 minutes - tasks can be recovered within this window

// ============================================================================
// Session State Persistence
// ============================================================================

/**
 * Save session state to database for crash recovery
 */
export async function saveSessionState(taskKey: string, state: Partial<SessionState>): Promise<void> {
    const task = await db.query.autonomousTasks.findFirst({
        where: eq(autonomousTasks.taskKey, taskKey),
    });

    if (!task) {
        console.warn(`[SessionManager] Cannot save state for unknown task: ${taskKey}`);
        return;
    }

    const currentState = (task.sessionState ?? {}) as SessionState;
    const newState: SessionState = {
        ...currentState,
        ...state,
    };

    await db
        .update(autonomousTasks)
        .set({
            sessionState: newState,
            lastActivityAt: new Date(),
        })
        .where(eq(autonomousTasks.taskKey, taskKey));
}

/**
 * Load session state from database
 */
export async function loadSessionState(taskKey: string): Promise<SessionState | null> {
    const task = await db.query.autonomousTasks.findFirst({
        where: eq(autonomousTasks.taskKey, taskKey),
    });

    if (!task) {
        return null;
    }

    return (task.sessionState ?? {}) as SessionState;
}

/**
 * Check for tasks that were running when the server crashed/restarted
 * and mark them for potential recovery
 */
export async function findRecoverableTasks(): Promise<Array<{
    id: string;
    taskKey: string;
    userId: string;
    initialPrompt: string;
    modelId: string;
    currentStep: number;
    lastActivityAt: Date | null;
    sessionState: SessionState;
}>> {
    const cutoffTime = new Date(Date.now() - SESSION_RECOVERY_GRACE_MS);

    // Find tasks that were "running" but are not in memory (server restarted)
    const runningTasks = await db.query.autonomousTasks.findMany({
        where: eq(autonomousTasks.status, "running"),
    });

    // Filter to tasks that:
    // 1. Are not currently in ACTIVE_RUNS (lost due to restart)
    // 2. Were active within the recovery window
    const recoverableTasks = runningTasks.filter((task) => {
        const isNotInMemory = !ACTIVE_RUNS.has(task.taskKey);
        const isWithinWindow = task.lastActivityAt && task.lastActivityAt > cutoffTime;
        return isNotInMemory && isWithinWindow;
    });

    return recoverableTasks.map((task) => ({
        id: task.id,
        taskKey: task.taskKey,
        userId: task.userId,
        initialPrompt: task.initialPrompt,
        modelId: task.modelId,
        currentStep: task.currentStep ?? 0,
        lastActivityAt: task.lastActivityAt,
        sessionState: (task.sessionState ?? {}) as SessionState,
    }));
}

/**
 * Mark a task as "paused" for manual recovery
 * Called when we detect a crashed task that's too old to auto-resume
 */
export async function markTaskForRecovery(taskKey: string, reason: string): Promise<void> {
    await db
        .update(autonomousTasks)
        .set({
            status: "paused",
            progressSummary: `Paused for recovery: ${reason}`,
            sessionState: {
                isRunning: false,
                recoveredAt: new Date().toISOString(),
            },
        })
        .where(eq(autonomousTasks.taskKey, taskKey));
}

/**
 * Resume a paused/crashed task
 * This re-initializes the task loop with the saved state
 */
export async function resumeTask(
    taskKey: string,
    options: {
        apiKeys: Record<string, string>;
        onEvent: AutonomousTaskOptions["onEvent"];
    }
): Promise<{ success: boolean; error?: string }> {
    const task = await db.query.autonomousTasks.findFirst({
        where: eq(autonomousTasks.taskKey, taskKey),
    });

    if (!task) {
        return { success: false, error: "Task not found" };
    }

    if (ACTIVE_RUNS.has(taskKey)) {
        return { success: false, error: "Task is already running" };
    }

    if (!["running", "paused"].includes(task.status)) {
        return { success: false, error: `Cannot resume task with status: ${task.status}` };
    }

    // Update session state to indicate recovery
    const sessionState = (task.sessionState ?? {}) as SessionState;
    const resumeCount = (sessionState.resumeCount ?? 0) + 1;

    await db
        .update(autonomousTasks)
        .set({
            status: "running",
            sessionState: {
                ...sessionState,
                isRunning: true,
                recoveredAt: new Date().toISOString(),
                resumeCount,
            },
        })
        .where(eq(autonomousTasks.taskKey, taskKey));

    // Build a continuation prompt
    const continuationPrompt = task.currentStep && task.currentStep > 0
        ? `[RESUMING FROM STEP ${task.currentStep}] Continue the task. Previous context: "${task.progressSummary || task.initialPrompt}". Pick up where you left off.`
        : task.initialPrompt;

    // Restart the loop
    try {
        await runAutonomousLoop({
            userId: task.userId,
            conversationId: task.conversationId ?? undefined,
            prompt: continuationPrompt,
            modelId: task.modelId,
            maxSteps: (task.maxSteps ?? 50) - (task.currentStep ?? 0),  // Remaining steps
            timeoutMs: task.timeoutMs ?? 300000,
            config: task.config ?? {},
            apiKeys: options.apiKeys,
            onEvent: options.onEvent,
            taskKey: task.taskKey,  // Reuse existing task key
            channelAccountId: task.channelAccountId ?? undefined,
            channelId: task.channelId ?? undefined,
            channelThreadId: task.channelThreadId ?? undefined,
        });

        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await markTaskForRecovery(taskKey, `Resume failed: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}

// ============================================================================
// Cross-Task Messaging
// ============================================================================

export interface TaskMessage {
    id: string;
    fromTaskKey: string;
    toTaskKey: string;
    messageType: TaskMessageType;
    payload: unknown;
    status: "pending" | "read" | "processed";
    createdAt: Date;
}

/**
 * Send a message from one task to another
 */
export async function sendTaskMessage(
    fromTaskKey: string,
    toTaskKey: string,
    messageType: TaskMessageType,
    payload: unknown
): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Verify both tasks exist
    const [fromTask, toTask] = await Promise.all([
        db.query.autonomousTasks.findFirst({
            where: eq(autonomousTasks.taskKey, fromTaskKey),
        }),
        db.query.autonomousTasks.findFirst({
            where: eq(autonomousTasks.taskKey, toTaskKey),
        }),
    ]);

    if (!fromTask) {
        return { success: false, error: `Source task not found: ${fromTaskKey}` };
    }

    if (!toTask) {
        return { success: false, error: `Destination task not found: ${toTaskKey}` };
    }

    // Insert message
    const [message] = await db
        .insert(taskMessages)
        .values({
            fromTaskKey,
            toTaskKey,
            messageType,
            payload,
            status: "pending",
        })
        .returning();

    if (!message) {
        return { success: false, error: "Failed to create message" };
    }

    console.log(`[SessionManager] Message sent: ${fromTaskKey} -> ${toTaskKey} (${messageType})`);

    return { success: true, messageId: message.id };
}

/**
 * Get pending messages for a task
 */
export async function getTaskMessages(
    taskKey: string,
    options: { unreadOnly?: boolean; limit?: number } = {}
): Promise<TaskMessage[]> {
    const { unreadOnly = true, limit = 20 } = options;

    const conditions = [eq(taskMessages.toTaskKey, taskKey)];
    if (unreadOnly) {
        conditions.push(eq(taskMessages.status, "pending"));
    }

    const messages = await db.query.taskMessages.findMany({
        where: and(...conditions),
        orderBy: (msg, { asc }) => [asc(msg.createdAt)],
        limit,
    });

    return messages.map((msg) => ({
        id: msg.id,
        fromTaskKey: msg.fromTaskKey,
        toTaskKey: msg.toTaskKey,
        messageType: msg.messageType as TaskMessageType,
        payload: msg.payload,
        status: msg.status as "pending" | "read" | "processed",
        createdAt: msg.createdAt,
    }));
}

/**
 * Mark messages as read
 */
export async function markMessagesRead(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;

    await db
        .update(taskMessages)
        .set({
            status: "read",
            readAt: new Date(),
        })
        .where(inArray(taskMessages.id, messageIds));
}

/**
 * Mark messages as processed (final state)
 */
export async function markMessagesProcessed(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;

    await db
        .update(taskMessages)
        .set({ status: "processed" })
        .where(inArray(taskMessages.id, messageIds));
}

// ============================================================================
// Sub-Task Spawning
// ============================================================================

export interface SpawnOptions {
    prompt: string;
    modelId?: string;  // Inherit from parent if not specified
    maxSteps?: number;
    config?: AutonomousTaskOptions["config"];
    apiKeys: Record<string, string>;
    onEvent: AutonomousTaskOptions["onEvent"];
    waitForCompletion?: boolean;  // If true, wait for sub-task to complete
}

/**
 * Spawn a sub-task from a parent task
 */
export async function spawnSubTask(
    parentTaskKey: string,
    options: SpawnOptions
): Promise<{
    success: boolean;
    subTaskKey?: string;
    error?: string;
}> {
    // Get parent task
    const parentTask = await db.query.autonomousTasks.findFirst({
        where: eq(autonomousTasks.taskKey, parentTaskKey),
    });

    if (!parentTask) {
        return { success: false, error: "Parent task not found" };
    }

    // Check spawn depth limit
    const currentDepth = parentTask.spawnDepth ?? 0;
    if (currentDepth >= MAX_SPAWN_DEPTH) {
        return {
            success: false,
            error: `Maximum spawn depth (${MAX_SPAWN_DEPTH}) exceeded. Cannot spawn more sub-tasks.`,
        };
    }

    // Generate sub-task key
    const subTaskKey = `${parentTaskKey}:sub:${uuidv4().slice(0, 8)}`;

    console.log(`[SessionManager] Spawning sub-task: ${subTaskKey} (depth: ${currentDepth + 1})`);

    // Create the sub-task in database first
    const [subTask] = await db
        .insert(autonomousTasks)
        .values({
            userId: parentTask.userId,
            conversationId: parentTask.conversationId,
            taskKey: subTaskKey,
            initialPrompt: options.prompt,
            modelId: options.modelId ?? parentTask.modelId,
            maxSteps: options.maxSteps ?? 20,  // Sub-tasks have smaller default
            config: options.config ?? parentTask.config ?? {},
            parentTaskId: parentTask.id,
            spawnDepth: currentDepth + 1,
            status: "pending",
            channelAccountId: parentTask.channelAccountId,
            channelId: parentTask.channelId,
            channelThreadId: parentTask.channelThreadId,
        })
        .returning();

    if (!subTask) {
        return { success: false, error: "Failed to create sub-task record" };
    }

    // Run the sub-task
    const subTaskPromise = runAutonomousLoop({
        userId: parentTask.userId,
        conversationId: parentTask.conversationId ?? undefined,
        prompt: `[SUB-TASK from ${parentTaskKey}] ${options.prompt}`,
        modelId: options.modelId ?? parentTask.modelId,
        maxSteps: options.maxSteps ?? 20,
        config: options.config ?? parentTask.config ?? {},
        apiKeys: options.apiKeys,
        onEvent: options.onEvent,
        taskKey: subTaskKey,
    });

    // If waiting for completion, await the result
    if (options.waitForCompletion) {
        await subTaskPromise;

        // Check if sub-task completed successfully
        const completedSubTask = await db.query.autonomousTasks.findFirst({
            where: eq(autonomousTasks.taskKey, subTaskKey),
        });

        if (completedSubTask?.status === "failed") {
            return {
                success: false,
                subTaskKey,
                error: completedSubTask.errorMessage ?? "Sub-task failed",
            };
        }
    }

    return { success: true, subTaskKey };
}

/**
 * Get all child tasks for a parent task
 */
export async function getChildTasks(parentTaskKey: string): Promise<Array<{
    taskKey: string;
    status: string;
    currentStep: number;
    progressSummary: string | null;
    finalOutput: string | null;
}>> {
    const parentTask = await db.query.autonomousTasks.findFirst({
        where: eq(autonomousTasks.taskKey, parentTaskKey),
    });

    if (!parentTask) {
        return [];
    }

    const children = await db.query.autonomousTasks.findMany({
        where: eq(autonomousTasks.parentTaskId, parentTask.id),
    });

    return children.map((child) => ({
        taskKey: child.taskKey,
        status: child.status,
        currentStep: child.currentStep ?? 0,
        progressSummary: child.progressSummary,
        finalOutput: child.finalOutput,
    }));
}

/**
 * Wait for all child tasks to complete
 */
export async function waitForChildTasks(
    parentTaskKey: string,
    options: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<{
    allCompleted: boolean;
    results: Array<{ taskKey: string; status: string; output: string | null }>;
}> {
    const { timeoutMs = 60000, pollIntervalMs = 1000 } = options;
    const startTime = Date.now();

    const parentTask = await db.query.autonomousTasks.findFirst({
        where: eq(autonomousTasks.taskKey, parentTaskKey),
    });

    if (!parentTask) {
        return { allCompleted: false, results: [] };
    }

    while (Date.now() - startTime < timeoutMs) {
        const children = await db.query.autonomousTasks.findMany({
            where: eq(autonomousTasks.parentTaskId, parentTask.id),
        });

        const allDone = children.every((child) =>
            ["completed", "failed", "aborted"].includes(child.status)
        );

        if (allDone) {
            return {
                allCompleted: true,
                results: children.map((child) => ({
                    taskKey: child.taskKey,
                    status: child.status,
                    output: child.finalOutput,
                })),
            };
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout - return current state
    const finalChildren = await db.query.autonomousTasks.findMany({
        where: eq(autonomousTasks.parentTaskId, parentTask.id),
    });

    return {
        allCompleted: false,
        results: finalChildren.map((child) => ({
            taskKey: child.taskKey,
            status: child.status,
            output: child.finalOutput,
        })),
    };
}

// ============================================================================
// Session Recovery on Startup
// ============================================================================

/**
 * Initialize session manager on server startup
 * Checks for crashed tasks and optionally resumes them
 */
export async function initializeSessionManager(): Promise<{
    recoverableTasks: number;
    pausedTasks: number;
}> {
    console.log("[SessionManager] Initializing...");

    const recoverableTasks = await findRecoverableTasks();

    if (recoverableTasks.length === 0) {
        console.log("[SessionManager] No recoverable tasks found");
        return { recoverableTasks: 0, pausedTasks: 0 };
    }

    console.log(`[SessionManager] Found ${recoverableTasks.length} tasks that need recovery`);

    let pausedCount = 0;

    for (const task of recoverableTasks) {
        // For now, we mark tasks as paused for manual recovery
        // In the future, we could auto-resume with proper API key handling
        await markTaskForRecovery(
            task.taskKey,
            `Server restarted while task was running at step ${task.currentStep}`
        );
        pausedCount++;
        console.log(`[SessionManager] Marked task ${task.taskKey} for recovery`);
    }

    return {
        recoverableTasks: recoverableTasks.length,
        pausedTasks: pausedCount,
    };
}

// ============================================================================
// Exports for Tools
// ============================================================================

/**
 * Create a tool for agents to spawn sub-tasks
 * This can be registered as a tool in the autonomous loop
 */
export const spawnSubTaskTool = {
    name: "spawn_subtask",
    description: "Spawn a sub-task to work on a specific part of the problem in parallel. The sub-task will run independently.",
    parameters: {
        prompt: {
            type: "string",
            description: "The task for the sub-agent to complete",
        },
        waitForCompletion: {
            type: "boolean",
            description: "If true, wait for the sub-task to complete before continuing",
            default: false,
        },
    },
};

/**
 * Create a tool for agents to send messages to other tasks
 */
export const sendMessageTool = {
    name: "send_task_message",
    description: "Send a message to another running task. Use this for coordination between parallel agents.",
    parameters: {
        toTaskKey: {
            type: "string",
            description: "The task key of the recipient task",
        },
        message: {
            type: "string",
            description: "The message to send",
        },
        messageType: {
            type: "string",
            enum: ["message", "result", "request", "status"],
            description: "The type of message",
            default: "message",
        },
    },
};

/**
 * Create a tool for agents to check their messages
 */
export const checkMessagesTool = {
    name: "check_task_messages",
    description: "Check for messages from other tasks",
    parameters: {
        unreadOnly: {
            type: "boolean",
            description: "Only return unread messages",
            default: true,
        },
    },
};
