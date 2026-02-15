/**
 * Workflow Resume API
 *
 * POST: Resume a paused workflow after approval
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { workflowExecutor } from "@/lib/workflows/executor";
import { z } from "zod";

const resumeWorkflowSchema = z.object({
    resumeToken: z.string().min(1),
    approved: z.boolean(),
    comment: z.string().optional(),
});

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
        const validated = resumeWorkflowSchema.parse(body);

        // Resume workflow
        const result = await workflowExecutor.resume({
            resumeToken: validated.resumeToken,
            approved: validated.approved,
            comment: validated.comment,
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
        console.error("[Workflows API] Resume error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to resume workflow" },
            { status: 500 }
        );
    }
}
