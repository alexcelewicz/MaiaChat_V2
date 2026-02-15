/**
 * Multi-Agent Orchestration for Channels
 *
 * Provides multi-agent conversation support for channel messages:
 * - Sequential: Agents respond in order, each seeing previous responses
 * - Parallel: All agents respond simultaneously, responses synthesized
 * - Consensus: Multiple rounds of discussion to reach agreement
 */

import { db } from '@/lib/db';
import { agents } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { ChannelMessage } from './base';
import { ChannelConfig } from '@/lib/db/schema';
import { AgentConfig, AgentMessage, AgentRole, AgentTool } from '@/types/agent';
import type { ProviderId } from '@/lib/ai/providers/types';
import { executeAgent } from '@/lib/agents/graph';
import { getUserApiKeys } from '@/lib/ai/get-user-keys';
import type { ToolContext } from '@/lib/tools';
import { getLocalAccessContext } from '@/lib/admin/settings';

// ============================================================================
// Types
// ============================================================================

interface AgentDbRecord {
    id: string;
    name: string;
    role: string;
    modelProvider: string;
    modelId: string;
    systemPrompt: string | null;
    config: Record<string, unknown> | null;
}

interface AgentExtraConfig {
    description?: string;
    temperature?: number;
    maxTokens?: number;
    thinkingBudget?: number;
    tools?: AgentTool[];
    canSeeOtherAgents?: boolean;
    priority?: number;
    metadata?: Record<string, unknown>;
}

type ApiKeysMap = Record<string, string>;

// ============================================================================
// Constants
// ============================================================================

const SYNTHESIZER_PROMPT = `You are a response synthesizer. Multiple AI agents have provided their perspectives on the user's question.

Original question: {USER_INPUT}

Agent responses:
{RESPONSES}

Your task is to:
1. Identify areas of agreement
2. Note any disagreements or different perspectives
3. Synthesize a balanced, comprehensive response that incorporates the best insights from all agents
4. If agents disagree, present multiple viewpoints fairly

Provide a clear, well-structured final response.`;

const DISCUSSION_ROUND_PROMPT = `This is round {ROUND} of a multi-round consensus discussion.

Original question: {USER_INPUT}

Previous round responses from other agents:
{PREVIOUS_RESPONSES}

Based on the other agents' perspectives, please:
1. Consider their viewpoints and any valid points they raised
2. Refine, expand, or defend your position as appropriate
3. Address any disagreements constructively
4. Provide your updated response

Your response should build upon the discussion while maintaining your unique expertise.`;

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Run multi-agent orchestration for a channel message
 */
