/**
 * Isolated Agent Runner
 *
 * Runs AI agent turns in isolated sessions for scheduled tasks, boot scripts, and event triggers.
 * Supports:
 * - Isolated session (new conversation context)
 * - Main session (continue existing conversation)
 * - Optional message delivery to channels
 * - Tool execution (datetime, web_search, file tools, etc.)
 * - Conversation consolidation (reuse conversations per task)
 */

import { db } from '@/lib/db';
import {
  conversations,
  messages,
  channelAccounts,
  adminSettings,
  channelMessages,
  agents,
} from '@/lib/db/schema';
import type { ChannelConfig } from '@/lib/db/schema';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { tool, type ModelMessage } from 'ai';
import { getModelWithKey, getModelConfig } from '@/lib/ai/providers/factory';
import { getUserApiKeys } from '@/lib/ai/get-user-keys';
import { getChannelManager } from '@/lib/channels/manager';
import { resolveTelegramChatIdFromAccount } from '@/lib/channels/telegram/chat-id';
import { decrypt } from '@/lib/crypto';
import { getAllTools, getTool, executeTool, type ToolId, type ToolContext } from '@/lib/tools';
import { getLocalAccessContext } from '@/lib/admin/settings';
import { getConfigSection } from '@/lib/config';
import { getUserProfile } from '@/lib/memory/user-profile';
import { pluginRegistry, initializePlugins, pluginExecutor } from '@/lib/plugins';
import { buildPluginInputSchema } from '@/lib/plugins/utils';
import { resolveTimezone } from '@/lib/scheduler/timezone';
import {
  executeTaskWithRetry,
  sendTelegramNotification,
  buildFailureMessage,
  loadTaskExecutorConfig,
  type TaskExecutorConfig,
} from '@/lib/ai/task-executor';
import { beforeAgentStart, afterAgentEnd } from '@/lib/memory/lifecycle-hooks';

// ============================================================================
// Types
// ============================================================================

export interface IsolatedAgentConfig {
  userId: string;
  taskId: string;
  taskName: string;
  message: string;
  channelAccountId?: string;
  sessionTarget: 'main' | 'isolated';
  includeRecentMessages: number;
  deliver: boolean;
  channel?: string;
  to?: string;
  timeout?: number;
  maxTokens?: number;
  /** Override model - if not set, auto-selects based on API keys */
  modelId?: string;
  /** Optional preconfigured agent template/profile to run this task with */
  agentId?: string;
  /** Enable tool execution (default: true) */
  enableTools?: boolean;
  /** Enable plugin skills (default: true) */
  enableSkills?: boolean;
  /** Consolidate conversations - reuse existing conversation for this task (default: true) */
  consolidateConversations?: boolean;
  /** Maximum retry attempts for task completion (default: 3) */
  maxAttempts?: number;
  /** Require tool call for task completion (default: true for scheduled tasks) */
  requireToolCall?: boolean;
  /** Notify on Telegram if task fails (default: true) */
  notifyTelegramOnFailure?: boolean;
}

export interface IsolatedAgentResult {
  success: boolean;
  taskExecutionStatus: 'success' | 'failed';
  primaryDeliveryStatus: 'delivered' | 'failed' | 'not_requested';
  failureNotificationStatus: 'sent' | 'failed' | 'skipped';
  output?: string;
  error?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
  deliveredTo?: string;
  conversationId?: string;
  toolsUsed?: string[];
}

// ============================================================================
// Isolated Agent Runner
// ============================================================================

/**
 * Run an isolated agent turn with full tool support
 */
