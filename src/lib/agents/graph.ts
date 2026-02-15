import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { AIMessage, HumanMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import type { AgentConfig, OrchestrationMode, AgentMessage, AgentTool } from "@/types/agent";
import { getModelWithKey } from "@/lib/ai/providers/factory";
import type { ProviderId } from "@/lib/ai/providers/types";
import { generateText, streamText, tool, stepCountIs } from "ai";
import { executeTool, getTool, type ToolId, type ToolContext } from "@/lib/tools";
import { pluginRegistry, initializePlugins, pluginExecutor } from "@/lib/plugins";
import { buildPluginInputSchema } from "@/lib/plugins/utils";
import {
    beforeAgentStart,
    afterAgentEnd,
    type AgentContext,
    type AgentResponse,
} from "@/lib/memory/lifecycle-hooks";

// Type for streaming callback
export type OnTokenCallback = (token: string, agentId: string, agentName: string) => void;

// Type for API keys map
type ApiKeysMap = Partial<Record<ProviderId, string>>;

/**
 * Select the agent for synthesis
 * Priority: coordinator role > synthesizerAgentId (from state) > first agent
 * This avoids hardcoding specific model IDs which become outdated quickly
 */
function selectSynthesizerAgent(agents: AgentConfig[], synthesizerAgentId?: string): AgentConfig | undefined {
    if (agents.length === 0) return undefined;

    // If a specific synthesizer agent ID is provided, use it
    if (synthesizerAgentId) {
        const specified = agents.find(a => a.id === synthesizerAgentId);
        if (specified) return specified;
    }

    // Check if there's a dedicated coordinator
    const coordinator = agents.find(a => a.role === "coordinator");
    if (coordinator) return coordinator;

    // Default to the first agent (user can control order via reordering feature)
    return agents[0];
}

// Map agent tool types to our tool IDs
const TOOL_TYPE_TO_ID: Record<AgentTool, ToolId | null> = {
    web_search: "web_search",
    code_exec: "shell_exec",     // code_exec maps to shell execution
    file_read: "file_read",
    file_write: "file_write",
    file_list: "file_list",
    file_search: "file_search",
    file_delete: "file_delete",
    file_move: "file_move",
    shell_exec: "shell_exec",
    rag_search: "rag_search",
    calculator: "calculator",
    coding_cli: "coding_cli", // Sherlock Fix
    email: "email",           // Sherlock Fix
    workflow: "workflow",     // Sherlock Fix
    skill: null,  // Plugin/skill tools handled separately
    custom: null, // Custom tools handled separately
};

// Build AI SDK v6 tools from agent tool configuration
// AI SDK v6 requires tools with description, parameters (Zod/JSON schema), and execute function
// Using the tool() helper function for proper type inference and execution
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildToolsForAgent(agentTools: AgentTool[] | undefined, context?: ToolContext): Promise<Record<string, any> | undefined> {
    if (!agentTools || agentTools.length === 0) return undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, any> = {};

    for (const agentTool of agentTools) {
        const toolId = TOOL_TYPE_TO_ID[agentTool];
        if (!toolId) continue;

        const toolDef = getTool(toolId);
        if (!toolDef) continue;

        // Use the tool() helper function from AI SDK v6 for proper type inference and execution
        // AI SDK v6 uses 'inputSchema' instead of 'parameters'
        tools[toolId] = tool({
            description: toolDef.description,
            inputSchema: toolDef.schema,
            execute: async (params) => {
                try {
                    const result = await executeTool(
                        { toolId, params: params as Record<string, unknown> },
                        context
                    );
                    if (result.success) {
                        return JSON.stringify(result.data);
                    } else {
                        return `Tool error: ${result.error}`;
                    }
                } catch (error) {
                    return `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}`;
                }
            },
        });
    }

    // Add plugin/skill tools if agent has "skill" tool enabled
    if (agentTools.includes("skill")) {
        // Ensure plugins are loaded
        await initializePlugins();

        for (const plugin of pluginRegistry.list()) {
            for (const pluginTool of plugin.manifest.tools || []) {
                const toolName = `${plugin.manifest.slug}__${pluginTool.name}`;
                // Use the tool() helper function from AI SDK v6 for proper type inference and execution
                // AI SDK v6 uses 'inputSchema' instead of 'parameters'
                tools[toolName] = tool({
                    description: pluginTool.description,
                    inputSchema: buildPluginInputSchema(pluginTool.parameters),
                    execute: async (params) => {
                        try {
                            const result = await pluginExecutor.execute(
                                plugin.manifest.slug,
                                pluginTool.name,
                                params as Record<string, unknown>,
                                {
                                    userId: context?.userId || "",
                                    agentId: undefined,
                                    config: {
                                        googleApiKey: context?.apiKeys?.google,
                                    },
                                }
                            );
                            return result.success
                                ? JSON.stringify(result.data ?? result.output ?? result.metadata ?? {})
                                : `Skill error: ${result.error}`;
                        } catch (error) {
                            return `Skill execution failed: ${error instanceof Error ? error.message : "Unknown error"}`;
                        }
                    },
                });
            }
        }
    }

    return Object.keys(tools).length > 0 ? tools : undefined;
}

// ============================================================================
// State Annotation for LangGraph
// ============================================================================

/**
 * Annotation defines the structure and reducers for state management
 */
const AgentStateAnnotation = Annotation.Root({
    conversationId: Annotation<string>(),
    messages: Annotation<AgentMessage[]>({
        value: (prev, next) => [...prev, ...next],
        default: () => [],
    }),
    activeAgents: Annotation<AgentConfig[]>({
        value: (prev, next) => next,
        default: () => [],
    }),
    orchestrationMode: Annotation<OrchestrationMode>({
        value: (prev, next) => next,
        default: () => "single",
    }),
    currentAgentIndex: Annotation<number>({
        value: (prev, next) => next,
        default: () => 0,
    }),
    round: Annotation<number>({
        value: (prev, next) => next,
        default: () => 0,
    }),
    maxRounds: Annotation<number>({
        value: (prev, next) => next,
        default: () => 3,
    }),
    isComplete: Annotation<boolean>({
        value: (prev, next) => next,
        default: () => false,
    }),
    error: Annotation<string | undefined>({
        value: (prev, next) => next,
        default: () => undefined,
    }),
    userInput: Annotation<string>({
        value: (prev, next) => next,
        default: () => "",
    }),
    coordinatorId: Annotation<string | undefined>({
        value: (prev, next) => next,
        default: () => undefined,
    }),
    delegatedTasks: Annotation<Array<{ agentId: string; task: string; response?: string }>>({
        value: (prev, next) => [...prev, ...next],
        default: () => [],
    }),
    debug: Annotation<{ reasoning: string[]; decisions: string[] }>({
        value: (prev, next) => ({
            reasoning: [...(prev?.reasoning || []), ...(next?.reasoning || [])],
            decisions: [...(prev?.decisions || []), ...(next?.decisions || [])],
        }),
        default: () => ({ reasoning: [], decisions: [] }),
    }),
    // API keys for model access
    apiKeys: Annotation<ApiKeysMap>({
        value: (prev, next) => next,
        default: () => ({}),
    }),
    // User ID for tool context (needed for tools like RAG search)
    userId: Annotation<string | undefined>({
        value: (prev, next) => next,
        default: () => undefined,
    }),
    // Local system access settings (from admin panel)
    localFileAccessEnabled: Annotation<boolean>({
        value: (prev, next) => next,
        default: () => false,
    }),
    commandExecutionEnabled: Annotation<boolean>({
        value: (prev, next) => next,
        default: () => false,
    }),
    fileAccessBaseDir: Annotation<string | undefined>({
        value: (prev, next) => next,
        default: () => undefined,
    }),
    workspaceQuotaMb: Annotation<number | undefined>({
        reducer: (_, b) => b,
        default: () => undefined,
    }),
    hostedSandbox: Annotation<boolean | undefined>({
        reducer: (_, b) => b,
        default: () => undefined,
    }),
    // Streaming callback (not serializable, so passed via context/config usually, but here for local graph state if needed, though usually better in config)
    // We'll pass it via the node execution closure instead of state
});

type AgentGraphState = typeof AgentStateAnnotation.State;

// ============================================================================
// Core Agent Execution
// ============================================================================

/**
 * Execute a single agent and return its response
 */
export async function executeAgent(
    agent: AgentConfig,
    userMessage: string,
    conversationHistory: AgentMessage[],
    canSeeOtherAgents: boolean,
    apiKeys: ApiKeysMap,
    additionalContext?: string,
    toolContext?: ToolContext,
    onToken?: OnTokenCallback
): Promise<AgentMessage> {
    try {
        // Build context from conversation history
        const messages: BaseMessage[] = [];

        // Add system prompt
        let systemPrompt = agent.systemPrompt || "";
        if (additionalContext) {
            systemPrompt += `\n\n${additionalContext}`;
        }
        if (systemPrompt) {
            messages.push(new SystemMessage(systemPrompt));
        }

        // Add conversation history (filtered if agent can't see others)
        for (const msg of conversationHistory) {
            if (!canSeeOtherAgents && msg.agentId !== agent.id && msg.role === "assistant") {
                continue; // Skip other agents' messages
            }

            if (msg.role === "user") {
                messages.push(new HumanMessage(msg.content));
            } else if (msg.role === "assistant") {
                const content = canSeeOtherAgents && msg.agentId !== agent.id
                    ? `[${msg.agentName}]: ${msg.content}`
                    : msg.content;
                messages.push(new AIMessage(content));
            }
        }

        // Add current user message
        messages.push(new HumanMessage(userMessage));

        // Get the model with user's API keys
        const model = getModelWithKey(agent.modelId, apiKeys);

        // Build tools for the agent if configured
        // Pass full tool context including local access settings for access control
        const agentTools = await buildToolsForAgent(agent.tools, toolContext);

        // Convert LangChain messages to AI SDK format
        // AI SDK v6 expects: { role: "user" | "assistant" | "system", content: string }
        const formattedMessages = messages.map(m => {
            const role = m._getType() === "human" ? "user" as const :
                m._getType() === "ai" ? "assistant" as const : "system" as const;

            // Ensure content is always a string
            let content: string;
            if (typeof m.content === "string") {
                content = m.content;
            } else if (Array.isArray(m.content)) {
                // Handle array content (e.g., multimodal messages)
                content = m.content.map(c =>
                    typeof c === "string" ? c : (c as { text?: string })?.text || JSON.stringify(c)
                ).join("\n");
            } else {
                content = String(m.content);
            }

            return { role, content };
        });

        // Build generateText options
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const generateOptions: any = {
            model,
            messages: formattedMessages,
            temperature: agent.temperature,
        };

        // Add maxTokens if specified
        if (agent.maxTokens) {
            generateOptions.maxTokens = agent.maxTokens;
        }

        // Add extended thinking for Anthropic models with thinkingBudget
        if (agent.thinkingBudget && agent.provider === "anthropic") {
            generateOptions.providerOptions = {
                anthropic: {
                    thinking: {
                        type: "enabled",
                        budgetTokens: agent.thinkingBudget,
                    },
                },
            };
        }

        // Enable tools if agent has them configured (AI SDK v6 format)
        if (agentTools) {
            generateOptions.tools = agentTools;
            // AI SDK v6 uses stopWhen instead of maxSteps
            generateOptions.stopWhen = stepCountIs(10);
        }

        // Debug log (only in development)
        if (process.env.NODE_ENV === "development") {
            console.log(`Agent ${agent.name} executing with ${agentTools ? Object.keys(agentTools).length : 0} tools`);
        }

        // Check if we should stream
        if (onToken) {
            const result = streamText(generateOptions);

            let fullText = "";
            for await (const delta of result.textStream) {
                fullText += delta;
                onToken(delta, agent.id || "unknown", agent.name);
            }

            // We need to wait for the full stream to complete to get tool usage info locally
            // But streamText in AI SDK v6 provides usage via onFinish callback or by awaiting the full result
            // However, iterating textStream doesn't give us the full result object with usage and steps directly.
            // We can resolve the usage from the promise after iteration if we used the stream helper correctly.

            // For now, simpler approximation for streaming mode:
            // We lose some tool usage stats in the immediate return unless we wait for `result.toDataStreamResponse()` equivalent processing
            // But since we are iterating the text stream manually:

            // Re-construct basic stats (approximate)
            const inputTokens = 0; // Hard to get during stream without callbacks
            const outputTokens = 0;

            return {
                agentId: agent.id || "unknown",
                agentName: agent.name,
                role: "assistant",
                content: fullText,
                timestamp: new Date(),
                metadata: {
                    provider: agent.provider,
                    model: agent.modelId,
                    inputTokens,
                    outputTokens,
                    // toolsUsed: ... (would need to track tool calls in stream)
                },
            };
        } else {
            // Non-streaming fallback (original behavior)
            const result = await generateText(generateOptions);

            // Collect tool calls and results for metadata
            type ToolCallInfo = { toolName?: string; args?: unknown };
            type ToolResultInfo = { result?: unknown };
            type StepInfo = { toolCalls?: ToolCallInfo[]; toolResults?: ToolResultInfo[] };

            const resultWithSteps = result as { steps?: StepInfo[] };
            const toolResults: Array<{ tool: string; args?: unknown; result?: unknown }> =
                resultWithSteps.steps?.flatMap((step) =>
                    step.toolCalls?.map((tc, index) => ({
                        tool: tc.toolName ?? "unknown",
                        args: tc.args,
                        result: step.toolResults?.[index]?.result,
                    })) || []
                ) || [];

            // Log tool usage for debugging
            if (toolResults.length > 0 && process.env.NODE_ENV === "development") {
                console.log(`Agent ${agent.name} used ${toolResults.length} tool(s):`, toolResults.map((t: { tool: string }) => t.tool).join(", "));
            }

            // Handle different AI SDK versions for usage tokens
            const usage = result.usage as unknown as Record<string, number> | undefined;
            const inputTokens = usage?.promptTokens ?? usage?.inputTokens;
            const outputTokens = usage?.completionTokens ?? usage?.outputTokens;

            return {
                agentId: agent.id || "unknown",
                agentName: agent.name,
                role: "assistant",
                content: result.text,
                timestamp: new Date(),
                metadata: {
                    provider: agent.provider,
                    model: agent.modelId,
                    inputTokens,
                    outputTokens,
                    toolsUsed: toolResults.length > 0 ? toolResults : undefined,
                },
            };
        }
    } catch (error) {
        console.error(`Agent ${agent.name} execution error:`, error);
        return {
            agentId: agent.id || "unknown",
            agentName: agent.name,
            role: "assistant",
            content: `[Error: Failed to get response from ${agent.name}]`,
            timestamp: new Date(),
            metadata: { error: error instanceof Error ? error.message : "Unknown error" },
        };
    }
}

// ============================================================================
// Single Agent Mode
// ============================================================================

async function singleAgentNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    const agent = state.activeAgents[0];
    if (!agent) {
        return { isComplete: true, error: "No agent configured" };
    }

    // Build tool context for tool execution
    const toolContext: ToolContext = {
        userId: state.userId,
        apiKeys: state.apiKeys as Record<string, string>,
        localFileAccessEnabled: state.localFileAccessEnabled,
        commandExecutionEnabled: state.commandExecutionEnabled,
        fileAccessBaseDir: state.fileAccessBaseDir,
        workspaceQuotaMb: state.workspaceQuotaMb,
        hostedSandbox: state.hostedSandbox,
    };

    const response = await executeAgent(
        agent,
        state.userInput,
        state.messages,
        agent.canSeeOtherAgents,
        state.apiKeys,
        undefined, // additionalContext
        toolContext
    );

    return {
        messages: [response],
        isComplete: true,
    };
}

