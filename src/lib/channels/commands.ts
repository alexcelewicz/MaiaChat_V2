/**
 * Channel Slash Commands
 *
 * Provides slash command support for channels (Telegram, Discord, etc.)
 * allowing users to configure their channel settings without web UI.
 *
 * Supported commands:
 * /help - Show available commands
 * /model <model-id> - Set the AI model
 * /models - List available models
 * /agent <agent-id> - Set the active agent
 * /agents - List available agents
 * /rag <on|off> - Enable/disable RAG
 * /gemini <on|off> - Enable/disable Gemini file search
 * /temp <0-2> - Set temperature
 * /status - Show current configuration
 * /reset - Reset to defaults
 * /newchat - Clear conversation history and start fresh
 *
 * Autonomous Mode:
 * /auto <prompt> - Start a long-running AI task
 * /steer <message> - Redirect the running task
 * /abort - Cancel the running task
 */

import { db } from '@/lib/db';
import { agents, documents, channelAccounts, conversations, messages } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import type { ChannelConfig } from '@/lib/db/schema';
import { getUserApiKeys } from '@/lib/ai/get-user-keys';
import {
  startChannelAutonomousTask,
  getActiveTaskForChannel,
  steerTask,
  abortTask,
} from '@/lib/autonomous/channel-loop';
import type { ChannelMessage } from './base';
import { claudeRemoteControl, type SessionInfo } from '@/lib/services/claude-remote-control';

// ============================================================================
// Types
// ============================================================================

export interface CommandResult {
  isCommand: boolean;
  handled: boolean;
  response?: string;
  configUpdate?: Partial<ChannelConfig>;
}

export interface CommandContext {
  userId: string;
  channelAccountId: string;
  currentConfig: ChannelConfig;
}

// ============================================================================
// Command Parsing
// ============================================================================

/**
 * Parse and execute a channel command
 */
