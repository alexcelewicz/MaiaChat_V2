/**
 * Autonomous Task System Types
 *
 * Defines event types and interfaces for the Claude Code/Gemini CLI-like
 * autonomous operation mode where the agent works continuously on a task
 * until completion.
 */

// Event types emitted during autonomous task execution
export type AutonomousEventType =
    | 'init'           // Task initialized, starting execution
    | 'step_start'     // Starting a new step in the loop
    | 'tool_call'      // Tool/function call initiated
    | 'tool_result'    // Tool/function call completed with result
    | 'file_created'   // File was created/written
    | 'file_read'      // File was read
    | 'command_executed' // Shell command was executed
    | 'text_delta'     // Streaming text chunk from LLM
    | 'text_complete'  // Full text response complete for current step
    | 'steer_received' // User sent a steering message mid-task
    | 'progress'       // Progress update (summary, step count, etc.)
    | 'complete'       // Task completed successfully
    | 'error'          // Task failed with error
    | 'aborted'        // Task was aborted by user
    | 'timeout';       // Task timed out

// File info for file operations
export interface FileInfo {
    path: string;
    name: string;
    size?: number;
    content?: string; // For small files, include content for preview
    language?: string; // For syntax highlighting
    isNew?: boolean; // true if created, false if modified
}

// Activity log entry for tracking what happened
export interface ActivityLogEntry {
    id: string;
    timestamp: string;
    type: 'tool_call' | 'tool_result' | 'file_created' | 'file_read' | 'command' | 'thinking' | 'error';
    toolName?: string;
    summary: string;
    details?: string;
    status: 'pending' | 'running' | 'success' | 'error';
    file?: FileInfo;
}

// Event payload structure streamed to client
export interface AutonomousStreamEvent {
    type: AutonomousEventType;
    taskKey: string;
    step?: number;
    timestamp: string;
    data?: {
        // Tool call events
        toolName?: string;
        toolCallId?: string;
        args?: unknown;
        result?: unknown;

        // Text events
        content?: string;
        delta?: string;

        // File events
        file?: FileInfo;
        files?: FileInfo[]; // Multiple files in completion

        // Command events
        command?: string;
        exitCode?: number;
        stdout?: string;
        stderr?: string;

        // Completion events
        finalOutput?: string;
        totalSteps?: number;
        totalToolCalls?: number;
        totalTokens?: number;
        filesCreated?: FileInfo[];
        filesModified?: FileInfo[];
        commandsExecuted?: number;

        // Error events
        error?: string;

        // Progress events
        summary?: string;
        activityLog?: ActivityLogEntry[];

        // Steer events
        steerMessage?: string;

        // Init events
        maxSteps?: number;
        modelId?: string;
        conversationId?: string;
    };
}

// Options for starting an autonomous task
export interface AutonomousTaskOptions {
    userId: string;
    conversationId?: string;
    prompt: string;
    modelId: string;
    maxSteps?: number;
    timeoutMs?: number;
    config?: {
        toolsEnabled?: boolean;
        enabledTools?: string[];
        ragEnabled?: boolean;
        memoryEnabled?: boolean;
        agentId?: string;
        agentSystemPrompt?: string;
        temperature?: number;
    };
    apiKeys: Record<string, string>;
    onEvent: (event: AutonomousStreamEvent) => void;
    // Channel mode options
    taskKey?: string;  // Allow pre-generated key for channel mode
    channelAccountId?: string;  // For DB tracking
    channelId?: string;  // For DB tracking
    channelThreadId?: string;  // Thread ID if applicable
}

// In-memory run state for active tasks
export interface ActiveRunState {
    abortController: AbortController;
    queuedMessages: string[];
    isRunning: boolean;
    lastActivityAt: Date;
}

// Stopping reasons that indicate task completion
export const COMPLETION_PHRASES = [
    'task complete',
    'task completed',
    'i have completed',
    'i\'ve completed',
    'finished the task',
    'task is done',
    'task is finished',
    'all done',
    'successfully completed',
    'the task has been completed',
];

// Check if LLM response indicates task completion
export function detectCompletion(text: string, hasToolCalls: boolean, finishReason: string): boolean {
    // If there are tool calls, the task is not complete
    if (hasToolCalls) {
        return false;
    }

    // If finish reason is not 'stop' (e.g., 'length', 'tool_calls'), not complete
    if (finishReason !== 'stop' && finishReason !== 'end_turn') {
        return false;
    }

    // Check for completion phrases in the text
    const lowerText = text.toLowerCase();
    for (const phrase of COMPLETION_PHRASES) {
        if (lowerText.includes(phrase)) {
            return true;
        }
    }

    // If we got substantial text without tool calls and finish reason is 'stop',
    // consider it a final response (likely answering the user's question)
    if (text.length > 100 && finishReason === 'stop') {
        return true;
    }

    return false;
}