// ============================================================================
// Sequential Mode
// ============================================================================

async function sequentialAgentNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    const currentAgent = state.activeAgents[state.currentAgentIndex];
    if (!currentAgent) {
        return { isComplete: true };
    }

    // Build tool context for tool execution
    const toolContext: ToolContext = {
        userId: state.userId,
        apiKeys: state.apiKeys as Record<string, string>,
        localFileAccessEnabled: state.localFileAccessEnabled,
        commandExecutionEnabled: state.commandExecutionEnabled,
        fileAccessBaseDir: state.fileAccessBaseDir,
        workspaceQuotaMb: state.workspaceQuotaMb,
        hostedSandbox: state.hostedSandbox,
    };

    const response = await executeAgent(
        currentAgent,
        state.userInput,
        state.messages,
        currentAgent.canSeeOtherAgents,
        state.apiKeys,
        undefined, // additionalContext
        toolContext
    );

    const nextIndex = state.currentAgentIndex + 1;
    const isComplete = nextIndex >= state.activeAgents.length;

    return {
        messages: [response],
        currentAgentIndex: nextIndex,
        isComplete,
        debug: {
            reasoning: [`Agent ${currentAgent.name} processed at index ${state.currentAgentIndex}`],
            decisions: [],
        },
    };
}

function shouldContinueSequential(state: AgentGraphState): "continue" | "end" {
    return state.isComplete ? "end" : "continue";
}