export async function parseCommand(
  content: string,
  context: CommandContext,
  originalMessage?: ChannelMessage
): Promise<CommandResult> {
  const trimmed = content.trim();

  // Check if it's a command (starts with /)
  if (!trimmed.startsWith('/')) {
    return { isCommand: false, handled: false };
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Route to handler
  switch (command) {
    case 'help':
    case 'h':
    case '?':
      return handleHelp();

    case 'model':
    case 'm':
      return handleModel(args, context);

    case 'models':
      return handleModels(context);

    case 'agent':
    case 'a':
      return handleAgent(args, context);

    case 'agents':
      return handleAgents(context);

    case 'rag':
    case 'r':
      return handleRAG(args, context);

    case 'ragdocs':
    case 'docs':
      return handleRAGDocs(args, context);

    case 'gemini':
    case 'g':
      return handleGemini(args, context);

    case 'temp':
    case 't':
      return handleTemperature(args);

    case 'status':
    case 's':
      return handleStatus(context);

    case 'reset':
      return handleReset();

    case 'multiagent':
    case 'ma':
      return handleMultiAgent(args, context);

    case 'tools':
      return handleTools(args, context);

    case 'memory':
      return handleMemory(args, context);

    case 'vision':
      return handleVision(args);

    case 'tts':
      return handleTTS(args);

    case 'newchat':
    case 'new':
    case 'clear':
      return await handleNewChat(context);

    case 'context':
      return handleContext(args);

    case 'maxtokens':
    case 'tokens':
      return handleMaxTokens(args);

    case 'start':
      return handleStart();

    // Autonomous mode commands
    case 'auto':
      return await handleAutoCommand(args, context, originalMessage);

    case 'steer':
      return handleSteerCommand(args, context);

    case 'abort':
      return handleAbortCommand(context);

    // Claude Code Remote Control
    case 'claude':
      return await handleClaudeCommand(args, context);

    default:
      return {
        isCommand: true,
        handled: true,
        response: `Unknown command: /${command}\nType /help for available commands.`,
      };
  }
}

// ============================================================================
// Command Handlers
// ============================================================================

function handleStart(): CommandResult {
  const startText = `
**Welcome to MAIAChat!**

I'm your AI assistant. Here are some quick tips:

**Getting Started:**
• Just type a message to start chatting
• Use /help to see all available commands
• Use /status to see current settings

**Key Commands:**
• /model <id> - Switch AI model (e.g., /model gpt-4o)
• /tools on - Enable tools (web search, file access, etc.)
• /newchat - Clear conversation history and start fresh
• /help - See all commands

**Important:** Deleting messages in Telegram only removes them from your phone — the AI remembers the conversation on the server. Use /newchat to clear the AI's memory and start a fresh conversation.
`.trim();

  return {
    isCommand: true,
    handled: true,
    response: startText,
  };
}

function handleHelp(): CommandResult {
  const helpText = `
**Available Commands:**

**Model Selection:**
• \`/model <id>\` - Set the AI model (e.g., \`/model gpt-4o\`)
• \`/models\` - List available models

**Agent Selection:**
• \`/agent <id>\` - Set active agent (e.g., \`/agent abc123\`)
• \`/agents\` - List your agents
• \`/multiagent <on|off> [mode]\` - Multi-agent mode (sequential/parallel/consensus)

**RAG (Documents):**
• \`/rag <on|off>\` - Enable/disable document search
• \`/ragdocs [id1,id2,...]\` - Set specific documents (empty for all)
• \`/gemini <on|off>\` - Enable/disable Gemini file search

**Configuration:**
• \`/temp <0-2>\` - Set temperature (default: 0.7)
• \`/tools <on|off>\` - Enable/disable tool execution
• \`/memory <on|off>\` - Enable/disable memory auto-save
• \`/vision <on|off>\` - Enable/disable image processing
• \`/tts <on|off>\` - Enable/disable voice responses
• \`/context <1-50>\` - Set how many past messages to include (default: 20)
• \`/maxtokens <256-128000>\` - Set max output tokens (default: 4096)

**Status:**
• \`/status\` - Show current configuration
• \`/reset\` - Reset to defaults

**Conversation:**
• \`/newchat\` - Clear conversation history and start fresh

**Autonomous Mode:**
• \`/auto <prompt>\` - Start a long-running AI task
• \`/steer <message>\` - Redirect the running task
• \`/abort\` - Cancel the running task

**Claude Code Remote Control:**
• \`/claude start [path]\` - Start a Remote Control session
• \`/claude stop\` - Stop the active session
• \`/claude status\` - Show session URL and status
`.trim();

  return {
    isCommand: true,
    handled: true,
    response: helpText,
  };
}

async function handleModel(args: string[], context: CommandContext): Promise<CommandResult> {
  if (args.length === 0) {
    const current = context.currentConfig.model || 'Not set (using provider default)';
    const provider = context.currentConfig.provider || 'auto';
    return {
      isCommand: true,
      handled: true,
      response: `Current model: ${current}\nProvider: ${provider}\nUse \`/model <provider>/<model-id>\` to change.\nType \`/models\` to see available models.`,
    };
  }

  const modelId = args.join(' ').trim();

  // Determine provider from model ID format
  // Supports: provider/model, ollama/model, lmstudio/model, or just model-name
  let provider: string | undefined;
  let finalModelId = modelId;

  if (modelId.startsWith('ollama/')) {
    provider = 'ollama';
  } else if (modelId.startsWith('lmstudio/')) {
    provider = 'lmstudio';
  } else if (modelId.includes('/')) {
    // Format: provider/model or openrouter format (org/model)
    const parts = modelId.split('/');
    const possibleProvider = parts[0].toLowerCase();
    if (['anthropic', 'openai', 'google', 'xai', 'openrouter'].includes(possibleProvider)) {
      provider = possibleProvider;
      finalModelId = parts.slice(1).join('/');
    } else {
      // Assume OpenRouter format (e.g., "anthropic/claude-3.5-sonnet")
      provider = 'openrouter';
    }
  }
  // If no slash, let the system auto-detect provider based on model name

  return {
    isCommand: true,
    handled: true,
    response: `Model set to: ${finalModelId}${provider ? `\nProvider: ${provider}` : '\nProvider will be auto-detected'}`,
    configUpdate: {
      model: finalModelId,
      provider: provider,
    },
  };
}

async function handleModels(context: CommandContext): Promise<CommandResult> {
  // Get user's API keys to show only available providers
  const apiKeys = await getUserApiKeys(context.userId);

  const availableProviders: { id: string; name: string }[] = [];
  if (apiKeys.anthropic) availableProviders.push({ id: 'anthropic', name: 'Anthropic' });
  if (apiKeys.openai) availableProviders.push({ id: 'openai', name: 'OpenAI' });
  if (apiKeys.google) availableProviders.push({ id: 'google', name: 'Google' });
  if (apiKeys.xai) availableProviders.push({ id: 'xai', name: 'xAI' });
  if (apiKeys.openrouter) availableProviders.push({ id: 'openrouter', name: 'OpenRouter' });

  // Always show local model options
  availableProviders.push({ id: 'ollama', name: 'Ollama (Local)' });
  availableProviders.push({ id: 'lmstudio', name: 'LM Studio (Local)' });

  // Build provider list - models are dynamic and fetched from providers
  let modelList = '**Available Providers:**\n\n';

  for (const provider of availableProviders) {
    const isConfigured = ['anthropic', 'openai', 'google', 'xai', 'openrouter'].includes(
      provider.id
    )
      ? '✓'
      : '(local)';
    modelList += `• **${provider.name}** ${isConfigured}\n`;
  }

  modelList += '\n**Usage Examples:**\n';
  modelList += '• `/model anthropic/claude-sonnet-4` - Use specific model\n';
  modelList += '• `/model openai/gpt-4o` - OpenAI model\n';
  modelList += '• `/model google/gemini-2.0-flash` - Google model\n';
  modelList += '• `/model ollama/llama3` - Local Ollama model\n';
  modelList += '• `/model openrouter/meta-llama/llama-3.1-70b` - OpenRouter\n';
  modelList +=
    '\n_Note: Model names are fetched dynamically from providers. Check provider documentation for latest model IDs._';

  return {
    isCommand: true,
    handled: true,
    response: modelList,
  };
}

async function handleAgent(args: string[], context: CommandContext): Promise<CommandResult> {
  if (args.length === 0) {
    const current = context.currentConfig.agentId || 'None (using default assistant)';
    return {
      isCommand: true,
      handled: true,
      response: `Current agent: ${current}\nUse \`/agent <id>\` to change.\nType \`/agents\` to see your agents.`,
    };
  }

  const agentId = args[0].trim();

  // Verify agent exists and belongs to user
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, context.userId)))
    .limit(1);

  if (!agent) {
    return {
      isCommand: true,
      handled: true,
      response: `Agent not found: ${agentId}\nType \`/agents\` to see your available agents.`,
    };
  }

  return {
    isCommand: true,
    handled: true,
    response: `Agent set to: ${agent.name}\nRole: ${agent.role}\nModel: ${agent.modelId}`,
    configUpdate: {
      agentId: agentId,
      multiAgentEnabled: false,
    },
  };
}

