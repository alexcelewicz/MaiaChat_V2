import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const addToConversationSchema = z.object({
    // agentId can be a UUID (for templates) or "preset-xxx" format (for presets)
    agentId: z.string().min(1),
    conversationId: z.string().uuid(),
});

// POST /api/agents/add-to-conversation - Add an agent template to a conversation
// This copies the template to create a conversation-specific agent
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
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", RATE_LIMITS.api);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.api);
        }

        const body = await request.json();
        const parseResult = addToConversationSchema.safeParse(body);

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

        const { agentId, conversationId } = parseResult.data;

        // Check if agent is a preset
        if (agentId.startsWith("preset-")) {
            // Handle preset agents - import from types
            const { PRESET_AGENTS } = await import("@/types/agent");
            const presetKey = agentId.replace("preset-", "");
            const preset = PRESET_AGENTS[presetKey as keyof typeof PRESET_AGENTS];

            if (!preset) {
                return NextResponse.json(
                    { error: "Preset agent not found", code: "NOT_FOUND" },
                    { status: 404 }
                );
            }

            // Create a new agent from the preset
            const [newAgent] = await db
                .insert(agents)
                .values({
                    id: uuidv4(),
                    userId,
                    conversationId,
                    isTemplate: false,
                    name: preset.name,
                    role: preset.role,
                    modelProvider: preset.provider,
                    modelId: preset.modelId,
                    systemPrompt: preset.systemPrompt,
                    config: {
                        temperature: preset.temperature,
                        maxTokens: preset.maxTokens,
                        tools: preset.tools,
                        canSeeOtherAgents: preset.canSeeOtherAgents,
                        priority: preset.priority,
                        isActive: true,
                        description: preset.description,
                    },
                })
                .returning();

            if (!newAgent) {
                return NextResponse.json(
                    { error: "Failed to add agent to conversation", code: "CREATE_FAILED" },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                agent: {
                    id: newAgent.id,
                    name: newAgent.name,
                    role: newAgent.role,
                    provider: newAgent.modelProvider,
                    modelId: newAgent.modelId,
                    systemPrompt: newAgent.systemPrompt,
                    config: newAgent.config,
                    isTemplate: false,
                    conversationId: newAgent.conversationId,
                    createdAt: newAgent.createdAt,
                },
            });
        }

        // Find the template agent
        const templateAgent = await db.query.agents.findFirst({
            where: and(
                eq(agents.id, agentId),
                eq(agents.userId, userId)
            ),
        });

        if (!templateAgent) {
            return NextResponse.json(
                { error: "Agent template not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        // Check if this agent is already in the conversation
        const existingAgent = await db.query.agents.findFirst({
            where: and(
                eq(agents.conversationId, conversationId),
                eq(agents.name, templateAgent.name),
                eq(agents.userId, userId)
            ),
        });

        if (existingAgent) {
            return NextResponse.json({
                success: true,
                agent: {
                    id: existingAgent.id,
                    name: existingAgent.name,
                    role: existingAgent.role,
                    provider: existingAgent.modelProvider,
                    modelId: existingAgent.modelId,
                    systemPrompt: existingAgent.systemPrompt,
                    config: existingAgent.config,
                    isTemplate: false,
                    conversationId: existingAgent.conversationId,
                    createdAt: existingAgent.createdAt,
                },
                message: "Agent already in conversation",
            });
        }

        // Create a copy of the template for this conversation
        const [newAgent] = await db
            .insert(agents)
            .values({
                id: uuidv4(),
                userId,
                conversationId,
                isTemplate: false,
                name: templateAgent.name,
                role: templateAgent.role,
                modelProvider: templateAgent.modelProvider,
                modelId: templateAgent.modelId,
                systemPrompt: templateAgent.systemPrompt,
                config: templateAgent.config,
            })
            .returning();

        if (!newAgent) {
            return NextResponse.json(
                { error: "Failed to add agent to conversation", code: "CREATE_FAILED" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            agent: {
                id: newAgent.id,
                name: newAgent.name,
                role: newAgent.role,
                provider: newAgent.modelProvider,
                modelId: newAgent.modelId,
                systemPrompt: newAgent.systemPrompt,
                config: newAgent.config,
                isTemplate: false,
                conversationId: newAgent.conversationId,
                createdAt: newAgent.createdAt,
            },
        });
    } catch (error) {
        console.error("Add agent to conversation error:", error);
        return NextResponse.json(
            { error: "Failed to add agent to conversation", code: "ADD_FAILED" },
            { status: 500 }
        );
    }
}