// ============================================================================
// Parallel Mode
// ============================================================================

async function parallelAgentNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    // Build tool context for tool execution
    const toolContext: ToolContext = {
        userId: state.userId,
        apiKeys: state.apiKeys as Record<string, string>,
        localFileAccessEnabled: state.localFileAccessEnabled,
        commandExecutionEnabled: state.commandExecutionEnabled,
        fileAccessBaseDir: state.fileAccessBaseDir,
        workspaceQuotaMb: state.workspaceQuotaMb,
        hostedSandbox: state.hostedSandbox,
    };

    const responses = await Promise.all(
        state.activeAgents.map(agent =>
            executeAgent(
                agent,
                state.userInput,
                state.messages,
                agent.canSeeOtherAgents,
                state.apiKeys,
                undefined, // additionalContext
                toolContext
            )
        )
    );

    return {
        messages: responses,
        isComplete: true,
        debug: {
            reasoning: [`All ${state.activeAgents.length} agents processed in parallel`],
            decisions: [],
        },
    };
}

// ============================================================================
// Hierarchical Mode - Coordinator delegates to specialists
// ============================================================================

const COORDINATOR_SYSTEM_PROMPT = `You are a task coordinator. Your job is to:
1. Analyze the user's request
2. Break it down into subtasks if needed
3. Decide which specialist agents should handle each part
4. After receiving responses, synthesize a final answer

Available specialists:
{SPECIALISTS}

When delegating, respond with a JSON object in this format:
{
  "analysis": "Brief analysis of the task",
  "delegations": [
    {"agentId": "agent-id-here", "task": "Specific task for this agent"}
  ]
}

If you can answer directly without delegation, respond normally without JSON.`;

