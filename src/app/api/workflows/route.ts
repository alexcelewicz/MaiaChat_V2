/**
 * Workflows API
 *
 * Endpoints:
 * - GET: List workflows
 * - POST: Create a new workflow
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { workflows, workflowRuns } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import type { WorkflowDefinition } from "@/lib/workflows/types";

// ============================================================================
// Validation Schemas
// ============================================================================

const createWorkflowSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    definition: z.object({
        version: z.string().default("1.0.0"),
        steps: z.array(z.object({
            id: z.string(),
            name: z.string(),
            type: z.enum(["tool", "llm", "condition", "approval", "transform"]),
            tool: z.string().optional(),
            action: z.string().optional(),
            args: z.record(z.string(), z.unknown()).optional(),
            prompt: z.string().optional(),
            model: z.string().optional(),
            condition: z.string().optional(),
            approval: z.object({
                required: z.boolean(),
                prompt: z.string(),
                timeout: z.number().optional(),
                items: z.array(z.unknown()).optional(),
            }).optional(),
            transform: z.object({
                input: z.string(),
                output: z.string(),
                expression: z.string(),
            }).optional(),
            onSuccess: z.string().optional(),
            onFailure: z.string().optional(),
            continueOnError: z.boolean().optional(),
        })),
        trigger: z.object({
            type: z.enum(["manual", "schedule", "event"]),
            config: z.record(z.string(), z.unknown()).optional(),
        }).optional(),
        variables: z.record(z.string(), z.unknown()).optional(),
        input: z.object({
            required: z.array(z.string()).optional(),
            optional: z.array(z.string()).optional(),
        }).optional(),
    }),
    status: z.enum(["draft", "active", "paused", "archived"]).default("draft"),
    isTemplate: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
});

// ============================================================================
// GET /api/workflows
// ============================================================================

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const searchParams = request.nextUrl.searchParams;
        const status = searchParams.get("status");
        const includeTemplates = searchParams.get("templates") === "true";

        let query = db
            .select()
            .from(workflows)
            .where(eq(workflows.userId, session.user.id))
            .orderBy(desc(workflows.updatedAt));

        const results = await query;

        const recentRuns = await db
            .select()
            .from(workflowRuns)
            .where(eq(workflowRuns.userId, session.user.id))
            .orderBy(desc(workflowRuns.createdAt))
            .limit(20);

        // Filter by status if provided
        let filtered = results;
        if (status) {
            filtered = results.filter((w) => w.status === status);
        }
        if (!includeTemplates) {
            filtered = filtered.filter((w) => !w.isTemplate);
        }

        return NextResponse.json({
            workflows: filtered.map((w) => ({
                id: w.id,
                name: w.name,
                description: w.description,
                status: w.status,
                isTemplate: w.isTemplate,
                tags: w.tags,
                stepCount: (w.definition as WorkflowDefinition).steps.length,
                createdAt: w.createdAt,
                updatedAt: w.updatedAt,
            })),
            recentRuns: recentRuns.map((run) => ({
                id: run.id,
                workflowId: run.workflowId,
                status: run.status,
                startedAt: run.startedAt,
                completedAt: run.completedAt,
                error: run.error,
            })),
        });
    } catch (error) {
        console.error("[Workflows API] GET error:", error);
        return NextResponse.json(
            { error: "Failed to list workflows" },
            { status: 500 }
        );
    }
}

// ============================================================================
// POST /api/workflows
// ============================================================================

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = await request.json();
        const validated = createWorkflowSchema.parse(body);

        const [workflow] = await db
            .insert(workflows)
            .values({
                userId: session.user.id,
                name: validated.name,
                description: validated.description,
                definition: validated.definition,
                status: validated.status,
                isTemplate: validated.isTemplate,
                tags: validated.tags,
            })
            .returning();

        return NextResponse.json({
            workflow: {
                id: workflow.id,
                name: workflow.name,
                description: workflow.description,
                status: workflow.status,
                isTemplate: workflow.isTemplate,
                tags: workflow.tags,
                definition: workflow.definition,
                createdAt: workflow.createdAt,
                updatedAt: workflow.updatedAt,
            },
        });
    } catch (error) {
        console.error("[Workflows API] POST error:", error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Invalid workflow data", details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: "Failed to create workflow" },
            { status: 500 }
        );
    }
}