async function handleAgents(context: CommandContext): Promise<CommandResult> {
  // Get user's agents (templates)
  const userAgents = await db
    .select()
    .from(agents)
    .where(and(eq(agents.userId, context.userId), eq(agents.isTemplate, true)));

  if (userAgents.length === 0) {
    return {
      isCommand: true,
      handled: true,
      response: 'You have no saved agents. Create agents in the web UI.',
    };
  }

  let agentList = '**Your Agents:**\n\n';
  for (const agent of userAgents) {
    agentList += `• \`${agent.id.slice(0, 8)}\` - **${agent.name}** (${agent.role})\n`;
  }

  agentList += '\n**Usage:** `/agent <id>` (first 8 chars of ID)';

  return {
    isCommand: true,
    handled: true,
    response: agentList,
  };
}

async function handleRAG(args: string[], context: CommandContext): Promise<CommandResult> {
  if (args.length === 0) {
    const enabled = context.currentConfig.ragEnabled ?? false;
    return {
      isCommand: true,
      handled: true,
      response: `RAG is currently: ${enabled ? 'ON' : 'OFF'}\nUse \`/rag on\` or \`/rag off\` to change.`,
    };
  }

  const value = args[0].toLowerCase();
  if (value !== 'on' && value !== 'off') {
    return {
      isCommand: true,
      handled: true,
      response: 'Invalid value. Use `/rag on` or `/rag off`.',
    };
  }

  const enabled = value === 'on';

  // Check if user has documents
  if (enabled) {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.userId, context.userId), isNull(documents.deletedAt)))
      .limit(1);

    if (!doc) {
      return {
        isCommand: true,
        handled: true,
        response: 'RAG enabled, but you have no documents. Upload documents in the web UI.',
        configUpdate: { ragEnabled: true },
      };
    }
  }

  return {
    isCommand: true,
    handled: true,
    response: `RAG ${enabled ? 'enabled' : 'disabled'}. Your documents will ${enabled ? 'be' : 'not be'} searched for relevant context.`,
    configUpdate: { ragEnabled: enabled },
  };
}

async function handleRAGDocs(args: string[], context: CommandContext): Promise<CommandResult> {
  if (args.length === 0 || args[0] === 'all') {
    return {
      isCommand: true,
      handled: true,
      response: 'RAG will search ALL your documents.',
      configUpdate: { ragDocumentIds: [] },
    };
  }

  const docIds = args[0].split(',').map((id) => id.trim());

  // Verify documents exist
  const userDocs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, context.userId), isNull(documents.deletedAt)));

  const validIds = docIds.filter((id) =>
    userDocs.some((doc) => doc.id === id || doc.id.startsWith(id))
  );

  if (validIds.length === 0) {
    return {
      isCommand: true,
      handled: true,
      response: 'No valid document IDs found. Use `/ragdocs all` to search all documents.',
    };
  }

  return {
    isCommand: true,
    handled: true,
    response: `RAG will search ${validIds.length} document(s).`,
    configUpdate: { ragDocumentIds: validIds, ragEnabled: true },
  };
}