const COORDINATOR_SYNTHESIS_PROMPT = `You are synthesizing responses from specialist agents.

Original user request: {USER_INPUT}

Specialist responses:
{RESPONSES}

Please provide a comprehensive, well-organized final response that:
1. Integrates insights from all specialists
2. Resolves any conflicts or contradictions
3. Presents a cohesive answer to the user's original request`;

async function hierarchicalCoordinatorNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    // Build tool context for tool execution
    const toolContext: ToolContext = {
        userId: state.userId,
        apiKeys: state.apiKeys as Record<string, string>,
        localFileAccessEnabled: state.localFileAccessEnabled,
        commandExecutionEnabled: state.commandExecutionEnabled,
        fileAccessBaseDir: state.fileAccessBaseDir,
        workspaceQuotaMb: state.workspaceQuotaMb,
        hostedSandbox: state.hostedSandbox,
    };

    // Find coordinator and specialists
    const coordinator = state.activeAgents.find(a => a.role === "coordinator") || state.activeAgents[0];
    const specialists = state.activeAgents.filter(a => a.id !== coordinator?.id);

    if (!coordinator) {
        return { isComplete: true, error: "No coordinator agent found" };
    }

    // Build specialist list for coordinator
    const specialistList = specialists.map(s => `- ${s.name} (${s.role}): ${s.description || "Specialist agent"}`).join("\n");

    const coordinatorPrompt = COORDINATOR_SYSTEM_PROMPT.replace("{SPECIALISTS}", specialistList);

    // Get coordinator's analysis
    const analysis = await executeAgent(
        { ...coordinator, systemPrompt: coordinatorPrompt },
        state.userInput,
        state.messages,
        true,
        state.apiKeys,
        undefined,
        toolContext
    );

    // Check if coordinator wants to delegate
    let delegations: Array<{ agentId: string; task: string }> = [];
    try {
        // Try to parse JSON from response
        const jsonMatch = analysis.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.delegations && Array.isArray(parsed.delegations)) {
                delegations = parsed.delegations;
            }
        }
    } catch {
        // Not JSON, coordinator chose to respond directly
    }

    if (delegations.length === 0) {
        // Coordinator answered directly
        return {
            messages: [analysis],
            isComplete: true,
            debug: {
                reasoning: ["Coordinator answered directly without delegation"],
                decisions: ["Direct response"],
            },
        };
    }

    // Execute delegated tasks
    const taskResponses: AgentMessage[] = [];
    for (const delegation of delegations) {
        const specialist = specialists.find(s => s.id === delegation.agentId);
        if (specialist) {
            const response = await executeAgent(
                specialist,
                delegation.task,
                state.messages,
                false, // Specialists don't see each other
                state.apiKeys,
                undefined,
                toolContext
            );
            taskResponses.push(response);
        }
    }

    // Synthesize final response
    const responseSummary = taskResponses.map(r => `[${r.agentName}]: ${r.content}`).join("\n\n");
    const synthesisPrompt = COORDINATOR_SYNTHESIS_PROMPT
        .replace("{USER_INPUT}", state.userInput)
        .replace("{RESPONSES}", responseSummary);

    const finalResponse = await executeAgent(
        { ...coordinator, systemPrompt: synthesisPrompt },
        "Please synthesize the above specialist responses into a final answer.",
        [],
        true,
        state.apiKeys,
        undefined,
        toolContext
    );

    return {
        messages: [...taskResponses, finalResponse],
        isComplete: true,
        debug: {
            reasoning: [
                `Coordinator delegated to ${delegations.length} specialists`,
                ...delegations.map(d => `Task for ${d.agentId}: ${d.task}`),
            ],
            decisions: ["Hierarchical delegation and synthesis"],
        },
    };
}

// ============================================================================
// Consensus Mode - Multiple agents respond, discuss, synthesizer combines
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