export async function runIsolatedAgent(config: IsolatedAgentConfig): Promise<IsolatedAgentResult> {
  const {
    userId,
    taskId,
    taskName,
    message,
    channelAccountId,
    sessionTarget,
    includeRecentMessages,
    deliver,
    channel,
    to,
    timeout = 180000, // 3 minutes - enough for web searches
    maxTokens,
    modelId: configModelId,
    agentId: configAgentId,
    enableTools = true,
    enableSkills = true,
    consolidateConversations = true,
  } = config;

  console.log(`[IsolatedAgent] Running task ${taskName} (${taskId}) for user ${userId}`);

  try {
    // Get user's API keys
    const apiKeys = await getUserApiKeys(userId);

    // Resolve selected agent (if task is configured for agent execution mode).
    let selectedAgent:
      | {
          id: string;
          name: string;
          modelId: string;
          systemPrompt: string | null;
        }
      | undefined;

    if (configAgentId) {
      const [agentRecord] = await db
        .select({
          id: agents.id,
          name: agents.name,
          modelId: agents.modelId,
          systemPrompt: agents.systemPrompt,
        })
        .from(agents)
        .where(and(eq(agents.id, configAgentId), eq(agents.userId, userId)))
        .limit(1);

      if (!agentRecord) {
        return {
          success: false,
          taskExecutionStatus: 'failed',
          primaryDeliveryStatus: deliver ? 'failed' : 'not_requested',
          failureNotificationStatus: 'skipped',
          error: `Agent not found: ${configAgentId}`,
        };
      }
      selectedAgent = agentRecord;
    }

    // Determine model to use - priority:
    // 1. Agent-bound model (if execution uses agent mode)
    // 2. Explicitly configured model for this task
    // 3. Channel account model (if linked)
    // 4. Admin settings default agent model
    // 5. Auto-select based on available API keys
    let modelId: string | undefined = selectedAgent?.modelId || configModelId;

    // If no explicit model, check channel config
    if (!modelId && channelAccountId) {
      const [account] = await db
        .select()
        .from(channelAccounts)
        .where(and(eq(channelAccounts.id, channelAccountId), eq(channelAccounts.userId, userId)))
        .limit(1);

      if (account?.config) {
        const channelConfig = account.config as ChannelConfig;
        if (channelConfig.model && channelConfig.model !== 'auto') {
          modelId = channelConfig.model;
        }
      }
    }

    // If still no model, check admin settings default
    if (!modelId) {
      const [settings] = await db.select().from(adminSettings).limit(1);
      if (settings?.defaultAgentModel) {
        modelId = settings.defaultAgentModel;
      }
    }

    // Auto-select based on available API keys if still no model
    if (!modelId) {
      if (apiKeys.anthropic) {
        modelId = 'claude-sonnet-4-20250514';
      } else if (apiKeys.openai) {
        modelId = 'gpt-4o';
      } else if (apiKeys.google) {
        modelId = 'gemini-2.0-flash-exp';
      } else if (apiKeys.openrouter) {
        modelId = 'anthropic/claude-sonnet-4-20250514';
      } else if (apiKeys.xai) {
        modelId = 'grok-3-mini';
      } else {
        // Default fallback
        modelId = 'gpt-4o';
      }
    }

    console.log(`[IsolatedAgent] Using model: ${modelId}`);

    const modelConfig = getModelConfig(modelId);
    if (!modelConfig) {
      return {
        success: false,
        taskExecutionStatus: 'failed',
        primaryDeliveryStatus: deliver ? 'failed' : 'not_requested',
        failureNotificationStatus: 'skipped',
        error: `Model not found: ${modelId}`,
      };
    }

    const model = getModelWithKey(modelId, apiKeys);

    // Build messages
    const aiMessages: ModelMessage[] = [];

    // System prompt for scheduled task
    aiMessages.push({
      role: 'system',
      content: buildSystemPrompt(taskName, sessionTarget, enableTools, selectedAgent),
    });

    // Memory retrieval — inject relevant past context into system prompt
    try {
      const memoryInjection = await beforeAgentStart({
        userId,
        conversationId: taskId, // synthetic — used only as metadata key
        input: message,
        systemPrompt: aiMessages[0].content as string,
        channelType: 'scheduled',
        channelId: taskId,
      });
      if (memoryInjection.memoriesFound > 0) {
        aiMessages[0] = { role: 'system', content: memoryInjection.systemPrompt };
        console.log(`[IsolatedAgent] Injected ${memoryInjection.memoriesFound} memories`);
      }
    } catch (memErr) {
      console.error('[IsolatedAgent] Memory retrieval failed (continuing without):', memErr);
    }

    // Include recent messages if requested and using main session
    if (sessionTarget === 'main' && includeRecentMessages > 0 && channelAccountId) {
      const recentMessages = await getRecentMessages(
        userId,
        channelAccountId,
        includeRecentMessages
      );
      for (const msg of recentMessages) {
        aiMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Add the task message
    aiMessages.push({
      role: 'user',
      content: message,
    });

    // === Build Tools (if enabled) ===
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
    let aiTools: Record<string, any> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, any> = {};

    if (enableTools) {
      const availableTools = getAllTools();
      // Exclude orchestration utilities from scheduled runs:
      // - channel_message: delivery is handled by deliverMessage()
      // - scheduled_task: prevents recursive self-modifying schedules
      let enabledToolIds = availableTools
        .filter((t) => t.id !== 'channel_message' && t.id !== 'scheduled_task')
        .map((t) => t.id);

      // Include local-access tools when admin settings allow
      if (localAccess.localFileAccessEnabled) {
        const fileToolIds = availableTools
          .filter((t) => t.category === 'filesystem')
          .map((t) => t.id);
        enabledToolIds = [...new Set([...enabledToolIds, ...fileToolIds])];
      }
      if (localAccess.commandExecutionEnabled) {
        const systemToolIds = availableTools
          .filter((t) => t.category === 'system')
          .map((t) => t.id);
        enabledToolIds = [...new Set([...enabledToolIds, ...systemToolIds])];
      }

      for (const toolId of enabledToolIds) {
        const toolDef = getTool(toolId as ToolId);
        if (toolDef) {
          tools[toolDef.id] = tool({
            description: toolDef.description,
            inputSchema: toolDef.schema,
            execute: async (params) => {
              console.log(`[IsolatedAgent] Executing tool ${toolDef.id}`);
              try {
                const result = await executeTool(
                  { toolId: toolDef.id as ToolId, params: params as Record<string, unknown> },
                  toolContext
                );
                if (result.success) {
                  return result.data;
                }
                return { error: result.error };
              } catch (error) {
                console.error(`[IsolatedAgent] Tool ${toolDef.id} error:`, error);
                return { error: error instanceof Error ? error.message : 'Unknown error' };
              }
            },
          });
        }
      }
    }

    let profileTimezone: string | undefined;
    try {
      const profile = await getUserProfile(userId);
      const trimmed = profile.timezone?.trim();
      if (trimmed) profileTimezone = trimmed;
    } catch {
      // Ignore profile errors and fall back to plugin defaults
    }

    const fallbackTimezone = resolveTimezone(null);
    const allowDateTimeWithoutSkills = true;

    if (enableSkills || allowDateTimeWithoutSkills) {
      // Ensure plugins are loaded
      await initializePlugins();

      for (const plugin of pluginRegistry.list()) {
        if (!enableSkills && plugin.manifest.slug !== 'datetime') {
          continue;
        }

        for (const pluginTool of plugin.manifest.tools || []) {
          const toolName = `${plugin.manifest.slug}__${pluginTool.name}`;
          tools[toolName] = tool({
            description: pluginTool.description,
            inputSchema: buildPluginInputSchema(pluginTool.parameters),
            execute: async (params) => {
              console.log(`[IsolatedAgent] Executing skill ${toolName}`);
              try {
                const result = await pluginExecutor.execute(
                  plugin.manifest.slug,
                  pluginTool.name,
                  params as Record<string, unknown>,
                  {
                    userId,
                    conversationId: undefined,
                    channelType: channel || 'scheduled',
                    channelId: taskId,
                    config:
                      plugin.manifest.slug === 'datetime'
                        ? { defaultTimezone: profileTimezone ?? fallbackTimezone }
                        : {},
                  }
                );
                if (result.success) {
                  return (
                    result.data ?? (result as { output?: unknown }).output ?? result.metadata ?? {}
                  );
                }
                return { error: result.error };
              } catch (error) {
                console.error(`[IsolatedAgent] Skill ${toolName} error:`, error);
                return { error: error instanceof Error ? error.message : 'Unknown error' };
              }
            },
          });
        }
      }
    }

    if (Object.keys(tools).length > 0) {
      aiTools = tools;
      console.log(`[IsolatedAgent] Tools enabled: ${Object.keys(tools).join(', ')}`);

      // Add tool awareness to system prompt
      const toolNames = Object.keys(tools);
      const hasDatetimeTools = toolNames.some((t) => t.includes('datetime'));
      const hasWebSearch = toolNames.some((t) => t.includes('web') || t.includes('search'));

      const toolHints: string[] = [];
      if (hasDatetimeTools) {
        toolHints.push(
          'You have datetime tools to get the current time. ALWAYS use datetime__current_time to get accurate time - never guess or approximate.'
        );
      }
      if (hasWebSearch) {
        toolHints.push(
          'You have web search tools to find current information online. Use them for any questions requiring up-to-date data.'
        );
      }

      if (toolHints.length > 0) {
        aiMessages.splice(1, 0, {
          role: 'system',
          content: `## Available Tools\n\n${toolHints.join('\n')}\n\nALWAYS use your tools when relevant. Never guess at data you can look up.\n\nIMPORTANT: When asked to do something, DO IT immediately using your tools. Do NOT say "I will check" or "Let me look" - actually call the tool and provide the results.`,
        });
      }
    }

    // Configure task executor with retry logic
    // Load defaults from unified config, allow overrides from task config
    const defaultTaskConfig = await loadTaskExecutorConfig();
    const taskConfig: Partial<TaskExecutorConfig> = {
      maxAttempts: config.maxAttempts ?? defaultTaskConfig.maxAttempts,
      completionTimeout: timeout,
      requireToolCall: config.requireToolCall ?? defaultTaskConfig.requireToolCall ?? false,
      notifyOriginalChannel: defaultTaskConfig.notifyOriginalChannel,
      notifyTelegram: config.notifyTelegramOnFailure ?? defaultTaskConfig.notifyTelegram,
      telegramChatId: defaultTaskConfig.telegramChatId,
    };

    // Apply admin-configured default max tokens (same as channel processor).
    // Without this, maxTokens is undefined and providers default to their
    // maximum (e.g. 65536 on OpenRouter), which can exhaust credits fast.
    const channelsConfig = await getConfigSection('channels');
    const effectiveMaxTokens = maxTokens ?? channelsConfig.defaultMaxTokens;

    // Execute task with retry and completion detection
    const taskResult = await executeTaskWithRetry(message, taskConfig, {
      model,
      messages: aiMessages,
      tools: aiTools,
      maxTokens: effectiveMaxTokens,
      maxToolSteps: 15,
    });

    console.log(
      `[IsolatedAgent] Task result: success=${taskResult.success}, attempts=${taskResult.attempts}, tools=${taskResult.toolsCalled.join(',')}`
    );

    // Handle task failure
    if (!taskResult.success) {
      console.warn(
        `[IsolatedAgent] Task "${taskName}" failed after ${taskResult.attempts} attempts: ${taskResult.failureReason}`
      );

      // Send failure notification to Telegram if configured
      let failureNotificationStatus: IsolatedAgentResult['failureNotificationStatus'] = 'skipped';
      let telegramNotificationSent = false;
      if (taskConfig.notifyTelegram && channelAccountId) {
        telegramNotificationSent = await notifyTaskFailure(
          userId,
          channelAccountId,
          taskName,
          taskResult
        );
        failureNotificationStatus = telegramNotificationSent ? 'sent' : 'failed';
      }

      // Send failure notification to original channel if configured
      // Skip if we already sent a Telegram notification to the same channel account
      // (prevents duplicate messages to the same Telegram chat)
      const skipDuplicateNotification =
        telegramNotificationSent && (!channel || channel === 'telegram');
      let primaryDeliveryStatus: IsolatedAgentResult['primaryDeliveryStatus'] = deliver
        ? 'failed'
        : 'not_requested';

      if (taskConfig.notifyOriginalChannel && channelAccountId && !skipDuplicateNotification) {
        const failureMessage =
          `⚠️ **Task Failed:** ${taskName}\n\n` +
          `**Attempts:** ${taskResult.attempts}\n` +
          `**Reason:** ${taskResult.failureReason || 'Unknown error'}\n` +
          (taskResult.output
            ? `\n**Partial Output:**\n${taskResult.output.slice(0, 500)}${taskResult.output.length > 500 ? '...' : ''}`
            : '');

        const failureNotificationDelivery = await deliverMessage(userId, failureMessage, {
          channelAccountId,
          channel,
          to,
        });
        if (failureNotificationDelivery) {
          failureNotificationStatus = 'sent';
        } else if (failureNotificationStatus !== 'sent') {
          failureNotificationStatus = 'failed';
        }
        console.log('[IsolatedAgent] Failure notification sent to original channel');
      } else if (deliver && taskResult.output && !skipDuplicateNotification) {
        // Still deliver partial results if configured (fallback behavior)
        const failureNote = `\n\n---\n⚠️ Note: This task may be incomplete (${taskResult.attempts} attempts, reason: ${taskResult.failureReason})`;
        const fallbackDelivery = await deliverMessage(userId, taskResult.output + failureNote, {
          channelAccountId,
          channel,
          to,
        });
        primaryDeliveryStatus = fallbackDelivery ? 'delivered' : 'failed';
      }

      return {
        success: false,
        taskExecutionStatus: 'failed',
        primaryDeliveryStatus,
        failureNotificationStatus,
        output: taskResult.output,
        error: taskResult.failureReason,
        tokensUsed: taskResult.tokensUsed,
        toolsUsed: taskResult.toolsCalled.length > 0 ? taskResult.toolsCalled : undefined,
      };
    }

    // Task succeeded
    const fullResponse = taskResult.output;

    // Save task result to memory (fire-and-forget)
    afterAgentEnd(
      {
        userId,
        conversationId: taskId,
        input: message,
        systemPrompt: '',
        channelType: 'scheduled',
        channelId: taskId,
      },
      {
        output: fullResponse,
        tokensUsed: taskResult.tokensUsed,
        toolsCalled: taskResult.toolsCalled,
      }
    ).catch((err) => console.error('[IsolatedAgent] Memory save failed:', err));

    // Store conversation if using isolated session
    let conversationId: string | undefined;
    if (sessionTarget === 'isolated') {
      conversationId = await storeConversation(
        userId,
        taskId,
        taskName,
        message,
        fullResponse,
        consolidateConversations
      );
    }

    // Deliver message if requested
    let deliveredTo: string | undefined;
    let primaryDeliveryStatus: IsolatedAgentResult['primaryDeliveryStatus'] = deliver
      ? 'failed'
      : 'not_requested';
    if (deliver && fullResponse) {
      deliveredTo = await deliverMessage(userId, fullResponse, {
        channelAccountId,
        channel,
        to,
      });
      primaryDeliveryStatus = deliveredTo ? 'delivered' : 'failed';
    }

    if (deliver && fullResponse && !deliveredTo) {
      const deliveryError = 'Delivery failed (no channel accepted the message)';
      let failureNotificationStatus: IsolatedAgentResult['failureNotificationStatus'] = 'skipped';

      if (taskConfig.notifyTelegram && channelAccountId) {
        const notificationSent = await notifyTaskFailure(userId, channelAccountId, taskName, {
          attempts: taskResult.attempts,
          failureReason: deliveryError,
          output: fullResponse,
        });
        failureNotificationStatus = notificationSent ? 'sent' : 'failed';
      }

      return {
        success: false,
        taskExecutionStatus: 'success',
        primaryDeliveryStatus,
        failureNotificationStatus,
        output: fullResponse,
        error: deliveryError,
        tokensUsed: taskResult.tokensUsed,
        deliveredTo: undefined,
        conversationId,
        toolsUsed: taskResult.toolsCalled.length > 0 ? taskResult.toolsCalled : undefined,
      };
    }

    return {
      success: true,
      taskExecutionStatus: 'success',
      primaryDeliveryStatus,
      failureNotificationStatus: 'skipped',
      output: fullResponse,
      tokensUsed: taskResult.tokensUsed,
      deliveredTo,
      conversationId,
      toolsUsed: taskResult.toolsCalled.length > 0 ? taskResult.toolsCalled : undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        taskExecutionStatus: 'failed',
        primaryDeliveryStatus: deliver ? 'failed' : 'not_requested',
        failureNotificationStatus: 'skipped',
        error: `Task timed out after ${timeout}ms`,
      };
    }

    console.error(`[IsolatedAgent] Error running task ${taskId}:`, error);
    return {
      success: false,
      taskExecutionStatus: 'failed',
      primaryDeliveryStatus: deliver ? 'failed' : 'not_requested',
      failureNotificationStatus: 'skipped',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Build system prompt for scheduled task
 */
function buildSystemPrompt(
  taskName: string,
  sessionTarget: 'main' | 'isolated',
  toolsEnabled: boolean,
  selectedAgent?: { name: string; systemPrompt: string | null }
): string {
  let base = `You are an AI assistant executing a scheduled task: "${taskName}".

This is an automated task that runs on a schedule. Complete the requested task efficiently and provide a clear, concise response.

IMPORTANT: Your text response will be automatically delivered to the user via their configured channel (Telegram, etc.). Do NOT attempt to send messages yourself using tools like channel_message. Simply produce the response content and the system will deliver it. Focus on generating helpful, complete content.`;

  if (selectedAgent?.systemPrompt?.trim()) {
    base += `

You are executing with agent profile "${selectedAgent.name}". Follow this profile exactly:

${selectedAgent.systemPrompt.trim()}`;
  }

  if (toolsEnabled) {
    base += `

You have access to tools that can help you complete this task. USE THEM whenever relevant:
- For current time/date: use datetime tools (datetime__current_time)
- For web searches: use web search tools
- For file operations: use file tools (if enabled)

IMPORTANT: Never guess at information you can look up with tools. Always use the appropriate tool.`;
  }

  if (sessionTarget === 'main') {
    base += `

You have access to recent conversation history for context. Use it to maintain continuity if relevant.`;
  } else {
    base += `

This is running in an isolated session. Focus solely on the task at hand.`;
  }

  return base;
}

/**
 * Get recent messages for main session context
 */
async function getRecentMessages(
  userId: string,
  channelAccountId: string,
  limit: number
): Promise<Array<{ role: string; content: string }>> {
  // Find conversations linked to this channel
  const recentConversations = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), isNull(conversations.deletedAt)))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);

  if (recentConversations.length === 0) {
    return [];
  }

  const conversation = recentConversations[0];

  // Check if this conversation is linked to the channel
  const metadata = conversation.metadata as { channelAccountId?: string } | null;
  if (metadata?.channelAccountId !== channelAccountId) {
    return [];
  }

  // Get recent messages
  const recentMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return recentMessages.reverse().map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

/**
 * Store conversation - consolidate if enabled (reuse existing conversation for same task)
 */
async function storeConversation(
  userId: string,
  taskId: string,
  taskName: string,
  userMessage: string,
  assistantResponse: string,
  consolidate: boolean
): Promise<string> {
  let conversationId: string;

  if (consolidate) {
    // Look for existing conversation for this task
    const [existing] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.userId, userId), isNull(conversations.deletedAt)))
      .orderBy(desc(conversations.createdAt))
      .limit(100); // Check recent conversations

    // Find one with matching taskId in metadata
    const existingConversations = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.userId, userId), isNull(conversations.deletedAt)))
      .orderBy(desc(conversations.updatedAt))
      .limit(50);

    const matchingConversation = existingConversations.find((c) => {
      const meta = c.metadata as { scheduledTaskId?: string } | null;
      return meta?.scheduledTaskId === taskId;
    });

    if (matchingConversation) {
      conversationId = matchingConversation.id;

      // Update conversation timestamp
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    } else {
      // Create new conversation
      const [conversation] = await db
        .insert(conversations)
        .values({
          userId,
          title: `Scheduled: ${taskName}`,
          metadata: {
            isScheduledTask: true,
            scheduledTaskId: taskId,
            taskName,
          },
        })
        .returning();
      conversationId = conversation.id;
    }
  } else {
    // Always create new conversation
    const [conversation] = await db
      .insert(conversations)
      .values({
        userId,
        title: `Scheduled: ${taskName}`,
        metadata: {
          isScheduledTask: true,
          scheduledTaskId: taskId,
          taskName,
        },
      })
      .returning();
    conversationId = conversation.id;
  }

  // Store messages
  await db.insert(messages).values([
    {
      conversationId,
      role: 'user',
      content: userMessage,
      metadata: { isScheduledTask: true, taskId },
    },
    {
      conversationId,
      role: 'assistant',
      content: assistantResponse,
      metadata: { isScheduledTask: true, taskId },
    },
  ]);

  return conversationId;
}