async function handleGemini(args: string[], context: CommandContext): Promise<CommandResult> {
  if (args.length === 0) {
    const enabled = context.currentConfig.geminiFileSearchEnabled ?? false;
    return {
      isCommand: true,
      handled: true,
      response: `Gemini file search is currently: ${enabled ? 'ON' : 'OFF'}\nUse \`/gemini on\` or \`/gemini off\` to change.`,
    };
  }

  const value = args[0].toLowerCase();
  if (value !== 'on' && value !== 'off') {
    return {
      isCommand: true,
      handled: true,
      response: 'Invalid value. Use `/gemini on` or `/gemini off`.',
    };
  }

  const enabled = value === 'on';

  if (enabled) {
    const userDocs = await db
      .select({ metadata: documents.metadata })
      .from(documents)
      .where(and(eq(documents.userId, context.userId), isNull(documents.deletedAt)));

    const hasGeminiFile = userDocs.some((doc) => {
      const metadata = doc.metadata as Record<string, unknown> | null;
      return Boolean(metadata?.geminiFile);
    });

    if (!hasGeminiFile) {
      return {
        isCommand: true,
        handled: true,
        response:
          'Gemini file search enabled, but no Gemini files were found. Upload documents to Gemini in the web UI first.',
        configUpdate: { geminiFileSearchEnabled: true },
      };
    }
  }

  return {
    isCommand: true,
    handled: true,
    response: `Gemini file search ${enabled ? 'enabled' : 'disabled'}.`,
    configUpdate: { geminiFileSearchEnabled: enabled },
  };
}

function handleTemperature(args: string[]): CommandResult {
  if (args.length === 0) {
    return {
      isCommand: true,
      handled: true,
      response: 'Usage: `/temp <0-2>` (e.g., `/temp 0.7`)',
    };
  }

  const temp = parseFloat(args[0]);
  if (isNaN(temp) || temp < 0 || temp > 2) {
    return {
      isCommand: true,
      handled: true,
      response: 'Temperature must be between 0 and 2.',
    };
  }

  return {
    isCommand: true,
    handled: true,
    response: `Temperature set to ${temp}`,
    configUpdate: { temperature: temp },
  };
}

function handleContext(args: string[]): CommandResult {
  if (args.length === 0) {
    return {
      isCommand: true,
      handled: true,
      response:
        'Usage: `/context <1-50>` — Set how many past messages to include.\n\nLower values save tokens and cost less. Higher values give the AI more conversation memory.\nDefault: 20. Use `/context 5` for minimal context or `/context 50` for maximum memory.',
    };
  }

  const count = parseInt(args[0], 10);
  if (isNaN(count) || count < 1 || count > 50) {
    return {
      isCommand: true,
      handled: true,
      response: 'Context messages must be between 1 and 50.',
    };
  }

  return {
    isCommand: true,
    handled: true,
    response: `Context set to ${count} messages. The AI will remember the last ${count} messages from this conversation.`,
    configUpdate: { contextMessages: count },
  };
}

function handleMaxTokens(args: string[]): CommandResult {
  if (args.length === 0) {
    return {
      isCommand: true,
      handled: true,
      response:
        'Usage: `/maxtokens <256-128000>` — Set max output tokens per response.\n\nLower values save credits. Default: 4096 (from global config).\nExample: `/maxtokens 2048` for short replies, `/maxtokens 8192` for longer outputs.',
    };
  }

  const value = parseInt(args[0], 10);
  if (isNaN(value) || value < 256 || value > 128000) {
    return {
      isCommand: true,
      handled: true,
      response: 'Max tokens must be between 256 and 128000.',
    };
  }

  return {
    isCommand: true,
    handled: true,
    response: `Max output tokens set to ${value}. The AI will generate at most ${value} tokens per response.`,
    configUpdate: { maxTokens: value },
  };
}