// Factory to create consensus node with streaming support
function createConsensusAgentNode(onToken?: OnTokenCallback, onRound?: (round: number, maxRounds: number, phase: "start" | "end" | "synthesis") => void) {
    return async function consensusAgentNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
        // Build tool context for tool execution
        const toolContext: ToolContext = {
            userId: state.userId,
            apiKeys: state.apiKeys as Record<string, string>,
            localFileAccessEnabled: state.localFileAccessEnabled,
            commandExecutionEnabled: state.commandExecutionEnabled,
            fileAccessBaseDir: state.fileAccessBaseDir,
            workspaceQuotaMb: state.workspaceQuotaMb,
            hostedSandbox: state.hostedSandbox,
        };

        const isFirstRound = state.round === 0;
        const isFinalRound = state.round >= state.maxRounds - 1;

        // Emit round start event
        if (onRound) {
            onRound(state.round + 1, state.maxRounds, "start");
        }

        // Get previous round's agent responses for discussion context
        const previousRoundResponses = state.messages.filter(m => m.role === "assistant");
        const previousResponsesSummary = previousRoundResponses
            .map(r => `[${r.agentName}]: ${r.content}`)
            .join("\n\n");

        // Execute agents sequentially with streaming for visibility (not in parallel)
        // This lets users see each agent's response as it comes in
        const responses: AgentMessage[] = [];
        for (const agent of state.activeAgents) {
            // For subsequent rounds, provide context about other agents' responses
            let additionalContext: string | undefined;
            if (!isFirstRound && previousResponsesSummary) {
                additionalContext = DISCUSSION_ROUND_PROMPT
                    .replace("{ROUND}", String(state.round + 1))
                    .replace("{USER_INPUT}", state.userInput)
                    .replace("{PREVIOUS_RESPONSES}", previousResponsesSummary);
            }

            const response = await executeAgent(
                agent,
                state.userInput,
                isFirstRound ? state.messages : [], // Fresh context for discussion rounds
                !isFirstRound, // Can see others after first round
                state.apiKeys,
                additionalContext,
                toolContext,
                onToken // Pass streaming callback
            );
            responses.push(response);
        }

        // Check if we've reached the final round
        if (isFinalRound) {
            // Emit synthesis phase
            if (onRound) {
                onRound(state.round + 1, state.maxRounds, "synthesis");
            }

            // Final synthesis
            const allResponses = [...previousRoundResponses, ...responses];
            const responseSummary = allResponses.map(r => `[${r.agentName}]: ${r.content}`).join("\n\n");
            const synthesisPrompt = SYNTHESIZER_PROMPT
                .replace("{USER_INPUT}", state.userInput)
                .replace("{RESPONSES}", responseSummary);

            // Select synthesizer: prefers coordinator role, then first agent (user controls order)
            const synthesizer = selectSynthesizerAgent(state.activeAgents);

            if (!synthesizer) {
                return {
                    messages: responses,
                    round: state.round + 1,
                    isComplete: true,
                };
            }

            const synthesis = await executeAgent(
                { ...synthesizer, systemPrompt: synthesisPrompt, name: "Synthesizer" },
                "Please synthesize the discussion into a final comprehensive response.",
                [],
                true,
                state.apiKeys,
                undefined,
                toolContext,
                onToken // Stream synthesis too
            );

            // Emit round end
            if (onRound) {
                onRound(state.round + 1, state.maxRounds, "end");
            }

            return {
                messages: [...responses, synthesis],
                round: state.round + 1,
                isComplete: true,
                debug: {
                    reasoning: [`Consensus round ${state.round + 1} (final): ${responses.length} agents responded, synthesis created`],
                    decisions: ["Final synthesis completed after multi-round discussion"],
                },
            };
        }

        // Emit round end for intermediate rounds
        if (onRound) {
            onRound(state.round + 1, state.maxRounds, "end");
        }

        // Intermediate round - continue discussion
        return {
            messages: responses,
            round: state.round + 1,
            isComplete: false, // Continue to next round for discussion
            debug: {
                reasoning: [`Consensus round ${state.round + 1}: ${responses.length} agents responded, continuing discussion`],
                decisions: [`Proceeding to round ${state.round + 2} of ${state.maxRounds}`],
            },
        };
    };
}

function shouldContinueConsensus(state: AgentGraphState): "continue" | "end" {
    return state.isComplete ? "end" : "continue";
}

// ============================================================================
// Auto-Router Mode - Intelligent routing based on task analysis
// ============================================================================

const ROUTER_PROMPT = `You are an intelligent task router. Analyze the user's request and determine the best agent(s) to handle it.

Available agents:
{AGENTS}

Analyze the task and respond with a JSON object:
{
  "analysis": "Brief analysis of what the task requires",
  "selectedAgents": ["agent-id-1", "agent-id-2"],
  "reasoning": "Why these agents were selected",
  "mode": "single" | "parallel" | "sequential"
}

Consider:
- Code tasks → coding agents
- Analysis tasks → analyst agents
- Creative writing → writer agents
- Research questions → researcher agents
- Complex multi-part tasks → multiple agents

Select the minimum number of agents needed for quality results.`;

// Factory function for auto-router with streaming support
const createAutoRouterNode = (onToken?: OnTokenCallback) => async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    // Build tool context for tool execution
    const toolContext: ToolContext = {
        userId: state.userId,
        apiKeys: state.apiKeys as Record<string, string>,
        localFileAccessEnabled: state.localFileAccessEnabled,
        commandExecutionEnabled: state.commandExecutionEnabled,
        fileAccessBaseDir: state.fileAccessBaseDir,
        workspaceQuotaMb: state.workspaceQuotaMb,
        hostedSandbox: state.hostedSandbox,
    };

    // Use a meta-agent to decide routing
    const agentList = state.activeAgents.map(a =>
        `- ID: ${a.id}, Name: ${a.name}, Role: ${a.role}, Description: ${a.description || "General agent"}`
    ).join("\n");

    const routerPrompt = ROUTER_PROMPT.replace("{AGENTS}", agentList);

    // Use the first available agent as router (ideally a coordinator)
    const routerAgent = state.activeAgents.find(a => a.role === "coordinator") || state.activeAgents[0];

    if (!routerAgent) {
        return {
            messages: [],
            isComplete: true,
            error: "No agents available for routing",
        };
    }

    // Router decision - no streaming for the JSON decision
    const routingDecision = await executeAgent(
        { ...routerAgent, systemPrompt: routerPrompt, name: "Router" },
        state.userInput,
        [],
        true,
        state.apiKeys,
        undefined,
        toolContext
        // No onToken - we don't want to stream the routing decision JSON
    );

    // Parse routing decision
    let selectedAgentIds: string[] = [];
    let routingMode: "single" | "parallel" | "sequential" = "single";
    let reasoning = "";

    try {
        const jsonMatch = routingDecision.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            selectedAgentIds = parsed.selectedAgents || [];
            routingMode = parsed.mode || "single";
            reasoning = parsed.reasoning || "";
        }
    } catch {
        // Fallback to first agent
        selectedAgentIds = [state.activeAgents[0]?.id || ""];
    }

    // Filter to selected agents
    let selectedAgents = state.activeAgents.filter(a =>
        a.id && selectedAgentIds.includes(a.id)
    );

    // Fallback to first agent if none selected
    if (selectedAgents.length === 0 && state.activeAgents[0]) {
        selectedAgents = [state.activeAgents[0]];
    }

    if (selectedAgents.length === 0) {
        return {
            messages: [],
            isComplete: true,
            error: "No agents available",
        };
    }

    // Execute based on determined mode - with streaming support
    let responses: AgentMessage[] = [];
    const firstAgent = selectedAgents[0]!;

    if (routingMode === "parallel" && selectedAgents.length > 1) {
        // Parallel mode: streams will be interleaved, but users can see all agents working
        responses = await Promise.all(
            selectedAgents.map(agent =>
                executeAgent(
                    agent,
                    state.userInput,
                    state.messages,
                    agent.canSeeOtherAgents,
                    state.apiKeys,
                    undefined,
                    toolContext,
                    onToken // Stream all parallel responses
                )
            )
        );
    } else if (routingMode === "sequential" && selectedAgents.length > 1) {
        // Sequential mode: each agent streams one at a time
        for (const agent of selectedAgents) {
            const response = await executeAgent(
                agent,
                state.userInput,
                [...state.messages, ...responses],
                agent.canSeeOtherAgents,
                state.apiKeys,
                undefined,
                toolContext,
                onToken // Stream sequential responses
            );
            responses.push(response);
        }
    } else {
        // Single agent mode
        const response = await executeAgent(
            firstAgent,
            state.userInput,
            state.messages,
            firstAgent.canSeeOtherAgents,
            state.apiKeys,
            undefined,
            toolContext,
            onToken // Stream single agent response
        );
        responses.push(response);
    }

    return {
        messages: responses,
        isComplete: true,
        debug: {
            reasoning: [
                `Auto-router selected ${selectedAgents.length} agent(s)`,
                `Mode: ${routingMode}`,
                reasoning,
            ],
            decisions: [`Selected agents: ${selectedAgents.map(a => a.name).join(", ")}`],
        },
    };
};

