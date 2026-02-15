/**
 * Autonomous Task Loop
 *
 * Implements Claude Code/Gemini CLI-like continuous operation where the agent
 * works on a task until completion without requiring user prompts between steps.
 */

import { generateText, tool } from "ai";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { autonomousTasks, conversations, messages as messagesTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getModelWithKey, getModelConfig } from "@/lib/ai/providers/factory";
import { getAllTools, getTool, executeTool, type ToolId, type ToolContext } from "@/lib/tools";
import { getLocalAccessContext } from "@/lib/admin/settings";
import { pluginRegistry, initializePlugins, pluginExecutor } from "@/lib/plugins";
import { buildPluginInputSchema } from "@/lib/plugins/utils";
import type {
    AutonomousTaskOptions,
    AutonomousStreamEvent,
    ActiveRunState,
    FileInfo,
    ActivityLogEntry,
} from "./types";
import { detectCompletion } from "./types";
import {
    saveSessionState,
    spawnSubTask,
    sendTaskMessage,
    getTaskMessages,
    markMessagesRead,
} from "./session-manager";
import * as path from "path";

// Track which channel account has an active task (for channel mode)
export const CHANNEL_ACTIVE_TASKS = new Map<string, string>(); // channelAccountId -> taskKey

// ============================================================================
// In-Memory Active Runs Tracking (like Claude Code's ACTIVE_EMBEDDED_RUNS)
// ============================================================================

// Export ACTIVE_RUNS so session-manager can check for running tasks
export const ACTIVE_RUNS = new Map<string, ActiveRunState>();

/**
 * Get all active task keys (for debugging/monitoring)
 */
export function getActiveTaskKeys(): string[] {
    return Array.from(ACTIVE_RUNS.keys());
}

/**
 * Check if a task is currently running
 */
export function isTaskRunning(taskKey: string): boolean {
    const run = ACTIVE_RUNS.get(taskKey);
    return run?.isRunning ?? false;
}

/**
 * Queue a steering message into an active task
 * Returns true if message was queued, false if task not found/not running
 */
export function steerTask(taskKey: string, message: string): boolean {
    const run = ACTIVE_RUNS.get(taskKey);
    if (!run || !run.isRunning) {
        return false;
    }
    run.queuedMessages.push(message);
    run.lastActivityAt = new Date();
    return true;
}

/**
 * Abort a running task
 * Returns true if task was aborted, false if task not found/not running
 */
export function abortTask(taskKey: string): boolean {
    const run = ACTIVE_RUNS.get(taskKey);
    if (!run || !run.isRunning) {
        return false;
    }
    run.abortController.abort();
    run.isRunning = false;
    return true;
}

// ============================================================================
// Event Emission Helper
// ============================================================================

function emitEvent(
    onEvent: (event: AutonomousStreamEvent) => void,
    type: AutonomousStreamEvent["type"],
    taskKey: string,
    step?: number,
    data?: AutonomousStreamEvent["data"]
): void {
    onEvent({
        type,
        taskKey,
        step,
        timestamp: new Date().toISOString(),
        data,
    });
}

// ============================================================================
// Main Autonomous Loop
// ============================================================================

/**
 * Run an autonomous task loop
 * The agent will continue working until:
 * - Task is complete (LLM indicates done)
 * - Max steps reached
 * - Timeout exceeded
 * - Aborted by user
 */
