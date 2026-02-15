import { z } from "zod";
import type { Tool, ToolResult, ToolContext } from "./types";
import { db } from "@/lib/db";
import { workflows, workflowRuns } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { workflowExecutor } from "@/lib/workflows/executor";

const workflowToolSchema = z.object({
    action: z.enum(["list", "get", "run", "resume", "runs"]).describe(
        "Action to perform: list workflows, get a workflow, run a workflow, resume a workflow, or list runs"
    ),
    workflowId: z.string().uuid().optional().describe("Workflow ID (required for get/run actions)"),
    runId: z.string().uuid().optional().describe("Workflow run ID (required for runs when filtering)"),
    status: z.enum(["draft", "active", "paused", "archived"]).optional().describe("Filter by workflow status"),
    includeTemplates: z.boolean().optional().describe("Include workflow templates in results"),
    input: z.record(z.string(), z.unknown()).optional().describe("Input payload for workflow run"),
    resumeToken: z.string().optional().describe("Resume token for approval-gated runs"),
    approved: z.boolean().optional().describe("Approval decision for resume action"),
    comment: z.string().optional().describe("Optional approval comment"),
    limit: z.number().int().min(1).max(50).optional().describe("Max results for list/runs"),
});

type WorkflowToolInput = z.infer<typeof workflowToolSchema>;

async function executeWorkflowTool(
    params: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    const parsed = workflowToolSchema.safeParse(params);
    if (!parsed.success) {
        return { success: false, error: `Invalid parameters: ${parsed.error.message}` };
    }

    const input = parsed.data as WorkflowToolInput;
    const userId = context?.userId;
    if (!userId) {
        return { success: false, error: "User context required for workflow actions" };
    }

    try {
        switch (input.action) {
            case "list": {
                const statusFilter = input.status;
                const includeTemplates = input.includeTemplates === true;
                const limit = input.limit ?? 25;

                const results = await db
                    .select()
                    .from(workflows)
                    .where(eq(workflows.userId, userId))
                    .orderBy(desc(workflows.updatedAt))
                    .limit(limit);

                const filtered = results.filter((w) => {
                    if (statusFilter && w.status !== statusFilter) return false;
                    if (!includeTemplates && w.isTemplate) return false;
                    return true;
                });

                return {
                    success: true,
                    data: {
                        workflows: filtered.map((w) => ({
                            id: w.id,
                            name: w.name,
                            description: w.description,
                            status: w.status,
                            isTemplate: w.isTemplate,
                            tags: w.tags,
                            stepCount: (w.definition as { steps?: unknown[] })?.steps?.length ?? 0,
                            updatedAt: w.updatedAt,
                        })),
                    },
                };
            }

            case "get": {
                if (!input.workflowId) {
                    return { success: false, error: "workflowId is required for get action" };
                }

                const [workflow] = await db
                    .select()
                    .from(workflows)
                    .where(and(eq(workflows.id, input.workflowId), eq(workflows.userId, userId)))
                    .limit(1);

                if (!workflow) {
                    return { success: false, error: "Workflow not found" };
                }

                return { success: true, data: { workflow } };
            }

            case "run": {
                if (!input.workflowId) {
                    return { success: false, error: "workflowId is required for run action" };
                }

                const [workflow] = await db
                    .select()
                    .from(workflows)
                    .where(and(eq(workflows.id, input.workflowId), eq(workflows.userId, userId)))
                    .limit(1);

                if (!workflow) {
                    return { success: false, error: "Workflow not found" };
                }

                if (workflow.status === "archived") {
                    return { success: false, error: "Cannot run archived workflow" };
                }

                const result = await workflowExecutor.execute({
                    workflowId: workflow.id,
                    userId,
                    input: input.input,
                });

                return { success: true, data: result };
            }

            case "resume": {
                if (!input.resumeToken) {
                    return { success: false, error: "resumeToken is required for resume action" };
                }
                if (typeof input.approved !== "boolean") {
                    return { success: false, error: "approved is required for resume action" };
                }

                const result = await workflowExecutor.resume({
                    resumeToken: input.resumeToken,
                    approved: input.approved,
                    comment: input.comment,
                });

                return { success: true, data: result };
            }

            case "runs": {
                const limit = input.limit ?? 10;
                const whereClause = input.workflowId
                    ? and(eq(workflowRuns.userId, userId), eq(workflowRuns.workflowId, input.workflowId))
                    : eq(workflowRuns.userId, userId);

                const runs = await db
                    .select()
                    .from(workflowRuns)
                    .where(whereClause)
                    .orderBy(desc(workflowRuns.createdAt))
                    .limit(limit);

                return {
                    success: true,
                    data: {
                        runs: runs.map((run) => ({
                            id: run.id,
                            workflowId: run.workflowId,
                            status: run.status,
                            startedAt: run.startedAt,
                            completedAt: run.completedAt,
                            error: run.error,
                        })),
                    },
                };
            }

            default:
                return { success: false, error: `Unknown action: ${input.action}` };
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Workflow tool execution failed",
        };
    }
}

export const workflowTool: Tool = {
    id: "workflow",
    name: "Workflow",
    description: `Create, run, and manage deterministic workflows.

Actions:
- list: List workflows
- get: Fetch a workflow by ID
- run: Execute a workflow
- resume: Resume a paused workflow after approval
- runs: List recent workflow runs`,
    category: "utility",
    icon: "workflow",
    schema: workflowToolSchema,
    execute: executeWorkflowTool,
};