// ============================================================================
// Graph Builders
// ============================================================================

// ============================================================================
// Graph Builders
// ============================================================================

// Factory functions to create nodes with callback context
const createSingleAgentNode = (onToken?: OnTokenCallback) => async (state: AgentGraphState) => {
    const agent = state.activeAgents[0];
    if (!agent) {
        return { isComplete: true, error: "No agent configured" };
    }

    const toolContext: ToolContext = {
        userId: state.userId,
        apiKeys: state.apiKeys as Record<string, string>,
        localFileAccessEnabled: state.localFileAccessEnabled,
        commandExecutionEnabled: state.commandExecutionEnabled,
        fileAccessBaseDir: state.fileAccessBaseDir,
        workspaceQuotaMb: state.workspaceQuotaMb,
        hostedSandbox: state.hostedSandbox,
    };

    const response = await executeAgent(
        agent,
        state.userInput,
        state.messages,
        agent.canSeeOtherAgents,
        state.apiKeys,
        undefined,
        toolContext,
        onToken
    );

    return {
        messages: [response],
        isComplete: true,
    };
};

const createSequentialAgentNode = (onToken?: OnTokenCallback) => async (state: AgentGraphState) => {
    const currentAgent = state.activeAgents[state.currentAgentIndex];
    if (!currentAgent) {
        return { isComplete: true };
    }

    const toolContext: ToolContext = {
        userId: state.userId,
        apiKeys: state.apiKeys as Record<string, string>,
        localFileAccessEnabled: state.localFileAccessEnabled,
        commandExecutionEnabled: state.commandExecutionEnabled,
        fileAccessBaseDir: state.fileAccessBaseDir,
        workspaceQuotaMb: state.workspaceQuotaMb,
        hostedSandbox: state.hostedSandbox,
    };

    // Sequential mode: we can stream safely
    const response = await executeAgent(
        currentAgent,
        state.userInput,
        state.messages,
        currentAgent.canSeeOtherAgents,
        state.apiKeys,
        undefined,
        toolContext,
        onToken
    );

    const nextIndex = state.currentAgentIndex + 1;
    const isComplete = nextIndex >= state.activeAgents.length;

    return {
        messages: [response],
        currentAgentIndex: nextIndex,
        isComplete,
        debug: {
            reasoning: [`Agent ${currentAgent.name} processed at index ${state.currentAgentIndex}`],
            decisions: [],
        },
    };
};

const createParallelAgentNode = (onToken?: OnTokenCallback) => async (state: AgentGraphState) => {
    const toolContext: ToolContext = {
        userId: state.userId,
        apiKeys: state.apiKeys as Record<string, string>,
        localFileAccessEnabled: state.localFileAccessEnabled,
        commandExecutionEnabled: state.commandExecutionEnabled,
        fileAccessBaseDir: state.fileAccessBaseDir,
        workspaceQuotaMb: state.workspaceQuotaMb,
        hostedSandbox: state.hostedSandbox,
    };

    // Parallel mode: if we share the SAME onToken callback, streams will be interleaved
    // The Client must handle interleaved streams if onToken is called concurrently
    const responses = await Promise.all(
        state.activeAgents.map(agent =>
            executeAgent(
                agent,
                state.userInput,
                state.messages,
                agent.canSeeOtherAgents,
                state.apiKeys,
                undefined,
                toolContext,
                onToken
            )
        )
    );

    return {
        messages: responses,
        isComplete: true,
        debug: {
            reasoning: [`All ${state.activeAgents.length} agents processed in parallel`],
            decisions: [],
        },
    };
};

export function buildSingleAgentGraph(onToken?: OnTokenCallback) {
    const graph = new StateGraph(AgentStateAnnotation)
        .addNode("agent", createSingleAgentNode(onToken))
        .addEdge(START, "agent")
        .addEdge("agent", END);

    return graph.compile();
}