export async function runAutonomousLoop(options: AutonomousTaskOptions): Promise<string> {
    const {
        userId,
        conversationId: requestedConvId,
        prompt,
        modelId,
        maxSteps = 50,
        timeoutMs = 300000, // 5 minutes default
        config = {},
        apiKeys,
        onEvent,
        taskKey: providedTaskKey,
        channelAccountId,
        channelId,
        channelThreadId,
    } = options;

    // Use provided task key or generate new one
    const taskKey = providedTaskKey || uuidv4();
    let conversationId = requestedConvId;

    // Create or get conversation
    if (!conversationId) {
        const [newConv] = await db
            .insert(conversations)
            .values({
                userId,
                title: prompt.slice(0, 50) + (prompt.length > 50 ? "..." : ""),
            })
            .returning();
        conversationId = newConv?.id;
    }

    // Create task record in database
    const [task] = await db
        .insert(autonomousTasks)
        .values({
            userId,
            conversationId,
            taskKey,
            initialPrompt: prompt,
            modelId,
            maxSteps,
            timeoutMs,
            config,
            status: "pending",
            // Channel delivery fields
            channelAccountId,
            channelId,
            channelThreadId,
        })
        .returning();

    if (!task) {
        emitEvent(onEvent, "error", taskKey, 0, { error: "Failed to create task record" });
        return taskKey;
    }

    // Track channel -> task mapping if this is a channel task
    if (channelAccountId) {
        CHANNEL_ACTIVE_TASKS.set(channelAccountId, taskKey);
    }

    // Register in active runs
    const abortController = new AbortController();
    const runState: ActiveRunState = {
        abortController,
        queuedMessages: [],
        isRunning: true,
        lastActivityAt: new Date(),
    };
    ACTIVE_RUNS.set(taskKey, runState);

    // Set up timeout
    const timeoutId = setTimeout(() => {
        abortController.abort();
    }, timeoutMs);

    try {
        // Update status to running
        await db
            .update(autonomousTasks)
            .set({ status: "running", startedAt: new Date() })
            .where(eq(autonomousTasks.id, task.id));

        // Emit init event
        emitEvent(onEvent, "init", taskKey, 0, {
            maxSteps,
            modelId,
            conversationId,
        });

        // Save user message
        await db.insert(messagesTable).values({
            conversationId: conversationId!,
            role: "user",
            content: prompt,
        });

        // Get model
        const modelConfig = getModelConfig(modelId);
        if (!modelConfig) {
            throw new Error(`Model not found: ${modelId}`);
        }

        const aiModel = getModelWithKey(modelId, apiKeys);

        // Build tools
        const localAccess = await getLocalAccessContext(userId);
        const toolContext: ToolContext = {
            userId,
            apiKeys,
            localFileAccessEnabled: localAccess.localFileAccessEnabled,
            commandExecutionEnabled: localAccess.commandExecutionEnabled,
            fileAccessBaseDir: localAccess.fileAccessBaseDir,
            workspaceQuotaMb: localAccess.workspaceQuotaMb,
            hostedSandbox: localAccess.hostedSandbox,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tools: Record<string, any> = {};

        // Add built-in tools if enabled
        if (config.toolsEnabled !== false) {
            const availableTools = getAllTools();
            const enabledToolIds = config.enabledTools?.length
                ? config.enabledTools
                : availableTools.map((t) => t.id);

            for (const toolId of enabledToolIds) {
                const toolDef = getTool(toolId as ToolId);
                if (!toolDef) continue;

                tools[toolDef.id] = tool({
                    description: toolDef.description,
                    inputSchema: toolDef.schema,
                    execute: async (params) => {
                        const toolParams = params as Record<string, unknown>;
                        const activityId = `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

                        // Create activity log entry
                        const activityEntry: ActivityLogEntry = {
                            id: activityId,
                            timestamp: new Date().toISOString(),
                            type: 'tool_call',
                            toolName: toolDef.id,
                            summary: `Calling ${toolDef.id}...`,
                            status: 'running',
                        };
                        activityLog.push(activityEntry);

                        // Emit tool call event with activity log
                        emitEvent(onEvent, "tool_call", taskKey, undefined, {
                            toolName: toolDef.id,
                            args: params,
                            activityLog: [...activityLog],
                        });

                        try {
                            const result = await executeTool(
                                { toolId: toolDef.id as ToolId, params: toolParams },
                                toolContext
                            );

                            // Update activity entry
                            activityEntry.status = result.success ? 'success' : 'error';

                            // Handle file_write tool - track created files
                            if (toolDef.id === 'file_write' && result.success) {
                                const filePath = toolParams.path as string || toolParams.filePath as string;
                                const content = toolParams.content as string || '';
                                if (filePath) {
                                    const fileInfo: FileInfo = {
                                        path: filePath,
                                        name: path.basename(filePath),
                                        size: content.length,
                                        content: content.length < 50000 ? content : undefined, // Only include if < 50KB
                                        language: getLanguageFromPath(filePath),
                                        isNew: true,
                                    };
                                    filesCreated.push(fileInfo);
                                    activityEntry.type = 'file_created';
                                    activityEntry.summary = `Created ${fileInfo.name}`;
                                    activityEntry.file = fileInfo;

                                    // Emit file_created event
                                    emitEvent(onEvent, "file_created", taskKey, undefined, {
                                        file: fileInfo,
                                        activityLog: [...activityLog],
                                    });
                                }
                            }

                            // Handle file_read tool
                            if (toolDef.id === 'file_read' && result.success) {
                                const filePath = toolParams.path as string || toolParams.filePath as string;
                                if (filePath) {
                                    activityEntry.type = 'file_read';
                                    activityEntry.summary = `Read ${path.basename(filePath)}`;

                                    emitEvent(onEvent, "file_read", taskKey, undefined, {
                                        file: { path: filePath, name: path.basename(filePath) },
                                        activityLog: [...activityLog],
                                    });
                                }
                            }

                            // Handle shell_exec tool
                            if (toolDef.id === 'shell_exec' && result.success) {
                                const command = toolParams.command as string || '';
                                commandsExecuted++;
                                activityEntry.type = 'command';
                                activityEntry.summary = `Executed: ${command.slice(0, 50)}${command.length > 50 ? '...' : ''}`;

                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const resultData = result.data as any;
                                emitEvent(onEvent, "command_executed", taskKey, undefined, {
                                    command,
                                    exitCode: resultData?.exitCode,
                                    stdout: resultData?.stdout?.slice(0, 1000),
                                    stderr: resultData?.stderr?.slice(0, 500),
                                    activityLog: [...activityLog],
                                });
                            }

                            // Emit tool result event with updated activity log
                            emitEvent(onEvent, "tool_result", taskKey, undefined, {
                                toolName: toolDef.id,
                                result: result.data ?? result.error,
                                activityLog: [...activityLog],
                            });

                            return result.success ? result.data : { error: result.error };
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : "Unknown error";
                            activityEntry.status = 'error';
                            activityEntry.summary = `${toolDef.id} failed: ${errorMsg.slice(0, 50)}`;

                            emitEvent(onEvent, "tool_result", taskKey, undefined, {
                                toolName: toolDef.id,
                                result: { error: errorMsg },
                                activityLog: [...activityLog],
                            });
                            return { error: errorMsg };
                        }
                    },
                });
            }

            // Autonomous coordination tools
            tools["spawn_subtask"] = tool({
                description: "Spawn a parallel sub-task to handle part of the problem.",
                inputSchema: z.object({
                    prompt: z.string().min(1),
                    waitForCompletion: z.boolean().default(false),
                    modelId: z.string().optional(),
                    maxSteps: z.number().int().min(1).optional(),
                }),
                execute: async (params) => {
                    const { prompt: subPrompt, waitForCompletion, modelId, maxSteps } = params as {
                        prompt: string;
                        waitForCompletion: boolean;
                        modelId?: string;
                        maxSteps?: number;
                    };

                    const result = await spawnSubTask(taskKey, {
                        prompt: subPrompt,
                        modelId,
                        maxSteps,
                        waitForCompletion,
                        config,
                        apiKeys,
                        onEvent,
                    });

                    return result;
                },
            });

            tools["send_task_message"] = tool({
                description: "Send a message to another running task for coordination.",
                inputSchema: z.object({
                    toTaskKey: z.string().min(1),
                    message: z.string().min(1),
                    messageType: z.enum(["message", "result", "request", "status"]).default("message"),
                }),
                execute: async (params) => {
                    const { toTaskKey, message, messageType } = params as {
                        toTaskKey: string;
                        message: string;
                        messageType: "message" | "result" | "request" | "status";
                    };

                    return sendTaskMessage(taskKey, toTaskKey, messageType, { message });
                },
            });

            tools["check_task_messages"] = tool({
                description: "Check for messages sent to this task.",
                inputSchema: z.object({
                    unreadOnly: z.boolean().default(true),
                }),
                execute: async (params) => {
                    const { unreadOnly } = params as { unreadOnly: boolean };
                    const messages = await getTaskMessages(taskKey, { unreadOnly });
                    if (messages.length > 0) {
                        await markMessagesRead(messages.map((message) => message.id));
                    }
                    return { messages };
                },
            });
        }

        // Add plugin/skill tools
        await initializePlugins();
        for (const plugin of pluginRegistry.list()) {
            for (const pluginTool of plugin.manifest.tools || []) {
                const toolName = `${plugin.manifest.slug}__${pluginTool.name}`;
                tools[toolName] = tool({
                    description: pluginTool.description,
                    inputSchema: buildPluginInputSchema(pluginTool.parameters),
                    execute: async (params) => {
                        emitEvent(onEvent, "tool_call", taskKey, undefined, {
                            toolName,
                            args: params,
                        });

                        try {
                            const result = await pluginExecutor.execute(
                                plugin.manifest.slug,
                                pluginTool.name,
                                params as Record<string, unknown>,
                                { userId, conversationId, config: { googleApiKey: apiKeys.google } }
                            );

                            emitEvent(onEvent, "tool_result", taskKey, undefined, {
                                toolName,
                                result: result.data ?? result.error,
                            });

                            return result.success
                                ? result.data ?? (result as { output?: unknown }).output ?? {}
                                : { error: result.error };
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : "Unknown error";
                            emitEvent(onEvent, "tool_result", taskKey, undefined, {
                                toolName,
                                result: { error: errorMsg },
                            });
                            return { error: errorMsg };
                        }
                    },
                });
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aiTools: Record<string, any> | undefined =
            Object.keys(tools).length > 0 ? tools : undefined;

        // ====================================================================
        // MEMORY AND PROFILE CONTEXT (like regular chat route)
        // ====================================================================
        let memoryContext = "";
        let userProfileContext = "";

        if (config.memoryEnabled) {
            try {
                // Get local memory context
                const { getLocalMemoryContext, searchAllLocalMemory } = await import("@/lib/memory/local-memory");
                const localMemory = await getLocalMemoryContext(userId, prompt, 3000);

                // Also search archives for relevant context
                let searchResults = "";
                if (prompt.trim()) {
                    const results = await searchAllLocalMemory(userId, prompt, 5);
                    if (results.length > 0) {
                        searchResults = results.map(r => `- ${r}`).join("\n");
                    }
                }

                // Try Gemini memory if available
                let geminiMemory = "";
                if (apiKeys.google) {
                    try {
                        const { retrieveMemories } = await import("@/lib/memory/memory-store");
                        geminiMemory = await retrieveMemories(userId, apiKeys.google, prompt);
                    } catch (err) {
                        console.log("[Autonomous] Gemini memory not available:", err);
                    }
                }

                const memoryParts: string[] = [];
                if (localMemory) memoryParts.push(`## Recent Conversation Memory\n${localMemory}`);
                if (searchResults) memoryParts.push(`## Relevant Past Discussions\n${searchResults}`);
                if (geminiMemory) memoryParts.push(`## Memory Search Results\n${geminiMemory}`);
                memoryContext = memoryParts.join("\n\n");

                console.log(`[Autonomous] Memory context: local=${localMemory.length}chars, search=${searchResults.length}chars, gemini=${geminiMemory.length}chars`);
            } catch (err) {
                console.error("[Autonomous] Memory retrieval failed:", err);
            }

            // Get user profile context
            try {
                const { getProfileContext, extractAndSaveUserInfo, isProfileMemoryEnabled } = await import("@/lib/memory/user-profile");
                const profileEnabled = await isProfileMemoryEnabled();

                if (profileEnabled) {
                    userProfileContext = await getProfileContext(userId, 1500);

                    // Extract and save user info from the prompt (fire-and-forget)
                    if (prompt.trim()) {
                        extractAndSaveUserInfo(userId, prompt, conversationId).catch((err) => {
                            console.error("[Autonomous] User profile extraction failed:", err);
                        });
                    }
                }

                if (userProfileContext) {
                    console.log(`[Autonomous] User profile context: ${userProfileContext.length}chars`);
                }
            } catch (err) {
                console.error("[Autonomous] Profile retrieval failed:", err);
            }
        }

        // Build message history
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const messageHistory: any[] = [];

        // Build system prompt with memory and profile context
        const systemParts: string[] = [];

        // Add configured system prompt if any
        if (config.agentSystemPrompt) {
            systemParts.push(config.agentSystemPrompt);
        }

        // Add user profile context
        if (userProfileContext) {
            systemParts.push(userProfileContext);
        }

        // Add memory context
        if (memoryContext) {
            systemParts.push("## Conversation Memory\n" + memoryContext);
        }

        // Add autonomous mode instructions
        systemParts.push(`
## Autonomous Mode Instructions
You are working in autonomous mode. Complete the user's task step by step:
1. Analyze what needs to be done
2. Use available tools to accomplish the task
3. When finished, provide a clear summary of what was done
4. Say "Task complete" when you have finished all requested work`);

        // Add system message if we have content
        if (systemParts.length > 0) {
            messageHistory.push({
                role: "system",
                content: systemParts.join("\n\n"),
            });
        }

        // Add initial user message
        messageHistory.push({
            role: "user",
            content: prompt,
        });

        // Main loop variables
        let step = 0;
        let totalToolCalls = 0;
        let totalTokens = 0;
        let isComplete = false;
        let finalOutput = "";

        // Track files and activity for detailed reporting
        const filesCreated: FileInfo[] = [];
        const filesModified: FileInfo[] = [];
        const activityLog: ActivityLogEntry[] = [];
        let commandsExecuted = 0;

        // Helper to detect file language from extension
        const getLanguageFromPath = (filePath: string): string => {
            const ext = path.extname(filePath).toLowerCase();
            const langMap: Record<string, string> = {
                '.js': 'javascript', '.jsx': 'javascript',
                '.ts': 'typescript', '.tsx': 'typescript',
                '.py': 'python', '.rb': 'ruby',
                '.html': 'html', '.htm': 'html',
                '.css': 'css', '.scss': 'scss', '.less': 'less',
                '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
                '.md': 'markdown', '.mdx': 'markdown',
                '.sql': 'sql', '.sh': 'bash', '.bash': 'bash',
                '.go': 'go', '.rs': 'rust', '.java': 'java',
                '.c': 'c', '.cpp': 'cpp', '.h': 'c',
                '.php': 'php', '.swift': 'swift', '.kt': 'kotlin',
            };
            return langMap[ext] || 'plaintext';
        };

        // ====================================================================
        // MAIN AUTONOMOUS LOOP
        // ====================================================================
        while (!isComplete && step < maxSteps && runState.isRunning) {
            // Check for abort signal
            if (abortController.signal.aborted) {
                emitEvent(onEvent, "aborted", taskKey, step);
                // Save session state before aborting
                await saveSessionState(taskKey, { isRunning: false, lastStep: step });
                await db
                    .update(autonomousTasks)
                    .set({
                        status: "aborted",
                        completedAt: new Date(),
                        currentStep: step,
                        totalTokensUsed: totalTokens,
                    })
                    .where(eq(autonomousTasks.id, task.id));
                return taskKey;
            }

            step++;
            emitEvent(onEvent, "step_start", taskKey, step);

            // Persist session state at each step (for crash recovery)
            await saveSessionState(taskKey, {
                isRunning: true,
                lastStep: step,
            });

            // Check for queued steer messages
            if (runState.queuedMessages.length > 0) {
                const steerMessage = runState.queuedMessages.shift()!;
                emitEvent(onEvent, "steer_received", taskKey, step, {
                    steerMessage,
                });

                // Add steer message to history
                messageHistory.push({
                    role: "user",
                    content: `[Steering message from user]: ${steerMessage}`,
                });

                // Save steer message to DB
                await db.insert(messagesTable).values({
                    conversationId: conversationId!,
                    role: "user",
                    content: `[Steering]: ${steerMessage}`,
                });
            }

            // Call the LLM
            try {
                const result = await generateText({
                    model: aiModel,
                    messages: messageHistory,
                    tools: aiTools,
                    temperature: config.temperature ?? 0.7,
                    abortSignal: abortController.signal,
                });

                // Process result
                const responseText = result.text || "";
                const toolCalls = result.toolCalls || [];
                const finishReason = result.finishReason || "stop";
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const usage = result.usage as any;

                // Update token count
                if (usage) {
                    totalTokens += (usage.promptTokens || usage.inputTokens || 0) + (usage.completionTokens || usage.outputTokens || 0);
                }

                // Count tool calls
                totalToolCalls += toolCalls.length;

                // Emit text if present
                if (responseText) {
                    emitEvent(onEvent, "text_delta", taskKey, step, {
                        delta: responseText,
                    });
                    emitEvent(onEvent, "text_complete", taskKey, step, {
                        content: responseText,
                    });
                }

                // Add assistant response to history
                if (responseText) {
                    messageHistory.push({
                        role: "assistant",
                        content: responseText,
                    });
                }

                // Update last tool call in DB
                if (toolCalls.length > 0) {
                    const lastToolCall = toolCalls[toolCalls.length - 1];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const toolArgs = (lastToolCall as any).args ?? (lastToolCall as any).input ?? {};
                    await db
                        .update(autonomousTasks)
                        .set({
                            lastToolCall: {
                                name: lastToolCall.toolName,
                                args: toolArgs,
                            },
                            toolCallsCount: totalToolCalls,
                            lastActivityAt: new Date(),
                        })
                        .where(eq(autonomousTasks.id, task.id));
                }

                // Check for completion
                isComplete = detectCompletion(
                    responseText,
                    toolCalls.length > 0,
                    finishReason
                );

                if (isComplete) {
                    finalOutput = responseText;
                }

                // Update progress in DB
                const progressSummary = isComplete
                    ? "Task completed"
                    : `Step ${step}/${maxSteps} - ${toolCalls.length > 0 ? `Called ${toolCalls.length} tool(s)` : "Processing"}`;

                await db
                    .update(autonomousTasks)
                    .set({
                        currentStep: step,
                        progressSummary,
                        totalTokensUsed: totalTokens,
                        lastActivityAt: new Date(),
                    })
                    .where(eq(autonomousTasks.id, task.id));

                // Emit progress event
                emitEvent(onEvent, "progress", taskKey, step, {
                    summary: progressSummary,
                    totalSteps: step,
                    totalToolCalls,
                    totalTokens,
                });

            } catch (error) {
                if (abortController.signal.aborted) {
                    emitEvent(onEvent, "aborted", taskKey, step);
                    await db
                        .update(autonomousTasks)
                        .set({
                            status: "aborted",
                            completedAt: new Date(),
                            currentStep: step,
                        })
                        .where(eq(autonomousTasks.id, task.id));
                    return taskKey;
                }

                // Check if it's a timeout
                const errorMsg = error instanceof Error ? error.message : "Unknown error";
                if (errorMsg.includes("timeout") || errorMsg.includes("aborted")) {
                    emitEvent(onEvent, "timeout", taskKey, step, { error: errorMsg });
                    await db
                        .update(autonomousTasks)
                        .set({
                            status: "failed",
                            errorMessage: "Task timed out",
                            completedAt: new Date(),
                            currentStep: step,
                        })
                        .where(eq(autonomousTasks.id, task.id));
                    return taskKey;
                }

                // Other error
                emitEvent(onEvent, "error", taskKey, step, { error: errorMsg });
                await db
                    .update(autonomousTasks)
                    .set({
                        status: "failed",
                        errorMessage: errorMsg,
                        completedAt: new Date(),
                        currentStep: step,
                    })
                    .where(eq(autonomousTasks.id, task.id));
                return taskKey;
            }
        }

        // ====================================================================
        // LOOP COMPLETED
        // ====================================================================

        // Save final session state
        await saveSessionState(taskKey, {
            isRunning: false,
            lastStep: step,
        });

        // Determine final status
        const status = isComplete
            ? "completed"
            : step >= maxSteps
                ? "completed" // Max steps reached, treat as complete
                : "failed";

        // Save final assistant message
        if (finalOutput) {
            await db.insert(messagesTable).values({
                conversationId: conversationId!,
                role: "assistant",
                content: finalOutput,
            });
        }

        // Update task record
        await db
            .update(autonomousTasks)
            .set({
                status,
                finalOutput: finalOutput || null,
                completedAt: new Date(),
                currentStep: step,
                toolCallsCount: totalToolCalls,
                totalTokensUsed: totalTokens,
                progressSummary: status === "completed" ? "Task completed successfully" : "Max steps reached",
            })
            .where(eq(autonomousTasks.id, task.id));

        // Emit completion event with full details
        emitEvent(onEvent, "complete", taskKey, step, {
            finalOutput,
            totalSteps: step,
            totalToolCalls,
            totalTokens,
            filesCreated,
            filesModified,
            commandsExecuted,
            activityLog: [...activityLog],
        });

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        emitEvent(onEvent, "error", taskKey, 0, { error: errorMsg });

        await db
            .update(autonomousTasks)
            .set({
                status: "failed",
                errorMessage: errorMsg,
                completedAt: new Date(),
            })
            .where(eq(autonomousTasks.id, task.id));

    } finally {
        // Cleanup
        clearTimeout(timeoutId);
        ACTIVE_RUNS.delete(taskKey);
        // Remove channel -> task mapping
        if (channelAccountId) {
            CHANNEL_ACTIVE_TASKS.delete(channelAccountId);
        }
    }

    return taskKey;
}

/**
 * Get task status from database
 */
export async function getTaskStatus(taskKey: string): Promise<{
    status: string;
    currentStep: number;
    progressSummary: string | null;
    toolCallsCount: number;
    totalTokensUsed: number;
} | null> {
    const task = await db.query.autonomousTasks.findFirst({
        where: eq(autonomousTasks.taskKey, taskKey),
    });

    if (!task) {
        return null;
    }

    return {
        status: task.status,
        currentStep: task.currentStep ?? 0,
        progressSummary: task.progressSummary,
        toolCallsCount: task.toolCallsCount ?? 0,
        totalTokensUsed: task.totalTokensUsed ?? 0,
    };
}
