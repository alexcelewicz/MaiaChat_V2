/**
 * Task Executor with Completion Detection and Retry Logic
 *
 * Wraps AI calls to ensure tasks are actually completed, not just promised.
 * Features:
 * - Detects "I will do X" without actual tool execution
 * - Retries up to N times with continuation prompts
 * - Notifies user on failure (both original channel and Telegram)
 * - Configurable completion detection
 * - Integrates with unified config system
 */

import { streamText, stepCountIs, type LanguageModel, type ModelMessage } from "ai";
import { getTaskExecutionConfig, getNotificationsConfig } from "@/lib/config";

// ============================================================================
// Types
// ============================================================================

export interface TaskExecutorConfig {
    /** Maximum retry attempts (default: 3) */
    maxAttempts: number;
    /** Timeout per attempt in ms (default: 60000) */
    completionTimeout: number;
    /** Require at least one tool call for completion (default: false for chat, true for scheduled) */
    requireToolCall: boolean;
    /** Notify on original channel where task was initiated (default: true) */
    notifyOriginalChannel: boolean;
    /** Also notify on Telegram even if task was from another channel (default: true) */
    notifyTelegram: boolean;
    /** Telegram chat ID for failure notifications */
    telegramChatId?: string;
    /** Callback when attempt starts */
    onAttemptStart?: (attempt: number) => void;
    /** Callback when attempt ends */
    onAttemptEnd?: (attempt: number, result: AttemptResult) => void;
    /** Callback for step completion (tool results) */
    onStepFinish?: (step: StepInfo) => void;
}

export interface AttemptResult {
    complete: boolean;
    output: string;
    toolsCalled: string[];
    toolResults: ToolResultInfo[];
    error?: string;
}

export interface StepInfo {
    stepNumber: number;
    finishReason?: string;
    text?: string;
    toolCalls?: Array<{ toolName: string; input: unknown }>;
    toolResults?: Array<{ toolName: string; output: unknown }>;
}

export interface ToolResultInfo {
    toolName: string;
    output: unknown;
    success: boolean;
    hasContent: boolean;
    error?: string;
}