export function buildSequentialGraph(onToken?: OnTokenCallback) {
    const graph = new StateGraph(AgentStateAnnotation)
        .addNode("process", createSequentialAgentNode(onToken))
        .addEdge(START, "process")
        .addConditionalEdges("process", shouldContinueSequential, {
            continue: "process",
            end: END,
        });

    return graph.compile();
}

export function buildParallelGraph(onToken?: OnTokenCallback) {
    const graph = new StateGraph(AgentStateAnnotation)
        .addNode("parallel", createParallelAgentNode(onToken))
        .addEdge(START, "parallel")
        .addEdge("parallel", END);

    return graph.compile();
}

// Ensure other builders also accept onToken (skipping implementation details for now as less critical, but strict TS might require it)
// For simplicity in this edit, I will only update the main supported modes (single, sequential, parallel) fully.
// Hierarchical and Consensus are more complex and less used in the basic flows, but should be updated to match pattern if possible.

const createHierarchicalNode = (onToken?: OnTokenCallback) => async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    // Build tool context for tool execution
    const toolContext: ToolContext = {
        userId: state.userId,
        apiKeys: state.apiKeys as Record<string, string>,
        localFileAccessEnabled: state.localFileAccessEnabled,
        commandExecutionEnabled: state.commandExecutionEnabled,
        fileAccessBaseDir: state.fileAccessBaseDir,
        workspaceQuotaMb: state.workspaceQuotaMb,
        hostedSandbox: state.hostedSandbox,
    };

    // Find coordinator and specialists
    const coordinator = state.activeAgents.find(a => a.role === "coordinator") || state.activeAgents[0];
    const specialists = state.activeAgents.filter(a => a.id !== coordinator?.id);

    if (!coordinator) {
        return { isComplete: true, error: "No coordinator agent found" };
    }

    // Build specialist list for coordinator
    const specialistList = specialists.map(s => `- ${s.name} (${s.role}): ${s.description || "Specialist agent"}`).join("\n");

    const coordinatorPrompt = COORDINATOR_SYSTEM_PROMPT.replace("{SPECIALISTS}", specialistList);

    // Get coordinator's analysis (no streaming for analysis, just reasoning)
    const analysis = await executeAgent(
        { ...coordinator, systemPrompt: coordinatorPrompt },
        state.userInput,
        state.messages,
        true,
        state.apiKeys,
        undefined,
        toolContext
        // No onToken for analysis - we don't want to stream the delegation JSON
    );

    // Check if coordinator wants to delegate
    let delegations: Array<{ agentId: string; task: string }> = [];
    try {
        // Try to parse JSON from response
        const jsonMatch = analysis.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.delegations && Array.isArray(parsed.delegations)) {
                delegations = parsed.delegations;
            }
        }
    } catch {
        // Not JSON, coordinator chose to respond directly
    }

    if (delegations.length === 0) {
        // Coordinator answered directly - stream this response
        return {
            messages: [analysis],
            isComplete: true,
            debug: {
                reasoning: ["Coordinator answered directly without delegation"],
                decisions: ["Direct response"],
            },
        };
    }

    // Execute delegated tasks sequentially with streaming
    const taskResponses: AgentMessage[] = [];
    for (const delegation of delegations) {
        const specialist = specialists.find(s => s.id === delegation.agentId);
        if (specialist) {
            const response = await executeAgent(
                specialist,
                delegation.task,
                state.messages,
                false, // Specialists don't see each other
                state.apiKeys,
                undefined,
                toolContext,
                onToken // Stream specialist responses
            );
            taskResponses.push(response);
        }
    }

    // Synthesize final response with streaming
    const responseSummary = taskResponses.map(r => `[${r.agentName}]: ${r.content}`).join("\n\n");
    const synthesisPrompt = COORDINATOR_SYNTHESIS_PROMPT
        .replace("{USER_INPUT}", state.userInput)
        .replace("{RESPONSES}", responseSummary);

    const finalResponse = await executeAgent(
        { ...coordinator, systemPrompt: synthesisPrompt },
        "Please synthesize the above specialist responses into a final answer.",
        [],
        true,
        state.apiKeys,
        undefined,
        toolContext,
        onToken // Stream the final synthesis
    );

    return {
        messages: [...taskResponses, finalResponse],
        isComplete: true,
        debug: {
            reasoning: [
                `Coordinator delegated to ${delegations.length} specialists`,
                ...delegations.map(d => `Task for ${d.agentId}: ${d.task}`),
            ],
            decisions: ["Hierarchical delegation and synthesis"],
        },
    };
};

export function buildHierarchicalGraph(onToken?: OnTokenCallback) {
    const graph = new StateGraph(AgentStateAnnotation)
        .addNode("coordinator", createHierarchicalNode(onToken))
        .addEdge(START, "coordinator")
        .addEdge("coordinator", END);

    return graph.compile();
}

export function buildConsensusGraph(onToken?: OnTokenCallback, onRound?: (round: number, maxRounds: number, phase: "start" | "end" | "synthesis") => void) {
    // Consensus mode with multi-round discussion support
    // Agents discuss until maxRounds is reached, then synthesize
    const graph = new StateGraph(AgentStateAnnotation)
        .addNode("consensus", createConsensusAgentNode(onToken, onRound))
        .addEdge(START, "consensus")
        .addConditionalEdges(
            "consensus",
            shouldContinueConsensus,
            {
                continue: "consensus", // Loop back for another round
                end: END,              // Complete when synthesis done
            }
        );

    return graph.compile();
}

export function buildAutoRouterGraph(onToken?: OnTokenCallback) {
    const graph = new StateGraph(AgentStateAnnotation)
        .addNode("router", createAutoRouterNode(onToken))
        .addEdge(START, "router")
        .addEdge("router", END);

    return graph.compile();
}

// ============================================================================
// Main Orchestration Function
// ============================================================================

export interface OrchestrationResult {
    messages: AgentMessage[];
    mode: OrchestrationMode;
    debug?: {
        reasoning: string[];
        decisions: string[];
    };
    error?: string;
}

// Callback types for streaming events
export type OnRoundCallback = (round: number, maxRounds: number, phase: "start" | "end" | "synthesis") => void;