/**
 * Deliver message to channel
 *
 * This function sends messages directly via the channel's API without requiring
 * the polling connector to be active. This allows scheduled tasks to deliver
 * messages even when there are connection conflicts (e.g., 409 errors).
 */
async function deliverMessage(
  userId: string,
  content: string,
  options: {
    channelAccountId?: string;
    channel?: string;
    to?: string;
  }
): Promise<string | undefined> {
  const { channelAccountId, channel, to } = options;

  if (!channelAccountId && !channel) {
    console.log('[IsolatedAgent] No delivery target specified, skipping delivery');
    return undefined;
  }

  try {
    let targetChannelAccountId = channelAccountId;

    // If channel type specified but no account ID, find the account
    if (!targetChannelAccountId && channel) {
      const [account] = await db
        .select()
        .from(channelAccounts)
        .where(
          and(
            eq(channelAccounts.userId, userId),
            eq(channelAccounts.channelType, channel),
            eq(channelAccounts.isActive, true)
          )
        )
        .limit(1);

      if (account) {
        targetChannelAccountId = account.id;
      }
    }

    if (!targetChannelAccountId) {
      console.log(`[IsolatedAgent] No active channel account found for ${channel}`);
      return undefined;
    }

    // Get channel account details
    const [account] = await db
      .select()
      .from(channelAccounts)
      .where(eq(channelAccounts.id, targetChannelAccountId))
      .limit(1);

    if (!account) {
      return undefined;
    }

    // Send directly via channel API (bypasses ChannelManager connector requirement)
    if (account.channelType === 'telegram') {
      // For Telegram, the bot token is stored in accessToken (encrypted)
      if (!account.accessToken) {
        console.error('[IsolatedAgent] No bot token found for Telegram channel');
        return undefined;
      }
      const botToken = decrypt(account.accessToken);

      const resolvedChat = await resolveTelegramChatIdFromAccount(account.id, to);
      const chatId = resolvedChat.chatId;
      const chatIdSource = resolvedChat.source;

      console.log(`[IsolatedAgent] Delivery: chat_id=${chatId}, source=${chatIdSource}`);

      if (!chatId) {
        console.error(
          '[IsolatedAgent] No valid Telegram chat ID found. The bot needs at least one message from a user to know where to send scheduled messages.'
        );
        return undefined;
      }

      // Verify bot token is valid first
      const tokenPrefix = botToken.substring(0, 10);
      console.log(
        `[IsolatedAgent] Sending to Telegram chat ${chatId} with bot token starting with: ${tokenPrefix}...`
      );

      // Split long messages into Telegram-safe chunks (max 4096 chars)
      const chunks = splitTelegramMessage(content);
      let sentMessageId: string | undefined;

      for (const chunk of chunks) {
        const chunkResult = await sendTelegramChunk(botToken, chatId, chunk);
        if (!chunkResult) {
          return undefined;
        }
        sentMessageId = chunkResult;
      }

      // Persist outbound message to channelMessages
      try {
        await db.insert(channelMessages).values({
          channelAccountId: account.id,
          externalMessageId: sentMessageId || `scheduled-${Date.now()}`,
          direction: 'outbound',
          content,
          contentType: 'text',
          status: 'sent',
        });
      } catch (persistError) {
        console.warn('[IsolatedAgent] Failed to persist outbound message:', persistError);
      }

      console.log(`[IsolatedAgent] Delivered message to telegram:${chatId}`);
      return `telegram:${chatId}`;
    }

    // For other channel types, try the ChannelManager (fallback)
    try {
      const channelManager = getChannelManager();
      await channelManager.sendMessage(userId, account.channelType, account.channelId, content, {
        threadId: to,
      });

      console.log(
        `[IsolatedAgent] Delivered message to ${account.channelType}:${to || account.channelId}`
      );
      return `${account.channelType}:${to || account.channelId}`;
    } catch (managerError) {
      console.error(
        `[IsolatedAgent] ChannelManager delivery failed for ${account.channelType}:`,
        managerError
      );
      return undefined;
    }
  } catch (error) {
    console.error('[IsolatedAgent] Failed to deliver message:', error);
    return undefined;
  }
}