function handleStatus(context: CommandContext): CommandResult {
  const config = context.currentConfig;

  const status = `
**Current Configuration:**

**Model:** ${config.model || 'Default'}
**Provider:** ${config.provider || 'Auto'}
**Temperature:** ${config.temperature ?? 0.7}

**Agent:** ${config.agentId || 'None (default assistant)'}
**Multi-Agent:** ${config.multiAgentEnabled ? `ON (${config.multiAgentMode || 'sequential'})` : 'OFF'}

**RAG:** ${config.ragEnabled ? 'ON' : 'OFF'}
**RAG Docs:** ${config.ragDocumentIds?.length ? `${config.ragDocumentIds.length} selected` : 'All'}

**Gemini File Search:** ${config.geminiFileSearchEnabled ? 'ON' : 'OFF'}

**Tools:** ${config.toolsEnabled ? 'ON' : 'OFF'}
**Skills:** ${config.skillsEnabled ? 'ON' : 'OFF'}
**Memory:** ${config.memoryEnabled ? 'ON' : 'OFF'}
**Vision:** ${config.visionEnabled ? 'ON' : 'OFF'}
**TTS:** ${config.ttsEnabled ? 'ON' : 'OFF'}
**Context:** ${config.contextMessages ?? 20} messages
**Max Tokens:** ${config.maxTokens ?? 'Default (4096)'}
`.trim();

  return {
    isCommand: true,
    handled: true,
    response: status,
  };
}

function handleReset(): CommandResult {
  return {
    isCommand: true,
    handled: true,
    response: 'Configuration reset to defaults.',
    configUpdate: {
      model: undefined,
      provider: undefined,
      temperature: undefined,
      agentId: undefined,
      multiAgentEnabled: false,
      multiAgentMode: undefined,
      multiAgentIds: undefined,
      ragEnabled: false,
      ragDocumentIds: undefined,
      toolsEnabled: undefined,
      visionEnabled: undefined,
      ttsEnabled: undefined,
      skillsEnabled: undefined,
      enabledSkills: undefined,
      geminiFileSearchEnabled: false,
      geminiFileIds: undefined,
      contextMessages: undefined,
      maxTokens: undefined,
    },
  };
}

/**
 * Handle /newchat command - Clear conversation history and start fresh
 */
async function handleNewChat(context: CommandContext): Promise<CommandResult> {
  try {
    // Get channel account to find threadKey pattern
    const [account] = await db
      .select()
      .from(channelAccounts)
      .where(eq(channelAccounts.id, context.channelAccountId));

    if (!account) {
      return {
        isCommand: true,
        handled: true,
        response: '❌ Channel account not found.',
      };
    }

    // Find conversations with this channel's threadKey pattern
    const channelType = account.channelType;
    const channelId = account.channelId;

    // Find all conversations for this channel
    const channelConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, context.userId));

    let clearedCount = 0;
    for (const conv of channelConversations) {
      const metadata = conv.metadata as {
        channelThreadKey?: string;
        channelType?: string;
        channelId?: string;
      } | null;

      // Match by channel type and ID
      if (metadata?.channelType === channelType && metadata?.channelId === channelId) {
        // Delete all messages in this conversation
        await db.delete(messages).where(eq(messages.conversationId, conv.id));

        // Update conversation title to indicate reset
        await db
          .update(conversations)
          .set({
            title: `${channelType.charAt(0).toUpperCase() + channelType.slice(1)} - Fresh Start`,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, conv.id));

        clearedCount++;
      }
    }

    if (clearedCount === 0) {
      return {
        isCommand: true,
        handled: true,
        response: "✅ No conversation history to clear. You're starting fresh!",
      };
    }

    return {
      isCommand: true,
      handled: true,
      response: `✅ **Conversation cleared!**\n\nCleared ${clearedCount} conversation(s). The AI no longer remembers previous messages. You're starting fresh!`,
    };
  } catch (error) {
    console.error('[Commands] Error clearing conversation:', error);
    return {
      isCommand: true,
      handled: true,
      response: '❌ Failed to clear conversation. Please try again.',
    };
  }
}