export async function executeOrchestration(
    conversationId: string,
    userInput: string,
    agents: AgentConfig[],
    mode: OrchestrationMode,
    previousMessages: AgentMessage[] = [],
    enableDebug: boolean = false,
    maxRounds: number = 3,
    apiKeys: ApiKeysMap = {},
    userId?: string,
    onToken?: OnTokenCallback,
    onRound?: OnRoundCallback,
    localAccess?: {
        localFileAccessEnabled?: boolean;
        commandExecutionEnabled?: boolean;
        fileAccessBaseDir?: string;
        workspaceQuotaMb?: number;
        hostedSandbox?: boolean;
    },
    enableMemoryHooks: boolean = false
): Promise<OrchestrationResult> {
    // Sort agents by priority
    const sortedAgents = [...agents].sort((a, b) => (b.priority || 50) - (a.priority || 50));

    // Apply memory hooks if enabled and userId is available
    let enhancedAgents = sortedAgents;
    let memoryInjection: { memoriesFound: number; memoryContext: string } | null = null;

    if (enableMemoryHooks && userId && sortedAgents.length > 0) {
        try {
            // Get the primary agent's system prompt for memory context
            const primaryAgent = sortedAgents[0];
            const agentContext: AgentContext = {
                userId,
                conversationId,
                input: userInput,
                systemPrompt: primaryAgent.systemPrompt || "",
            };

            // Call beforeAgentStart to inject memories
            const injection = await beforeAgentStart(agentContext);
            memoryInjection = {
                memoriesFound: injection.memoriesFound,
                memoryContext: injection.memoryContext,
            };

            if (injection.memoriesFound > 0) {
                // Enhance the primary agent's system prompt with memory context
                enhancedAgents = sortedAgents.map((agent, index) => {
                    if (index === 0) {
                        return {
                            ...agent,
                            systemPrompt: injection.systemPrompt,
                        };
                    }
                    return agent;
                });
                console.log(`[Orchestration] Injected ${injection.memoriesFound} memories for user ${userId.slice(0, 8)}`);
            }
        } catch (error) {
            console.error("[Orchestration] Memory hooks error (beforeAgentStart):", error);
            // Continue without memory hooks on error
        }
    }

    const initialState: Partial<AgentGraphState> = {
        conversationId,
        messages: previousMessages,
        activeAgents: enhancedAgents,
        orchestrationMode: mode,
        currentAgentIndex: 0,
        round: 0,
        maxRounds,
        isComplete: false,
        userInput,
        debug: enableDebug ? { reasoning: [], decisions: [] } : undefined,
        apiKeys, // Include API keys in state
        userId, // Include userId for tool context
        localFileAccessEnabled: localAccess?.localFileAccessEnabled ?? false,
        commandExecutionEnabled: localAccess?.commandExecutionEnabled ?? false,
        fileAccessBaseDir: localAccess?.fileAccessBaseDir,
        workspaceQuotaMb: localAccess?.workspaceQuotaMb,
        hostedSandbox: localAccess?.hostedSandbox,
    };

    try {
        let graph;

        switch (mode) {
            case "single":
                graph = buildSingleAgentGraph(onToken);
                break;
            case "sequential":
                graph = buildSequentialGraph(onToken);
                break;
            case "parallel":
                graph = buildParallelGraph(onToken);
                break;
            case "hierarchical":
                graph = buildHierarchicalGraph(onToken);
                break;
            case "consensus":
                graph = buildConsensusGraph(onToken, onRound);
                break;
            case "auto":
                graph = buildAutoRouterGraph(onToken);
                break;
            default:
                graph = buildSingleAgentGraph(onToken);
        }

        const result = await graph.invoke(initialState);

        // Filter to only new messages
        const newMessages = result.messages.filter(
            (m: AgentMessage) => !previousMessages.some(pm =>
                pm.agentId === m.agentId &&
                pm.timestamp === m.timestamp
            )
        );

        // Apply memory hooks after agent execution if enabled
        if (enableMemoryHooks && userId && newMessages.length > 0) {
            try {
                // Get the last assistant message for fact capture
                const lastAssistantMessage = newMessages.filter(m => m.role === "assistant").pop();
                if (lastAssistantMessage) {
                    const agentContext: AgentContext = {
                        userId,
                        conversationId,
                        input: userInput,
                        systemPrompt: sortedAgents[0]?.systemPrompt || "",
                    };

                    const agentResponse: AgentResponse = {
                        output: lastAssistantMessage.content,
                        tokensUsed: lastAssistantMessage.metadata?.inputTokens
                            ? {
                                input: lastAssistantMessage.metadata.inputTokens as number,
                                output: (lastAssistantMessage.metadata.outputTokens as number) || 0,
                            }
                            : undefined,
                    };

                    const factCapture = await afterAgentEnd(agentContext, agentResponse);
                    if (factCapture.captured) {
                        console.log(`[Orchestration] Captured ${factCapture.facts?.length || 0} facts for user ${userId.slice(0, 8)}`);
                    }
                }
            } catch (error) {
                console.error("[Orchestration] Memory hooks error (afterAgentEnd):", error);
                // Continue without error - fact capture is non-critical
            }
        }

        return {
            messages: newMessages,
            mode,
            debug: enableDebug ? result.debug : undefined,
        };
    } catch (error) {
        console.error("Orchestration error:", error);
        return {
            messages: [],
            mode,
            error: error instanceof Error ? error.message : "Unknown orchestration error",
        };
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function agentMessagesToUIMessages(messages: AgentMessage[]) {
    return messages.map((msg) => ({
        id: `${msg.agentId}-${msg.timestamp.getTime()}`,
        role: msg.role,
        content: msg.content,
        createdAt: msg.timestamp,
        metadata: {
            agentId: msg.agentId,
            agentName: msg.agentName,
            ...msg.metadata,
        },
    }));
}

export function getActiveAgents(agents: AgentConfig[]): AgentConfig[] {
    return agents.filter(a => a.isActive);
}
