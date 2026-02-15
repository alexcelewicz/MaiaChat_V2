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
import { agentConfigSchema } from "@/types/agent";

// Schema for updating agent
const updateAgentSchema = agentConfigSchema.partial();

// GET /api/agents/[id] - Get a single agent
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id } = await params;

        // Get the agent - now check userId directly
        const agent = await db.query.agents.findFirst({
            where: and(
                eq(agents.id, id),
                eq(agents.userId, userId)
            ),
        });

        if (!agent) {
            return NextResponse.json(
                { error: "Agent not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            agent: {
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
            },
        });
    } catch (error) {
        console.error("Get agent error:", error);
        return NextResponse.json(
            { error: "Failed to get agent", code: "GET_FAILED" },
            { status: 500 }
        );
    }
}

// PATCH /api/agents/[id] - Update an agent
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id } = await params;

        // Get the agent - check userId directly
        const existingAgent = await db.query.agents.findFirst({
            where: and(
                eq(agents.id, id),
                eq(agents.userId, userId)
            ),
        });

        if (!existingAgent) {
            return NextResponse.json(
                { error: "Agent not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        const body = await request.json();
        const parseResult = updateAgentSchema.safeParse(body);

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

        const updates = parseResult.data;
        const existingConfig = (existingAgent.config as Record<string, unknown>) || {};

        // Build update object
        const updateValues: Record<string, unknown> = {};

        if (updates.name !== undefined) updateValues.name = updates.name;
        if (updates.role !== undefined) updateValues.role = updates.role;
        if (updates.provider !== undefined) updateValues.modelProvider = updates.provider;
        if (updates.modelId !== undefined) updateValues.modelId = updates.modelId;
        if (updates.systemPrompt !== undefined) updateValues.systemPrompt = updates.systemPrompt;

        // Merge config updates
        const configUpdates: Record<string, unknown> = {};
        if (updates.temperature !== undefined) configUpdates.temperature = updates.temperature;
        if (updates.maxTokens !== undefined) configUpdates.maxTokens = updates.maxTokens;
        if (updates.tools !== undefined) configUpdates.tools = updates.tools;
        if (updates.canSeeOtherAgents !== undefined) configUpdates.canSeeOtherAgents = updates.canSeeOtherAgents;
        if (updates.priority !== undefined) configUpdates.priority = updates.priority;
        if (updates.isActive !== undefined) configUpdates.isActive = updates.isActive;
        if (updates.description !== undefined) configUpdates.description = updates.description;
        if (updates.metadata !== undefined) configUpdates.metadata = updates.metadata;

        if (Object.keys(configUpdates).length > 0) {
            updateValues.config = { ...existingConfig, ...configUpdates };
        }

        // Update the agent
        const [updatedAgent] = await db
            .update(agents)
            .set(updateValues)
            .where(eq(agents.id, id))
            .returning();

        if (!updatedAgent) {
            return NextResponse.json(
                { error: "Failed to update agent", code: "UPDATE_FAILED" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            agent: {
                id: updatedAgent.id,
                name: updatedAgent.name,
                role: updatedAgent.role,
                provider: updatedAgent.modelProvider,
                modelId: updatedAgent.modelId,
                systemPrompt: updatedAgent.systemPrompt,
                config: updatedAgent.config,
                isTemplate: updatedAgent.isTemplate,
                conversationId: updatedAgent.conversationId,
                createdAt: updatedAgent.createdAt,
            },
        });
    } catch (error) {
        console.error("Update agent error:", error);
        return NextResponse.json(
            { error: "Failed to update agent", code: "UPDATE_FAILED" },
            { status: 500 }
        );
    }
}

// DELETE /api/agents/[id] - Delete an agent
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id } = await params;

        // Get the agent - check userId directly
        const existingAgent = await db.query.agents.findFirst({
            where: and(
                eq(agents.id, id),
                eq(agents.userId, userId)
            ),
        });

        if (!existingAgent) {
            return NextResponse.json(
                { error: "Agent not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        // Delete the agent
        await db.delete(agents).where(eq(agents.id, id));

        return NextResponse.json({
            success: true,
            message: "Agent deleted",
        });
    } catch (error) {
        console.error("Delete agent error:", error);
        return NextResponse.json(
            { error: "Failed to delete agent", code: "DELETE_FAILED" },
            { status: 500 }
        );
    }
}