async function handleMultiAgent(args: string[], context: CommandContext): Promise<CommandResult> {
  // Show current status
  if (args.length === 0) {
    const enabled = context.currentConfig.multiAgentEnabled ?? false;
    const mode = context.currentConfig.multiAgentMode || 'sequential';
    const agentIds = context.currentConfig.multiAgentIds || [];

    let response = `**Multi-Agent Status**\n`;
    response += `• Enabled: ${enabled ? 'Yes' : 'No'}\n`;
    response += `• Mode: ${mode}\n`;
    response += `• Agents: ${agentIds.length > 0 ? agentIds.length + ' configured' : 'None'}\n\n`;
    response += `**Commands:**\n`;
    response += `• \`/multiagent on [mode]\` - Enable (modes: sequential, parallel, consensus)\n`;
    response += `• \`/multiagent off\` - Disable\n`;
    response += `• \`/multiagent set <agent1> <agent2> ...\` - Set agents by name\n`;
    response += `• \`/multiagent rounds <n>\` - Set max rounds for consensus (1-10)`;

    return {
      isCommand: true,
      handled: true,
      response,
    };
  }

  const command = args[0].toLowerCase();

  // Disable multi-agent
  if (command === 'off') {
    return {
      isCommand: true,
      handled: true,
      response: 'Multi-agent mode disabled.',
      configUpdate: { multiAgentEnabled: false },
    };
  }

  // Set agents by name
  if (command === 'set') {
    const agentNames = args.slice(1);
    if (agentNames.length === 0) {
      return {
        isCommand: true,
        handled: true,
        response:
          'Usage: `/multiagent set <agent1> <agent2> ...`\nProvide agent names separated by spaces.',
      };
    }

    // Look up agents by name
    const userAgents = await db.select().from(agents).where(eq(agents.userId, context.userId));

    const matchedAgents: string[] = [];
    const notFound: string[] = [];

    for (const name of agentNames) {
      const agent = userAgents.find((a) => a.name.toLowerCase() === name.toLowerCase());
      if (agent) {
        matchedAgents.push(agent.id);
      } else {
        notFound.push(name);
      }
    }

    if (matchedAgents.length === 0) {
      return {
        isCommand: true,
        handled: true,
        response: `No matching agents found. Use \`/agents\` to see your available agents.`,
      };
    }

    let response = `Multi-agent configured with ${matchedAgents.length} agent(s).`;
    if (notFound.length > 0) {
      response += `\nNot found: ${notFound.join(', ')}`;
    }

    return {
      isCommand: true,
      handled: true,
      response,
      configUpdate: {
        multiAgentEnabled: true,
        multiAgentIds: matchedAgents,
      },
    };
  }

  // Set max rounds
  if (command === 'rounds') {
    const rounds = parseInt(args[1], 10);
    if (isNaN(rounds) || rounds < 1 || rounds > 10) {
      return {
        isCommand: true,
        handled: true,
        response: 'Invalid rounds. Use a number between 1 and 10.',
      };
    }

    return {
      isCommand: true,
      handled: true,
      response: `Max rounds set to ${rounds} for consensus mode.`,
      configUpdate: { multiAgentMaxRounds: rounds },
    };
  }

  // Enable multi-agent with mode
  if (command !== 'on') {
    return {
      isCommand: true,
      handled: true,
      response: 'Invalid command. Use `/multiagent` to see available options.',
    };
  }

  // Parse mode
  const mode = (args[1]?.toLowerCase() || 'sequential') as 'sequential' | 'parallel' | 'consensus';
  if (!['sequential', 'parallel', 'consensus'].includes(mode)) {
    return {
      isCommand: true,
      handled: true,
      response: 'Invalid mode. Use: sequential, parallel, or consensus.',
    };
  }

  // Check if agents are configured
  const hasAgents = (context.currentConfig.multiAgentIds?.length || 0) > 0;
  let response = `Multi-agent mode enabled: ${mode}`;
  if (!hasAgents) {
    response += `\n\n⚠️ No agents configured yet. Use \`/multiagent set <agent1> <agent2>\` to add agents.`;
  }

  return {
    isCommand: true,
    handled: true,
    response,
    configUpdate: {
      multiAgentEnabled: true,
      multiAgentMode: mode,
    },
  };
}

async function handleTools(args: string[], context: CommandContext): Promise<CommandResult> {
  if (args.length === 0) {
    const enabled = context.currentConfig.toolsEnabled ?? false;
    return {
      isCommand: true,
      handled: true,
      response: `Tools are currently: ${enabled ? 'ON' : 'OFF'}\nUse \`/tools on\` or \`/tools off\` to change.`,
    };
  }

  const value = args[0].toLowerCase();
  if (value !== 'on' && value !== 'off') {
    return {
      isCommand: true,
      handled: true,
      response: 'Invalid value. Use `/tools on` or `/tools off`.',
    };
  }

  return {
    isCommand: true,
    handled: true,
    response: `Tools ${value === 'on' ? 'enabled (all tools including file access if admin allows)' : 'disabled'}.`,
    configUpdate: {
      toolsEnabled: value === 'on',
      // Clear enabledTools to get ALL tools (file tools controlled by admin settings)
      ...(value === 'on' ? { enabledTools: [] } : {}),
    },
  };
}

