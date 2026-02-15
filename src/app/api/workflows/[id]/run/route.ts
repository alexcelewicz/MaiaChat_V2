/**
 * Workflow Run API
 *
 * POST: Execute a workflow
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { workflowExecutor } from "@/lib/workflows/executor";
import { z } from "zod";

const runWorkflowSchema = z.object({
    input: z.record(z.string(), z.unknown()).optional(),
    dryRun: z.boolean().optional(),
});

export async function POST(
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
        const body = await request.json().catch(() => ({}));
        const validated = runWorkflowSchema.parse(body);

        // Check workflow exists and is active
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

        if (workflow.status !== "active" && workflow.status !== "draft") {
            return NextResponse.json(
                { error: `Cannot run workflow in status: ${workflow.status}` },
                { status: 400 }
            );
        }

        // Execute workflow
        const result = await workflowExecutor.execute({
            workflowId: id,
            userId: session.user.id,
            input: validated.input,
            dryRun: validated.dryRun,
        });

        return NextResponse.json({
            runId: result.runId,
            status: result.status,
            output: result.output,
            error: result.error,
            approval: result.approval,
            completedSteps: result.completedSteps,
            pendingSteps: result.pendingSteps,
        });
    } catch (error) {
        console.error("[Workflows API] Run error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to run workflow" },
            { status: 500 }
        );
    }
}
