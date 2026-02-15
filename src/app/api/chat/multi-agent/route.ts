import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conversations, messages, agents } from "@/lib/db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { executeOrchestration, agentMessagesToUIMessages } from "@/lib/agents/graph";
import { orchestrationModeSchema, type AgentConfig, type AgentMessage, type OrchestrationMode } from "@/types/agent";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import { generateConversationTitle } from "@/lib/ai/summary";
import { getLocalAccessContext } from "@/lib/admin/settings";

// Request schema
const multiAgentChatSchema = z.object({
    conversationId: z.string().uuid().optional(),
    message: z.string().min(1).max(100000),
    orchestrationMode: orchestrationModeSchema.default("sequential"),
    agentIds: z.array(z.string().uuid()).optional(), // Specific agents to use
    enableDebug: z.boolean().default(false),
    maxRounds: z.number().min(1).max(10).default(3),
    // Tool usage options
    toolsEnabled: z.boolean().optional().default(false),
    enabledTools: z.array(z.string()).optional(),
    // Skills/plugin options
    skillsEnabled: z.boolean().optional().default(false),
    enabledSkills: z.array(z.string()).optional(),
});

// POST /api/chat/multi-agent - Multi-agent chat endpoint
export async function POST(request: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "chat", RATE_LIMITS.chat);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.chat);
        }

        // Parse request body
        const body = await request.json();
        const parseResult = multiAgentChatSchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json(
                {
                    error: "Validation failed",
                    code: "VALIDATION_ERROR",
                    details: parseResult.error.flatten().fieldErrors,
                },
                { status: 400 }
            );
        }

        const { conversationId: requestedConvId, message, orchestrationMode, agentIds, enableDebug, maxRounds, toolsEnabled, enabledTools, skillsEnabled, enabledSkills } = parseResult.data;
        let conversationId = requestedConvId;

        // Create conversation if not provided
        if (!conversationId) {
            const [newConversation] = await db
                .insert(conversations)
                .values({
                    userId,
                    title: message.slice(0, 100) + (message.length > 100 ? "..." : ""),
                })
                .returning({ id: conversations.id });
            if (!newConversation) {
                return NextResponse.json(
                    { error: "Failed to create conversation", code: "CREATE_FAILED" },
                    { status: 500 }
                );
            }
            conversationId = newConversation.id;
        } else {
            // Verify conversation ownership
            const conversation = await db.query.conversations.findFirst({
                where: and(
                    eq(conversations.id, conversationId),
                    eq(conversations.userId, userId),
                    isNull(conversations.deletedAt)
                ),
            });

            if (!conversation) {
                return NextResponse.json(
                    { error: "Conversation not found", code: "NOT_FOUND" },
                    { status: 404 }
                );
            }
        }

        // Get agents for this conversation
        let conversationAgents = await db.query.agents.findMany({
            where: eq(agents.conversationId, conversationId),
            orderBy: [asc(agents.createdAt)],
        });

        // Filter by agentIds if provided
        if (agentIds && agentIds.length > 0) {
            conversationAgents = conversationAgents.filter((a) => agentIds.includes(a.id));
        }

        // Convert DB agents to AgentConfig format
        const agentConfigs: AgentConfig[] = conversationAgents.map((agent) => {
            const config = (agent.config as Record<string, unknown>) || {};

            // Dynamic tool injection: If toolsEnabled is true in request, ensure relevant tools are added
            // This is a simplified logic: if global tools are on, we might want to give them to all agents or specific ones.
            // For now, we'll preserve existing config tools and append standard ones if requested
            let agentTools = (config.tools as string[]) || [];

            if (toolsEnabled && !agentTools.includes("web_search")) {
                // For now, let's assume we want to give web_search capability if tools are enabled globally
                // A better approach might be to respecting the specific enabledTools list
                if (enabledTools && enabledTools.includes("web_search")) {
                    agentTools = [...agentTools, "web_search"];
                }
            }

            // Plugin/Skill injection: If skillsEnabled is true in request, ensure "skill" tool type is added
            if (skillsEnabled && !agentTools.includes("skill")) {
                agentTools = [...agentTools, "skill"];
            }

            return {
                id: agent.id,
                name: agent.name,
                role: agent.role as AgentConfig["role"],
                provider: agent.modelProvider as AgentConfig["provider"],
                modelId: agent.modelId,
                systemPrompt: agent.systemPrompt || undefined,
                description: config.description as string || "",
                temperature: (config.temperature as number) || 0.7,
                maxTokens: config.maxTokens as number || undefined,
                tools: agentTools as AgentConfig["tools"],
                canSeeOtherAgents: (config.canSeeOtherAgents as boolean) ?? true,
                priority: (config.priority as number) || 50,
                isActive: (config.isActive as boolean) ?? true,
            };
        });

        // Filter to only active agents
        const activeAgents = agentConfigs.filter((a) => a.isActive);

        if (activeAgents.length === 0) {
            return NextResponse.json(
                { error: "No active agents configured for this conversation", code: "NO_AGENTS" },
                { status: 400 }
            );
        }

        // Get user API keys for model access
        const userApiKeys = await getUserApiKeys(userId);

        // Check if user has at least one API key configured or is using local models
        const localProviders = ["ollama", "lmstudio"];
        const usesLocalModels = activeAgents.some(a => localProviders.includes(a.provider));
        const hasAnyKey = Object.values(userApiKeys).some(key => !!key);
        if (!hasAnyKey && !usesLocalModels) {
            return NextResponse.json(
                { error: "No API keys configured. Please add your API keys in Settings.", code: "API_KEY_MISSING" },
                { status: 400 }
            );
        }

        // Verify each agent's provider has an API key (skip local providers)
        const missingProviders = new Set<string>();
        for (const agent of activeAgents) {
            // Skip local providers - they don't need API keys
            if (localProviders.includes(agent.provider)) {
                continue;
            }
            if (!userApiKeys[agent.provider as keyof typeof userApiKeys]) {
                missingProviders.add(agent.provider);
            }
        }

        if (missingProviders.size > 0) {
            return NextResponse.json(
                {
                    error: `Missing API key(s) for provider(s): ${Array.from(missingProviders).join(", ")}. Please add your API keys in Settings.`,
                    code: "API_KEY_MISSING"
                },
                { status: 400 }
            );
        }

        // Save user message to database
        const userMessageId = uuidv4();
        await db.insert(messages).values({
            id: userMessageId,
            conversationId,
            role: "user",
            content: message,
        });

        // Get previous messages for context
        const previousMessages = await db.query.messages.findMany({
            where: eq(messages.conversationId, conversationId),
            orderBy: [asc(messages.createdAt)],
        });

        // Convert to AgentMessage format for orchestration
        const historyMessages: AgentMessage[] = previousMessages.map((m) => ({
            agentId: m.agentId || "user",
            agentName: m.role === "user" ? "User" : "Assistant",
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
            timestamp: m.createdAt,
            metadata: (m.metadata as Record<string, unknown>) || undefined,
        }));

        // Get local access context for tool execution
        const localAccess = await getLocalAccessContext(userId);

        // Initialize streaming response
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Send initial conversation ID
                    const initData = JSON.stringify({
                        type: "init",
                        conversationId,
                        agentCount: activeAgents.length
                    });
                    controller.enqueue(encoder.encode(initData + "\n"));

                    // Track which agent is currently streaming
                    let currentStreamingAgent: string | null = null;

                    // Execute multi-agent orchestration with streaming
                    const result = await executeOrchestration(
                        conversationId,
                        message,
                        activeAgents,
                        orchestrationMode as OrchestrationMode,
                        historyMessages,
                        enableDebug,
                        maxRounds, // User-configurable discussion rounds
                        userApiKeys, // Pass user API keys for model access
                        userId, // Pass userId for tool context
                        // onToken callback - streams individual tokens
                        (token, agentId, agentName) => {
                            // Emit agent_start when switching to a new agent
                            if (currentStreamingAgent !== agentId) {
                                // End previous agent if there was one
                                if (currentStreamingAgent) {
                                    const endData = JSON.stringify({
                                        type: "agent_end",
                                        agentId: currentStreamingAgent
                                    });
                                    controller.enqueue(encoder.encode(endData + "\n"));
                                }

                                // Start new agent
                                currentStreamingAgent = agentId;
                                const startData = JSON.stringify({
                                    type: "agent_start",
                                    agentId,
                                    agentName
                                });
                                controller.enqueue(encoder.encode(startData + "\n"));
                            }

                            // Stream token to client
                            const data = JSON.stringify({
                                type: "token",
                                agentId,
                                agentName,
                                content: token
                            });
                            controller.enqueue(encoder.encode(data + "\n"));
                        },
                        // onRound callback - emits round progress events (for consensus mode)
                        (round, maxRounds, phase) => {
                            const roundData = JSON.stringify({
                                type: "round",
                                round,
                                maxRounds,
                                phase // "start" | "end" | "synthesis"
                            });
                            controller.enqueue(encoder.encode(roundData + "\n"));
                        },
                        // Pass local access context for file/shell tools
                        localAccess,
                        // Enable memory hooks for web chat (recall memories & capture facts)
                        true
                    );

                    // End the last streaming agent if there was one
                    if (currentStreamingAgent) {
                        const endData = JSON.stringify({
                            type: "agent_end",
                            agentId: currentStreamingAgent
                        });
                        controller.enqueue(encoder.encode(endData + "\n"));
                    }

                    if (result.error) {
                        const errorData = JSON.stringify({
                            type: "error",
                            error: result.error
                        });
                        controller.enqueue(encoder.encode(errorData + "\n"));
                    } else {
                        // Save agent responses to database (fire-and-forget, don't block stream)
                        Promise.all(
                            result.messages.map((agentMessage) =>
                                db.insert(messages).values({
                                    id: uuidv4(),
                                    conversationId,
                                    agentId: agentMessage.agentId !== "unknown" ? agentMessage.agentId : null,
                                    role: "assistant",
                                    content: agentMessage.content,
                                    metadata: {
                                        agentName: agentMessage.agentName,
                                        ...agentMessage.metadata,
                                    },
                                })
                            )
                        ).catch((err) => {
                            console.error("[MultiAgent] Failed to save agent messages:", err);
                        });

                        // Generate AI title for first message in conversation
                        const isFirstMessage = previousMessages.filter(m => m.role === "user").length <= 1;
                        if (isFirstMessage && result.messages.length > 0) {
                            const firstResponse = result.messages[0]?.content || "";
                            generateConversationTitle(message, firstResponse, userApiKeys)
                                .then(async (title) => {
                                    await db.update(conversations)
                                        .set({ title, updatedAt: new Date() })
                                        .where(eq(conversations.id, conversationId));
                                })
                                .catch((err) => console.error("Title generation failed:", err));
                        }

                        // Convert to UI format
                        const uiMessages = agentMessagesToUIMessages(result.messages);

                        // Send completion event with full messages (just in case UI missed chunks or needs full state)
                        const completeData = JSON.stringify({
                            type: "complete",
                            messages: uiMessages,
                            orchestrationMode: result.mode,
                            debug: result.debug
                        });
                        controller.enqueue(encoder.encode(completeData + "\n"));
                    }
                } catch (error) {
                    console.error("Streaming orchestration error:", error);
                    const errorData = JSON.stringify({
                        type: "error",
                        error: error instanceof Error ? error.message : "Unknown streaming error"
                    });
                    controller.enqueue(encoder.encode(errorData + "\n"));
                } finally {
                    controller.close();
                }
            }
        });

        return new NextResponse(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Transfer-Encoding": "chunked",
            },
        });

    } catch (error) {
        console.error("Multi-agent chat error:", error);
        return NextResponse.json(
            { error: "Failed to process multi-agent chat", code: "CHAT_FAILED" },
            { status: 500 }
        );
    }
}