function handleMemory(args: string[], context: CommandContext): CommandResult {
  if (args.length === 0) {
    const enabled = context.currentConfig.memoryEnabled ?? false;
    return {
      isCommand: true,
      handled: true,
      response: `Memory auto-save is currently: ${enabled ? 'ON' : 'OFF'}\nUse \`/memory on\` or \`/memory off\` to change.\n\nWhen enabled, conversations are automatically saved to your Gemini memory store (requires a Google API key in Settings).`,
    };
  }

  const value = args[0].toLowerCase();
  if (value !== 'on' && value !== 'off') {
    return {
      isCommand: true,
      handled: true,
      response: 'Invalid value. Use `/memory on` or `/memory off`.',
    };
  }

  return {
    isCommand: true,
    handled: true,
    response: `Memory auto-save ${value === 'on' ? 'enabled' : 'disabled'}.`,
    configUpdate: { memoryEnabled: value === 'on' },
  };
}

function handleVision(args: string[]): CommandResult {
  if (args.length === 0) {
    return {
      isCommand: true,
      handled: true,
      response: 'Use `/vision on` or `/vision off` to enable/disable image processing.',
    };
  }

  const value = args[0].toLowerCase();
  if (value !== 'on' && value !== 'off') {
    return {
      isCommand: true,
      handled: true,
      response: 'Invalid value. Use `/vision on` or `/vision off`.',
    };
  }

  return {
    isCommand: true,
    handled: true,
    response: `Vision ${value === 'on' ? 'enabled' : 'disabled'}. Images will ${value === 'on' ? 'be' : 'not be'} processed.`,
    configUpdate: { visionEnabled: value === 'on' },
  };
}

function handleTTS(args: string[]): CommandResult {
  if (args.length === 0) {
    return {
      isCommand: true,
      handled: true,
      response: 'Use `/tts on` or `/tts off` to enable/disable voice responses.',
    };
  }

  const value = args[0].toLowerCase();
  if (value !== 'on' && value !== 'off') {
    return {
      isCommand: true,
      handled: true,
      response: 'Invalid value. Use `/tts on` or `/tts off`.',
    };
  }

  return {
    isCommand: true,
    handled: true,
    response: `TTS ${value === 'on' ? 'enabled' : 'disabled'}. Responses will ${value === 'on' ? 'be' : 'not be'} spoken.`,
    configUpdate: { ttsEnabled: value === 'on' },
  };
}

// ============================================================================
// Claude Code Remote Control Command Handlers
// ============================================================================

/**
 * Handle /claude sub-commands (start, stop, status)
 */
async function handleClaudeCommand(
  args: string[],
  context: CommandContext
): Promise<CommandResult> {
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand || subCommand === 'help') {
    return {
      isCommand: true,
      handled: true,
      response: `**Claude Code Remote Control**

Start a Remote Control session and continue it on your phone via claude.ai/code.

**Commands:**
• \`/claude start [path]\` - Start a session (path defaults to server cwd)
• \`/claude stop\` - Stop the active session
• \`/claude status\` - Show session URL and status

_Requires Claude Code CLI installed and authenticated on the server._`,
    };
  }

  switch (subCommand) {
    case 'start':
      return await handleClaudeStart(args.slice(1), context);
    case 'stop':
      return await handleClaudeStop(context);
    case 'status':
      return handleClaudeStatus(context);
    default:
      return {
        isCommand: true,
        handled: true,
        response: `Unknown sub-command: ${subCommand}\nUse \`/claude\` to see available commands.`,
      };
  }
}

async function handleClaudeStart(args: string[], context: CommandContext): Promise<CommandResult> {
  const cwdArg = args.join(' ').trim() || undefined;

  try {
    const info: SessionInfo = await claudeRemoteControl.startSession(context.userId, {
      cwd: cwdArg,
    });

    return {
      isCommand: true,
      handled: true,
      response: `**Session ready!**

Open on your phone: ${info.sessionUrl}

Working directory: \`${info.cwd}\`
PID: ${info.pid ?? 'unknown'}

**Commands:**
• \`/claude status\` - Check session
• \`/claude stop\` - End session`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      isCommand: true,
      handled: true,
      response: `Failed to start Remote Control session:\n${msg}`,
    };
  }
}

async function handleClaudeStop(context: CommandContext): Promise<CommandResult> {
  const stopped = await claudeRemoteControl.stopSession(context.userId);

  return {
    isCommand: true,
    handled: true,
    response: stopped ? 'Session stopped.' : 'No active session to stop.',
  };
}

function handleClaudeStatus(context: CommandContext): CommandResult {
  const session = claudeRemoteControl.getSession(context.userId);

  if (!session) {
    return {
      isCommand: true,
      handled: true,
      response: 'No active Remote Control session.\nUse `/claude start` to start one.',
    };
  }

  const elapsed = Date.now() - session.startedAt.getTime();
  const minutes = Math.floor(elapsed / 60_000);
  const durationText =
    minutes < 1 ? 'less than a minute' : `${minutes} minute${minutes !== 1 ? 's' : ''}`;

  return {
    isCommand: true,
    handled: true,
    response: `**Active session** (running for ${durationText})

URL: ${session.sessionUrl}
Working directory: \`${session.cwd}\`
PID: ${session.pid ?? 'unknown'}`,
  };
}