export async function runMultiAgentForChannel(
    message: ChannelMessage,
    config: ChannelConfig,
    userId: string,
    memoryContext?: string
): Promise<{ response: string; tokensUsed: { input: number; output: number } }> {
    const mode = config.multiAgentMode || 'sequential';
    const agentIds = config.multiAgentIds || [];
    const maxRounds = Math.min(config.multiAgentMaxRounds || 3, 10); // Cap at 10 rounds

    if (agentIds.length === 0) {
        return {
            response: "No agents configured for multi-agent mode. Use `/agents` to see available agents.",
            tokensUsed: { input: 0, output: 0 }
        };
    }

    // Load agents from database
    const dbAgents = await db.select()
        .from(agents)
        .where(inArray(agents.id, agentIds));

    if (dbAgents.length === 0) {
        return {
            response: "None of the configured agents were found. They may have been deleted.",
            tokensUsed: { input: 0, output: 0 }
        };
    }

    // Sort agents to match order in agentIds (preserves user selection order)
    const agentConfigs = convertDbAgentsToConfigs(dbAgents as AgentDbRecord[], agentIds);

    if (agentConfigs.length === 0) {
        return {
            response: "Failed to load agent configurations.",
            tokensUsed: { input: 0, output: 0 }
        };
    }

    const apiKeys = await getUserApiKeys(userId);
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

    // Track tokens
    let totalInput = 0;
    let totalOutput = 0;

    const trackUsage = (msg: AgentMessage) => {
        const metadata = msg.metadata as { inputTokens?: number; outputTokens?: number } | undefined;
        totalInput += metadata?.inputTokens || 0;
        totalOutput += metadata?.outputTokens || 0;
    };

    try {
        let responseText = "";

        switch (mode) {
            case 'sequential':
                responseText = await runSequential(message, agentConfigs, apiKeys, toolContext, trackUsage, memoryContext);
                break;
            case 'parallel':
                responseText = await runParallel(message, agentConfigs, apiKeys, toolContext, trackUsage, memoryContext);
                break;
            case 'consensus':
                responseText = await runConsensus(message, agentConfigs, maxRounds, apiKeys, toolContext, trackUsage, memoryContext);
                break;
            default:
                responseText = `Unknown multi-agent mode: ${mode}. Use sequential, parallel, or consensus.`;
        }

        return {
            response: responseText,
            tokensUsed: { input: totalInput, output: totalOutput }
        };
    } catch (error) {
        console.error('[MultiAgent] Error:', error);
        return {
            response: `Multi-agent processing failed: ${error instanceof Error ? error.message : String(error)}`,
            tokensUsed: { input: totalInput, output: totalOutput }
        };
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert database agent records to AgentConfig objects
 */
function convertDbAgentsToConfigs(
    dbAgents: AgentDbRecord[],
    orderedIds: string[]
): AgentConfig[] {
    return orderedIds
        .map(id => dbAgents.find(a => a.id === id))
        .filter((a): a is AgentDbRecord => a !== undefined)
        .map(a => {
            const extraConfig = (a.config || {}) as AgentExtraConfig;

            return {
                id: a.id,
                name: a.name,
                role: a.role as AgentRole,
                provider: a.modelProvider as ProviderId,
                modelId: a.modelId,
                systemPrompt: a.systemPrompt || undefined,
                description: extraConfig.description || "",
                temperature: extraConfig.temperature ?? 0.7,
                maxTokens: extraConfig.maxTokens,
                thinkingBudget: extraConfig.thinkingBudget,
                tools: extraConfig.tools || [],
                canSeeOtherAgents: extraConfig.canSeeOtherAgents ?? true,
                priority: extraConfig.priority ?? 50,
                isActive: true,
                metadata: extraConfig.metadata,
            };
        });
}

/**
 * Execute an agent with error handling
 */
async function safeExecuteAgent(
    agent: AgentConfig,
    userMessage: string,
    history: AgentMessage[],
    canSeeOthers: boolean,
    apiKeys: ApiKeysMap,
    additionalContext: string | undefined,
    toolContext: ToolContext
): Promise<AgentMessage> {
    try {
        return await executeAgent(
            agent,
            userMessage,
            history,
            canSeeOthers,
            apiKeys,
            additionalContext,
            toolContext
        );
    } catch (error) {
        console.error(`[MultiAgent] Agent ${agent.name} failed:`, error);
        // Return error message as agent response
        return {
            role: 'assistant',
            agentId: agent.id || 'unknown',
            agentName: agent.name,
            content: `[Agent encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}]`,
            timestamp: new Date(),
        };
    }
}

/**
 * Format agent responses for output
 */
function formatResponses(messages: AgentMessage[]): string {
    return messages
        .map(m => `**${m.agentName}:**\n${m.content}`)
        .join("\n\n---\n\n");
}

// ============================================================================
// Orchestration Modes
// ============================================================================

/**
 * Sequential Mode: Agents respond in order, each seeing previous responses
 */
async function runSequential(
    message: ChannelMessage,
    agentConfigs: AgentConfig[],
    apiKeys: ApiKeysMap,
    toolContext: ToolContext,
    trackUsage: (msg: AgentMessage) => void,
    memoryContext?: string
): Promise<string> {
    const messages: AgentMessage[] = [];

    for (const agent of agentConfigs) {
        const response = await safeExecuteAgent(
            agent,
            message.content,
            messages,
            agent.canSeeOtherAgents !== false,
            apiKeys,
            memoryContext,
            toolContext
        );

        trackUsage(response);
        messages.push(response);
    }

    return formatResponses(messages);
}

/**
 * Parallel Mode: All agents respond simultaneously, no shared context
 */
async function runParallel(
    message: ChannelMessage,
    agentConfigs: AgentConfig[],
    apiKeys: ApiKeysMap,
    toolContext: ToolContext,
    trackUsage: (msg: AgentMessage) => void,
    memoryContext?: string
): Promise<string> {
    const responses = await Promise.all(
        agentConfigs.map(agent =>
            safeExecuteAgent(
                agent,
                message.content,
                [],
                false,
                apiKeys,
                memoryContext,
                toolContext
            )
        )
    );

    responses.forEach(trackUsage);

    return formatResponses(responses);
}

/**
 * Consensus Mode: Multiple rounds of discussion followed by synthesis
 */
async function runConsensus(
    message: ChannelMessage,
    agentConfigs: AgentConfig[],
    maxRounds: number,
    apiKeys: ApiKeysMap,
    toolContext: ToolContext,
    trackUsage: (msg: AgentMessage) => void,
    memoryContext?: string
): Promise<string> {
    let currentRoundMessages: AgentMessage[] = [];

    for (let round = 0; round < maxRounds; round++) {
        const isFirstRound = round === 0;
        const previousRoundResponses = currentRoundMessages;
        currentRoundMessages = [];

        const previousResponsesSummary = previousRoundResponses
            .map(r => `[${r.agentName}]: ${r.content}`)
            .join("\n\n");

        // Run all agents in parallel for this round
        const roundPromises = agentConfigs.map(agent => {
            let additionalContext: string | undefined;
            if (!isFirstRound && previousResponsesSummary) {
                additionalContext = DISCUSSION_ROUND_PROMPT
                    .replace("{ROUND}", String(round + 1))
                    .replace("{USER_INPUT}", message.content)
                    .replace("{PREVIOUS_RESPONSES}", previousResponsesSummary);
            }

            const mergedContext = [memoryContext, additionalContext].filter(Boolean).join("\n\n") || undefined;

            return safeExecuteAgent(
                agent,
                message.content,
                [],
                true,
                apiKeys,
                mergedContext,
                toolContext
            );
        });

        const roundResponses = await Promise.all(roundPromises);
        roundResponses.forEach(response => {
            trackUsage(response);
            currentRoundMessages.push(response);
        });
    }

    // Synthesis Step
    const responseSummary = currentRoundMessages
        .map(r => `[${r.agentName}]: ${r.content}`)
        .join("\n\n");

    const synthesisPrompt = SYNTHESIZER_PROMPT
        .replace("{USER_INPUT}", message.content)
        .replace("{RESPONSES}", responseSummary);

    // Select synthesizer (coordinator role or first agent)
    const synthesizer = agentConfigs.find(a => a.role === 'coordinator') || agentConfigs[0];

    const synthesis = await safeExecuteAgent(
        { ...synthesizer, systemPrompt: synthesisPrompt, name: "Synthesizer" },
        "Please synthesize the discussion into a final comprehensive response.",
        [],
        true,
        apiKeys,
        memoryContext,
        toolContext
    );

    trackUsage(synthesis);

    // Build output with discussion summary
    const roundSummary = `*${agentConfigs.length} agents discussed over ${maxRounds} round(s)*`;

    return `**Consensus Discussion Summary:**\n\n${synthesis.content}\n\n---\n\n${roundSummary}`;
}