// GET /api/chat/multi-agent - Get multi-agent conversation info
export async function GET(request: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", RATE_LIMITS.api);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.api);
        }

        const { searchParams } = new URL(request.url);
        const conversationId = searchParams.get("conversationId");

        if (!conversationId) {
            return NextResponse.json(
                { error: "conversationId is required", code: "MISSING_PARAM" },
                { status: 400 }
            );
        }

        // Verify conversation ownership
        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, conversationId),
                eq(conversations.userId, userId),
                isNull(conversations.deletedAt)
            ),
        });

        if (!conversation) {
            return NextResponse.json(
                { error: "Conversation not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        // Get agents for this conversation
        const conversationAgents = await db.query.agents.findMany({
            where: eq(agents.conversationId, conversationId),
            orderBy: [asc(agents.createdAt)],
        });

        // Convert to AgentConfig format
        const agentConfigs = conversationAgents.map((agent) => {
            const config = (agent.config as Record<string, unknown>) || {};
            return {
                id: agent.id,
                name: agent.name,
                role: agent.role,
                provider: agent.modelProvider,
                modelId: agent.modelId,
                systemPrompt: agent.systemPrompt,
                isActive: (config.isActive as boolean) ?? true,
                priority: (config.priority as number) || 50,
            };
        });

        return NextResponse.json({
            success: true,
            conversationId,
            agents: agentConfigs,
            activeCount: agentConfigs.filter((a) => a.isActive).length,
        });
    } catch (error) {
        console.error("Get multi-agent info error:", error);
        return NextResponse.json(
            { error: "Failed to get multi-agent info", code: "GET_FAILED" },
            { status: 500 }
        );
    }
}