// ============================================================================
// Autonomous Mode Command Handlers
// ============================================================================

/**
 * Handle /auto <prompt> - Start autonomous task
 */
async function handleAutoCommand(
  args: string[],
  context: CommandContext,
  originalMessage?: ChannelMessage
): Promise<CommandResult> {
  if (args.length === 0) {
    return {
      isCommand: true,
      handled: true,
      response: `**Autonomous Mode**

Start a long-running AI task:
\`/auto <your task description>\`

The AI will work continuously, using tools and reasoning until complete.

During execution:
• \`/steer <message>\` - Redirect the task
• \`/abort\` - Cancel the task`,
    };
  }

  const prompt = args.join(' ');
  const config = context.currentConfig;

  // Get channel info from original message if available
  const channelId = originalMessage?.channelId || '';
  const channelThreadId = originalMessage?.threadId;

  if (!channelId) {
    return {
      isCommand: true,
      handled: true,
      response: 'Unable to determine channel ID. Please try again.',
    };
  }

  try {
    const taskKey = await startChannelAutonomousTask({
      userId: context.userId,
      channelAccountId: context.channelAccountId,
      channelId,
      channelThreadId,
      prompt,
      modelId: config.model || 'gpt-4o',
      maxSteps: 25, // Default for channels
      timeoutMs: 300000, // 5 minutes
      config: {
        toolsEnabled: config.toolsEnabled,
        enabledTools: config.enabledTools,
        ragEnabled: config.ragEnabled,
        memoryEnabled: config.memoryEnabled,
        agentId: config.agentId,
        temperature: config.temperature,
      },
    });

    const maxSteps = 25;
    const timeoutMinutes = 5;

    return {
      isCommand: true,
      handled: true,
      response: `**Starting autonomous task** \`${taskKey.slice(0, 8)}...\`

Max steps: ${maxSteps} | Timeout: ${timeoutMinutes} minutes

Reply with:
• \`/steer <message>\` to redirect
• \`/abort\` to cancel`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      isCommand: true,
      handled: true,
      response: `Failed to start autonomous task: ${errorMsg}`,
    };
  }
}

/**
 * Handle /steer <message> - Redirect running task
 */
function handleSteerCommand(args: string[], context: CommandContext): CommandResult {
  if (args.length === 0) {
    return {
      isCommand: true,
      handled: true,
      response:
        'Usage: `/steer <instruction>`\n\nSend a message to redirect the running autonomous task.',
    };
  }

  const message = args.join(' ');

  // Find active task for this channel account
  const taskKey = getActiveTaskForChannel(context.channelAccountId);
  if (!taskKey) {
    return {
      isCommand: true,
      handled: true,
      response: 'No active autonomous task found. Start one with `/auto <prompt>`',
    };
  }

  const success = steerTask(taskKey, message);
  return {
    isCommand: true,
    handled: true,
    response: success
      ? `Steering message sent to task \`${taskKey.slice(0, 8)}...\``
      : 'Failed to steer task - it may have completed',
  };
}

/**
 * Handle /abort - Cancel running task
 */
function handleAbortCommand(context: CommandContext): CommandResult {
  const taskKey = getActiveTaskForChannel(context.channelAccountId);
  if (!taskKey) {
    return {
      isCommand: true,
      handled: true,
      response: 'No active autonomous task to abort.',
    };
  }

  const success = abortTask(taskKey);
  return {
    isCommand: true,
    handled: true,
    response: success
      ? `Aborting task \`${taskKey.slice(0, 8)}...\``
      : 'Failed to abort task - it may have already completed',
  };
}

// ============================================================================
// Config Update Helper
// ============================================================================

/**
 * Apply config updates to database
 */
export async function applyConfigUpdate(
  channelAccountId: string,
  currentConfig: ChannelConfig,
  update: Partial<ChannelConfig>
): Promise<ChannelConfig> {
  // Merge configs
  const newConfig: ChannelConfig = {
    ...currentConfig,
    ...update,
  };

  // Remove undefined values
  for (const key of Object.keys(newConfig) as Array<keyof ChannelConfig>) {
    if (newConfig[key] === undefined) {
      delete newConfig[key];
    }
  }

  // Update database
  await db
    .update(channelAccounts)
    .set({ config: newConfig, updatedAt: new Date() })
    .where(eq(channelAccounts.id, channelAccountId));

  return newConfig;
}
