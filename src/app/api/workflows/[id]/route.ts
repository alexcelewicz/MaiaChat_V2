/**
 * Workflow Detail API
 *
 * Endpoints:
 * - GET: Get workflow details
 * - PUT: Update workflow
 * - DELETE: Delete workflow
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { workflows, workflowRuns } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

// ============================================================================
// Validation
// ============================================================================

const updateWorkflowSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    definition: z.object({
        version: z.string(),
        steps: z.array(z.any()),
        trigger: z.object({
            type: z.enum(["manual", "schedule", "event"]),
            config: z.record(z.string(), z.unknown()).optional(),
        }).optional(),
        variables: z.record(z.string(), z.unknown()).optional(),
        input: z.any().optional(),
    }).optional(),
    status: z.enum(["draft", "active", "paused", "archived"]).optional(),
    tags: z.array(z.string()).optional(),
});

// ============================================================================
// GET /api/workflows/[id]
// ============================================================================

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { id } = await params;

        const [workflow] = await db
            .select()
            .from(workflows)
            .where(
                and(
                    eq(workflows.id, id),
                    eq(workflows.userId, session.user.id)
                )
            )
            .limit(1);

        if (!workflow) {
            return NextResponse.json(
                { error: "Workflow not found" },
                { status: 404 }
            );
        }

        // Get recent runs
        const recentRuns = await db
            .select()
            .from(workflowRuns)
            .where(eq(workflowRuns.workflowId, id))
            .orderBy(desc(workflowRuns.createdAt))
            .limit(10);

        return NextResponse.json({
            workflow: {
                ...workflow,
                recentRuns: recentRuns.map((run) => ({
                    id: run.id,
                    status: run.status,
                    startedAt: run.startedAt,
                    completedAt: run.completedAt,
                    error: run.error,
                })),
            },
        });
    } catch (error) {
        console.error("[Workflows API] GET [id] error:", error);
        return NextResponse.json(
            { error: "Failed to get workflow" },
            { status: 500 }
        );
    }
}

// ============================================================================
// PUT /api/workflows/[id]
// ============================================================================

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { id } = await params;
        const body = await request.json();
        const validated = updateWorkflowSchema.parse(body);

        // Check ownership
        const [existing] = await db
            .select()
            .from(workflows)
            .where(
                and(
                    eq(workflows.id, id),
                    eq(workflows.userId, session.user.id)
                )
            )
            .limit(1);

        if (!existing) {
            return NextResponse.json(
                { error: "Workflow not found" },
                { status: 404 }
            );
        }

        // Update
        const [updated] = await db
            .update(workflows)
            .set({
                ...validated,
                updatedAt: new Date(),
            })
            .where(eq(workflows.id, id))
            .returning();

        return NextResponse.json({
            workflow: updated,
        });
    } catch (error) {
        console.error("[Workflows API] PUT error:", error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Invalid workflow data", details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: "Failed to update workflow" },
            { status: 500 }
        );
    }
}

// ============================================================================
// DELETE /api/workflows/[id]
// ============================================================================

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { id } = await params;

        // Check ownership
        const [existing] = await db
            .select()
            .from(workflows)
            .where(
                and(
                    eq(workflows.id, id),
                    eq(workflows.userId, session.user.id)
                )
            )
            .limit(1);

        if (!existing) {
            return NextResponse.json(
                { error: "Workflow not found" },
                { status: 404 }
            );
        }

        // Delete (cascade will handle runs and approvals)
        await db.delete(workflows).where(eq(workflows.id, id));

        return NextResponse.json({
            success: true,
            message: "Workflow deleted",
        });
    } catch (error) {
        console.error("[Workflows API] DELETE error:", error);
        return NextResponse.json(
            { error: "Failed to delete workflow" },
            { status: 500 }
        );
    }
}