/**
 * Notify task failure via Telegram
 */
async function notifyTaskFailure(
  userId: string,
  channelAccountId: string,
  taskName: string,
  taskResult: { attempts: number; failureReason?: string; output?: string }
): Promise<boolean> {
  try {
    // Get channel account to find Telegram bot token
    const [account] = await db
      .select()
      .from(channelAccounts)
      .where(eq(channelAccounts.id, channelAccountId))
      .limit(1);

    if (!account || account.channelType !== 'telegram' || !account.accessToken) {
      // Try to find any active Telegram account for this user
      const [telegramAccount] = await db
        .select()
        .from(channelAccounts)
        .where(
          and(
            eq(channelAccounts.userId, userId),
            eq(channelAccounts.channelType, 'telegram'),
            eq(channelAccounts.isActive, true)
          )
        )
        .limit(1);

      if (!telegramAccount?.accessToken) {
        console.log('[IsolatedAgent] No Telegram account found for failure notification');
        return false;
      }

      // Use the found Telegram account
      const botToken = decrypt(telegramAccount.accessToken);
      const chatId = await findTelegramChatId(telegramAccount.id);

      if (chatId) {
        const message = buildFailureMessage(
          taskName,
          taskResult.attempts,
          taskResult.failureReason || 'Unknown error',
          taskResult.output
        );
        await sendTelegramNotification(botToken, chatId, message);
        console.log(
          `[IsolatedAgent] Failure notification sent via fallback Telegram account to chat_id=${chatId}`
        );
        return true;
      }
      return false;
    }

    // Use the original channel account
    const botToken = decrypt(account.accessToken);
    const chatId = await findTelegramChatId(account.id);

    if (chatId) {
      const message = buildFailureMessage(
        taskName,
        taskResult.attempts,
        taskResult.failureReason || 'Unknown error',
        taskResult.output
      );
      await sendTelegramNotification(botToken, chatId, message);
      console.log(`[IsolatedAgent] Failure notification sent to Telegram chat_id=${chatId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[IsolatedAgent] Failed to send failure notification:', error);
    return false;
  }
}

/**
 * Find Telegram chat ID from recent messages or config
 */
async function findTelegramChatId(channelAccountId: string): Promise<string | undefined> {
  const resolved = await resolveTelegramChatIdFromAccount(channelAccountId);
  return resolved.chatId;
}

/**
 * Detect provider from model ID
 */
function detectProvider(modelId: string): string {
  if (modelId.includes('claude')) return 'anthropic';
  if (modelId.includes('gpt') || modelId.includes('o1') || modelId.includes('o3')) return 'openai';
  if (modelId.includes('gemini')) return 'google';
  if (modelId.includes('grok')) return 'xai';
  if (modelId.startsWith('ollama/')) return 'ollama';
  if (modelId.startsWith('lmstudio/')) return 'lmstudio';
  if (modelId.includes('/')) return 'openrouter';
  return 'openrouter';
}

// ============================================================================
// Telegram Message Helpers
// ============================================================================

const TELEGRAM_MAX_LENGTH = 4096;

/**
 * Split a message into chunks that fit Telegram's 4096-char limit.
 * Splits at paragraph boundaries first, then sentence boundaries, then hard-cuts.
 */
function splitTelegramMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a paragraph boundary
    let splitAt = remaining.lastIndexOf('\n\n', TELEGRAM_MAX_LENGTH);
    // Fall back to single newline
    if (splitAt < TELEGRAM_MAX_LENGTH / 2) {
      splitAt = remaining.lastIndexOf('\n', TELEGRAM_MAX_LENGTH);
    }
    // Fall back to space
    if (splitAt < TELEGRAM_MAX_LENGTH / 2) {
      splitAt = remaining.lastIndexOf(' ', TELEGRAM_MAX_LENGTH);
    }
    // Hard cut as last resort
    if (splitAt < TELEGRAM_MAX_LENGTH / 2) {
      splitAt = TELEGRAM_MAX_LENGTH;
    }

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }

  return chunks;
}

/**
 * Send a single text chunk to Telegram, retrying without parse_mode on HTML errors.
 * Returns the message_id on success, undefined on failure.
 */
async function sendTelegramChunk(
  botToken: string,
  chatId: string,
  text: string
): Promise<string | undefined> {
  // Try with no parse_mode first (safest — avoids HTML entity errors)
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const data = await response.json();

  if (response.ok) {
    return data.result?.message_id?.toString();
  }

  console.error('[IsolatedAgent] Telegram API error:', data);
  return undefined;
}