export interface AICallConfig {
    model: LanguageModel;
    messages: ModelMessage[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools?: Record<string, any>;
    maxTokens?: number;
    temperature?: number;
    maxToolSteps?: number;
}

export interface TaskResult {
    success: boolean;
    output: string;
    toolsCalled: string[];
    attempts: number;
    failureReason?: string;
    tokensUsed?: {
        input: number;
        output: number;
    };
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_TASK_CONFIG: TaskExecutorConfig = {
    maxAttempts: 3,
    completionTimeout: 60000,
    requireToolCall: false,
    notifyOriginalChannel: true,
    notifyTelegram: true,
};

/**
 * Load task executor config from unified config system
 */
export async function loadTaskExecutorConfig(): Promise<TaskExecutorConfig> {
    try {
        const [taskConfig, notifyConfig] = await Promise.all([
            getTaskExecutionConfig(),
            getNotificationsConfig(),
        ]);

        return {
            maxAttempts: taskConfig.maxAttempts,
            completionTimeout: taskConfig.completionTimeout,
            requireToolCall: taskConfig.requireToolCallForScheduled,
            notifyOriginalChannel: notifyConfig.failureNotifyOriginalChannel,
            notifyTelegram: notifyConfig.failureNotifyTelegram,
            telegramChatId: notifyConfig.telegramUserId || undefined,
        };
    } catch (error) {
        console.warn("[TaskExecutor] Error loading config, using defaults:", error);
        return DEFAULT_TASK_CONFIG;
    }
}

// ============================================================================
// Completion Detection
// ============================================================================

/**
 * Patterns that indicate the AI promised to do something but didn't
 */
const INCOMPLETE_PATTERNS = [
    /I('ll| will) (check|look|search|find|get|fetch|retrieve|look up)/i,
    /Let me (check|look|search|find|get|fetch|retrieve|look up)/i,
    /I('m| am) going to (check|look|search|find|get|fetch)/i,
    /I can (check|look|search|find|get|fetch) (that|this|the|it)/i,
    /I('ll| will) (do that|handle that|take care of that)/i,
    /Let me (do that|handle that|work on that)/i,
];

/**
 * Patterns that indicate task completion without needing tools
 */
const COMPLETE_PATTERNS = [
    /here (is|are) (the|your|what|some)/i,
    /found (the following|this|these|that)/i,
    /the (weather|temperature|forecast) (is|shows|indicates|will be)/i,
    /results show/i,
    /based on (the|my) (search|research|findings)/i,
    /according to/i,
    /I('ve| have) (found|retrieved|located|checked)/i,
    /the current (time|date|weather)/i,
];

/**
 * Check if the response indicates task completion
 */
export function isTaskComplete(
    response: string,
    toolsCalled: string[],
    requireToolCall: boolean,
    toolResults: ToolResultInfo[] = [],
    requiredToolIds: string[] = []
): { complete: boolean; reason: string } {
    const hasSuccessfulToolResult = toolResults.some((result) => result.success && result.hasContent);
    const hasToolErrors = toolResults.some((result) => !result.success);

    const matchedIncomplete = INCOMPLETE_PATTERNS.find((p) => p.test(response));
    const responseLength = response.replace(/\s+/g, " ").trim().length;

    if (requiredToolIds.length > 0) {
        const hasRequiredTool = toolsCalled.some((toolName) => requiredToolIds.includes(toolName));
        if (!hasRequiredTool) {
            return {
                complete: false,
                reason: `Required tools not used: ${requiredToolIds.join(", ")}`,
            };
        }

        const matchedComplete = COMPLETE_PATTERNS.find((p) => p.test(response));
        if (!matchedComplete && responseLength < 100) {
            return {
                complete: false,
                reason: "Response too short for a data-heavy task",
            };
        }
    }

    // If tools were called but nothing succeeded, treat as incomplete
    if (toolsCalled.length > 0 && !hasSuccessfulToolResult) {
        return {
            complete: false,
            reason: hasToolErrors
                ? "Tools returned errors or empty results"
                : "Tools executed but no usable results found",
        };
    }

    // If we require tool calls but none were made, check for incomplete patterns
    if (requireToolCall) {
        if (toolsCalled.length > 0 && hasSuccessfulToolResult) {
            // Tools were called and produced results — task is complete
            return {
                complete: true,
                reason: `Tools called successfully: ${toolsCalled.join(", ")}`,
            };
        }

        if (matchedIncomplete && toolsCalled.length === 0) {
            return {
                complete: false,
                reason: `Response indicates intent without action: matched pattern "${matchedIncomplete.source}"`,
            };
        }

        // No tools called — check if response text indicates completion
        if (toolsCalled.length === 0) {
            const matchedComplete = COMPLETE_PATTERNS.find((p) => p.test(response));
            if (!matchedComplete) {
                return {
                    complete: false,
                    reason: "No tools called and no completion indicators found",
                };
            }
        }
    }

    if (matchedIncomplete && responseLength < 200 && toolsCalled.length === 0) {
        return {
            complete: false,
            reason: `Short response with promise but no action: "${matchedIncomplete.source}"`,
        };
    }

    // Check for explicit completion patterns
    const matchedComplete = COMPLETE_PATTERNS.find((p) => p.test(response));
    if (matchedComplete) {
        return { complete: true, reason: `Completion pattern matched: "${matchedComplete.source}"` };
    }

    // Default: consider complete if we have a reasonable response
    if (response.trim().length > 50) {
        return { complete: true, reason: "Substantial response provided" };
    }

    return { complete: false, reason: "Response too short or unclear" };
}

// ============================================================================
// Non-Retryable Error Detection
// ============================================================================

const NON_RETRYABLE_PATTERNS = [
    /api.?key/i,
    /authenticat/i,
    /\bcredits?\b/i,
    /\bquota\b/i,
    /\bpayment\b/i,
    /\b402\b/,
    /\b401\b/,
    /\b403\b/,
    /insufficient.?funds/i,
    /max_tokens/i,
    /can only afford/i,
    // Environment errors — will never self-resolve through retries
    /command not found/i,
    /not found in PATH/i,
    /No such file or directory/i,
    /exit code 127/i,
    /ENOENT/i,
    // Permission/config errors — tool or feature is disabled
    /execution is.*(disabled|not enabled)/i,
    /currently disabled/i,
    /permission denied/i,
];

/**
 * Check if an error is non-retryable (auth, payment, quota issues).
 * Accepts Error objects or string messages.
 */
function isNonRetryableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || "");
    // Also check statusCode on API error objects
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (statusCode && [401, 402, 403].includes(statusCode)) return true;
    return NON_RETRYABLE_PATTERNS.some((p) => p.test(message));
}

/** Patterns indicating environment/infrastructure errors in tool output */
const ENVIRONMENT_ERROR_PATTERNS = [
    /command not found/i,
    /not found in PATH/i,
    /No such file or directory/i,
    /exit code 127/i,
    /ENOENT/i,
    /execution is.*(disabled|not enabled)/i,
    /currently disabled/i,
    /permission denied/i,
];

/**
 * Check tool results for environment errors that will never self-resolve.
 * Returns the error message if found, null otherwise.
 */
function findEnvironmentError(toolResults: ToolResultInfo[]): string | null {
    for (const result of toolResults) {
        if (!result.success && result.error) {
            for (const pattern of ENVIRONMENT_ERROR_PATTERNS) {
                if (pattern.test(result.error)) {
                    return result.error;
                }
            }
        }
        // Also check tool output (some tools return errors in output, not error field)
        const output = typeof result.output === "string"
            ? result.output
            : JSON.stringify(result.output || "");
        for (const pattern of ENVIRONMENT_ERROR_PATTERNS) {
            if (pattern.test(output)) {
                return `${result.toolName}: ${output.slice(0, 200)}`;
            }
        }
    }
    return null;
}

// ============================================================================
// Main Task Executor
// ============================================================================

/**
 * Execute a task with retry logic and completion detection
 */
export async function executeTaskWithRetry(
    userMessage: string,
    config: Partial<TaskExecutorConfig>,
    aiConfig: AICallConfig
): Promise<TaskResult> {
    const fullConfig: TaskExecutorConfig = { ...DEFAULT_TASK_CONFIG, ...config };
    const {
        maxAttempts,
        completionTimeout,
        requireToolCall,
        onAttemptStart,
        onAttemptEnd,
        onStepFinish,
    } = fullConfig;

    const requiresWeb = /\b(weather|forecast|temperature|rain|wind|precip|snow|news|headline|latest|breaking|price|stock)\b/i.test(userMessage);
    const requiredToolIds = requiresWeb ? ["web_search", "url_fetch"] : [];

    let attempt = 0;
    let allToolsCalled: string[] = [];
    let lastOutput = "";
    let lastError: string | undefined;
    let totalTokens = { input: 0, output: 0 };

    // Build working messages array (will be modified with continuation prompts)
    const workingMessages = [...aiConfig.messages];

    while (attempt < maxAttempts) {
        attempt++;
        onAttemptStart?.(attempt);

        console.log(`[TaskExecutor] Attempt ${attempt}/${maxAttempts} for task`);

        try {
            const attemptResult = await executeAttempt(
                workingMessages,
                aiConfig,
                completionTimeout,
                onStepFinish
            );

            lastOutput = attemptResult.output;
            allToolsCalled = [...allToolsCalled, ...attemptResult.toolsCalled];
            totalTokens.input += attemptResult.tokensUsed?.input || 0;
            totalTokens.output += attemptResult.tokensUsed?.output || 0;

            // Check completion
            const completionCheck = isTaskComplete(
                lastOutput,
                attemptResult.toolsCalled,
                requireToolCall,
                attemptResult.toolResults,
                requiredToolIds
            );
            console.log(`[TaskExecutor] Completion check: ${completionCheck.complete} - ${completionCheck.reason}`);

            const attemptResultForCallback: AttemptResult = {
                complete: completionCheck.complete,
                output: lastOutput,
                toolsCalled: attemptResult.toolsCalled,
                toolResults: attemptResult.toolResults,
            };
            onAttemptEnd?.(attempt, attemptResultForCallback);

            if (completionCheck.complete) {
                return {
                    success: true,
                    output: lastOutput,
                    toolsCalled: allToolsCalled,
                    attempts: attempt,
                    tokensUsed: totalTokens,
                };
            }

            // Check if tool results contain non-retryable environment errors
            const envError = findEnvironmentError(attemptResult.toolResults);
            if (envError) {
                console.warn(`[TaskExecutor] Non-retryable environment error in tool results: ${envError}`);
                return {
                    success: false,
                    output: lastOutput,
                    toolsCalled: allToolsCalled,
                    attempts: attempt,
                    failureReason: `Environment error (non-retryable): ${envError}`,
                    tokensUsed: totalTokens,
                };
            }

            // Not complete - add continuation prompt for next attempt
            if (attempt < maxAttempts) {
                // Add the AI's incomplete response to history
                workingMessages.push({
                    role: "assistant",
                    content: lastOutput,
                });

                // Add continuation prompt
                workingMessages.push({
                    role: "user",
                    content: buildContinuationPrompt(
                        lastOutput,
                        attemptResult.toolsCalled,
                        attemptResult.toolResults
                    ),
                });

                console.log(`[TaskExecutor] Adding continuation prompt for attempt ${attempt + 1}`);
            }
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            console.error(`[TaskExecutor] Attempt ${attempt} error:`, lastError);

            const attemptResultForCallback: AttemptResult = {
                complete: false,
                output: lastOutput,
                toolsCalled: [],
                toolResults: [],
                error: lastError,
            };
            onAttemptEnd?.(attempt, attemptResultForCallback);

            // Continue to next attempt unless it's a fatal error
            if (isNonRetryableError(lastError)) {
                console.warn(`[TaskExecutor] Non-retryable error, stopping retries: ${lastError}`);
                break;
            }
        }
    }

    // All attempts exhausted - task failed
    const failureReason = lastError || `Task incomplete after ${maxAttempts} attempts`;

    return {
        success: false,
        output: lastOutput,
        toolsCalled: allToolsCalled,
        attempts: attempt,
        failureReason,
        tokensUsed: totalTokens,
    };
}

/**
 * Execute a single attempt
 */
async function executeAttempt(
    messages: ModelMessage[],
    aiConfig: AICallConfig,
    timeout: number,
    onStepFinish?: (step: StepInfo) => void
): Promise<{
    output: string;
    toolsCalled: string[];
    toolResults: ToolResultInfo[];
    tokensUsed?: { input: number; output: number };
}> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const toolsCalled: string[] = [];
    const collectedToolResults: ToolResultInfo[] = [];
    let stepCounter = 0;

    const normalizeToolResult = (toolName: string, output: unknown): ToolResultInfo => {
        let error: string | undefined;
        if (output && typeof output === "object" && "error" in output) {
            const maybeError = (output as { error?: unknown }).error;
            if (typeof maybeError === "string" && maybeError.trim().length > 0) {
                error = maybeError;
            }
        }

        const hasContent = (() => {
            if (output === null || output === undefined) return false;
            if (typeof output === "string") return output.trim().length > 0;
            if (typeof output === "number") return true;
            if (typeof output === "boolean") return true;
            if (Array.isArray(output)) return output.length > 0;
            if (typeof output === "object") return Object.keys(output as object).length > 0;
            return false;
        })();

        return {
            toolName,
            output,
            success: !error,
            hasContent,
            error,
        };
    };

    try {
        const result = await streamText({
            model: aiConfig.model,
            messages,
            maxOutputTokens: aiConfig.maxTokens,
            temperature: aiConfig.temperature,
            tools: aiConfig.tools,
            ...(aiConfig.tools ? { stopWhen: stepCountIs(aiConfig.maxToolSteps || 5) } : {}),
            abortSignal: controller.signal,
            onStepFinish: (step) => {
                stepCounter++;

                // Track tool calls
                if (step.toolCalls?.length) {
                    for (const tc of step.toolCalls) {
                        toolsCalled.push(tc.toolName);
                    }
                }

                // Collect tool results for fallback
                if (step.toolResults?.length) {
                    for (const tr of step.toolResults) {
                        collectedToolResults.push(normalizeToolResult(tr.toolName, tr.output));
                    }
                }

                // Notify callback
                onStepFinish?.({
                    stepNumber: stepCounter,
                    finishReason: step.finishReason,
                    text: step.text,
                    toolCalls: step.toolCalls?.map((tc) => ({
                        toolName: tc.toolName,
                        input: tc.input,
                    })),
                    toolResults: step.toolResults?.map((tr) => ({
                        toolName: tr.toolName,
                        output: tr.output,
                    })),
                });

                console.log(`[TaskExecutor] Step ${stepCounter}:`, {
                    finishReason: step.finishReason,
                    toolCalls: step.toolCalls?.length || 0,
                    toolResults: step.toolResults?.length || 0,
                });
            },
        });

        // Collect full response
        let fullResponse = "";
        try {
            for await (const chunk of result.textStream) {
                fullResponse += chunk;
            }
        } catch (streamError) {
            // Re-throw non-retryable errors so the retry loop can exit early
            if (isNonRetryableError(streamError)) {
                throw streamError;
            }
            console.warn("[TaskExecutor] Stream error, using fallback if available:", streamError);
        }

        // Build fallback from tool results if no text response
        if (!fullResponse && collectedToolResults.length > 0) {
            const toolSummaries = collectedToolResults.map((tr) => {
                const output =
                    typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output, null, 2);
                const truncated =
                    output.length > 2000 ? output.substring(0, 2000) + "\n...(truncated)" : output;
                return `**${tr.toolName}**:\n${truncated}`;
            });
            fullResponse = `Here are the results:\n\n${toolSummaries.join("\n\n")}`;
        }

        // Get token usage
        let tokensUsed = { input: 0, output: 0 };
        try {
            const usage = await result.usage;
            tokensUsed = {
                input: (usage as { promptTokens?: number })?.promptTokens || 0,
                output: (usage as { completionTokens?: number })?.completionTokens || 0,
            };
        } catch {
            // Usage unavailable
        }

        return {
            output: fullResponse,
            toolsCalled,
            toolResults: collectedToolResults,
            tokensUsed,
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Build a continuation prompt to encourage task completion
 */
function buildContinuationPrompt(
    previousResponse: string,
    toolsCalled: string[],
    toolResults: ToolResultInfo[]
): string {
    if (toolsCalled.length === 0) {
        return `You indicated you would perform an action but didn't actually do it. Please use your available tools NOW to complete the task. Don't describe what you will do - actually DO IT by calling the appropriate tool.`;
    }

    const failedTools = toolResults.filter((result) => !result.success);
    if (failedTools.length > 0) {
        // Check if failures are environment errors (missing commands/binaries)
        const hasEnvError = failedTools.some((result) => {
            const text = (result.error || "") + " " + (typeof result.output === "string" ? result.output : "");
            return ENVIRONMENT_ERROR_PATTERNS.some((p) => p.test(text));
        });

        if (hasEnvError) {
            return `The required tools or commands are not installed in this environment. This is an infrastructure limitation that cannot be resolved by retrying. Report this failure clearly to the user, including which command/tool was missing.`;
        }

        return `Some tool calls failed (${failedTools.map((r) => r.toolName).join(", ")}). Please retry with the appropriate tools and provide a complete response with actual data. If a tool fails, use an alternative source or retry with a different query.`;
    }

    // Tools were called but maybe didn't provide complete results
    return `The task doesn't appear to be fully complete. Please verify the results and provide a complete response with the actual data/information requested. If you need to make additional tool calls, do so now.`;
}

// ============================================================================
// Notification Helpers
// ============================================================================

/**
 * Send failure notification to Telegram
 */
export async function sendTelegramNotification(
    botToken: string,
    chatId: string,
    message: string
): Promise<boolean> {
    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: "HTML",
            }),
        });

        if (!response.ok) {
            // Retry without HTML
            const retryResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                }),
            });
            return retryResponse.ok;
        }

        return true;
    } catch (error) {
        console.error("[TaskExecutor] Telegram notification failed:", error);
        return false;
    }
}

/**
 * Build failure notification message
 */
export function buildFailureMessage(
    taskName: string,
    attempts: number,
    reason: string,
    lastOutput?: string
): string {
    let message = `⚠️ <b>Task Failed</b>\n\n`;
    message += `<b>Task:</b> ${escapeHtml(taskName)}\n`;
    message += `<b>Attempts:</b> ${attempts}\n`;
    message += `<b>Reason:</b> ${escapeHtml(reason)}\n`;

    if (lastOutput && lastOutput.length > 0) {
        const truncated = lastOutput.length > 500 ? lastOutput.substring(0, 500) + "..." : lastOutput;
        message += `\n<b>Last Response:</b>\n<pre>${escapeHtml(truncated)}</pre>`;
    }

    return message;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
