import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { agentConfigSchema, PRESET_AGENTS } from "@/types/agent";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

// Schema for creating agent
const createAgentSchema = agentConfigSchema.extend({
    conversationId: z.string().uuid().optional().nullable(),
    isTemplate: z.boolean().optional(),
});

// GET /api/agents - List agent configurations
// Query params:
// - conversationId: Get agents for specific conversation
// - templates: "true" to get user's reusable templates
// - includePresets: "true" to include preset agents
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

        // Parse query parameters
        const { searchParams } = new URL(request.url);
        const includePresets = searchParams.get("includePresets") === "true";
        const conversationId = searchParams.get("conversationId");
        const templatesOnly = searchParams.get("templates") === "true";

        let userAgents: typeof agents.$inferSelect[] = [];

        if (conversationId) {
            // Get agents for a specific conversation
            userAgents = await db.query.agents.findMany({
                where: and(
                    eq(agents.conversationId, conversationId),
                    eq(agents.userId, userId)
                ),
                orderBy: (agents, { desc }) => [desc(agents.createdAt)],
            });
        }

        if (templatesOnly || !conversationId) {
            // Get user's reusable templates (no conversationId, isTemplate=true)
            const templates = await db.query.agents.findMany({
                where: and(
                    eq(agents.userId, userId),
                    eq(agents.isTemplate, true),
                    isNull(agents.conversationId)
                ),
                orderBy: (agents, { desc }) => [desc(agents.createdAt)],
            });

            // If we only want templates, replace; otherwise append
            if (templatesOnly) {
                userAgents = templates;
            } else if (!conversationId) {
                userAgents = templates;
            }
        }

        // Format response
        const formattedAgents = userAgents.map((agent) => ({
            id: agent.id,
            name: agent.name,
            role: agent.role,
            provider: agent.modelProvider,
            modelId: agent.modelId,
            systemPrompt: agent.systemPrompt,
            config: agent.config,
            isTemplate: agent.isTemplate,
            conversationId: agent.conversationId,
            createdAt: agent.createdAt,
        }));

        // Optionally include preset agents
        const presets = includePresets
            ? Object.entries(PRESET_AGENTS).map(([key, preset]) => ({
                id: `preset-${key}`,
                isPreset: true,
                ...preset,
            }))
            : [];

        return NextResponse.json({
            success: true,
            agents: formattedAgents,
            presets,
        });
    } catch (error) {
        console.error("List agents error:", error);
        return NextResponse.json(
            { error: "Failed to list agents", code: "LIST_FAILED" },
            { status: 500 }
        );
    }
}

// POST /api/agents - Create a new agent configuration
// Body:
// - conversationId (optional): If provided, agent is for that conversation
// - isTemplate (optional): If true and no conversationId, creates a reusable template
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
        const parseResult = createAgentSchema.safeParse(body);

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

        const { conversationId, isTemplate, ...agentConfig } = parseResult.data;

        // Determine if this is a template or conversation-specific agent
        const isAgentTemplate = isTemplate || !conversationId;

        // Create the agent
        const [newAgent] = await db
            .insert(agents)
            .values({
                id: uuidv4(),
                userId,
                conversationId: conversationId || null,
                isTemplate: isAgentTemplate,
                name: agentConfig.name,
                role: agentConfig.role,
                modelProvider: agentConfig.provider,
                modelId: agentConfig.modelId,
                systemPrompt: agentConfig.systemPrompt,
                config: {
                    temperature: agentConfig.temperature,
                    maxTokens: agentConfig.maxTokens,
                    tools: agentConfig.tools,
                    canSeeOtherAgents: agentConfig.canSeeOtherAgents,
                    priority: agentConfig.priority,
                    isActive: agentConfig.isActive,
                    description: agentConfig.description,
                    metadata: agentConfig.metadata,
                },
            })
            .returning();

        if (!newAgent) {
            return NextResponse.json(
                { error: "Failed to create agent", code: "CREATE_FAILED" },
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
                isTemplate: newAgent.isTemplate,
                conversationId: newAgent.conversationId,
                createdAt: newAgent.createdAt,
            },
        });
    } catch (error) {
        console.error("Create agent error:", error);
        return NextResponse.json(
            { error: "Failed to create agent", code: "CREATE_FAILED" },
            { status: 500 }
        );
    }
}
