/**
 * Workflow Executor
 *
 * Executes deterministic workflow pipelines with:
 * - Step-by-step execution
 * - Approval gates with resumable tokens
 * - Variable interpolation
 * - Error handling and recovery
 */

import { randomBytes, createHash } from "crypto";
import { db } from "@/lib/db";
import { workflows, workflowRuns, workflowApprovals } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { generateText } from "ai";
import { executeTool, type ToolContext, type ToolId } from "@/lib/tools";
import { getLocalAccessContext } from "@/lib/admin/settings";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import { getModelConfig, getModelWithKey } from "@/lib/ai/providers/factory";
import type {
    Workflow,
    WorkflowDefinition,
    WorkflowStep,
    WorkflowRun,
    WorkflowRunState,
    WorkflowRunStatus,
    StepResult,
    ExecuteWorkflowOptions,
    ResumeWorkflowOptions,
    WorkflowExecutionResult,
    ApprovalRequest,
    WorkflowEvent,
    WorkflowEventHandler,
    ExpressionContext,
} from "./types";

// ============================================================================
// Resume Token Management
// ============================================================================

const TOKEN_SECRET = process.env.WORKFLOW_TOKEN_SECRET || "workflow-secret-key";

/**
 * Generate a secure resume token
 */
function generateResumeToken(runId: string): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString("hex");
    const payload = `${runId}:${timestamp}:${random}`;
    const signature = createHash("sha256")
        .update(payload + TOKEN_SECRET)
        .digest("hex")
        .slice(0, 16);

    return Buffer.from(`${payload}:${signature}`).toString("base64url");
}

/**
 * Validate and decode a resume token
 */
function validateResumeToken(token: string): { runId: string; valid: boolean } {
    try {
        const decoded = Buffer.from(token, "base64url").toString();
        const parts = decoded.split(":");

        if (parts.length !== 4) {
            return { runId: "", valid: false };
        }

        const [runId, timestamp, random, signature] = parts;
        const payload = `${runId}:${timestamp}:${random}`;
        const expectedSignature = createHash("sha256")
            .update(payload + TOKEN_SECRET)
            .digest("hex")
            .slice(0, 16);

        if (signature !== expectedSignature) {
            return { runId: "", valid: false };
        }

        // Check if token is not too old (24 hours)
        const tokenTime = parseInt(timestamp, 36);
        const maxAge = 24 * 60 * 60 * 1000;

        if (Date.now() - tokenTime > maxAge) {
            return { runId, valid: false };
        }

        return { runId, valid: true };
    } catch {
        return { runId: "", valid: false };
    }
}

// ============================================================================
// Expression Evaluation
// ============================================================================

/**
 * Evaluate an expression with variable interpolation
 * Supports: $input.field, $stepId.output, $stepId.success, etc.
 */
function evaluateExpression(
    expression: string,
    context: ExpressionContext
): unknown {
    // Simple variable replacement for now
    // In production, use a proper expression parser for security

    // Replace $variable.path patterns
    const variablePattern = /\$(\w+)(?:\.(\w+(?:\.\w+)*))?/g;

    let result = expression;
    let match;

    while ((match = variablePattern.exec(expression)) !== null) {
        const [fullMatch, variable, path] = match;
        let value = context[`$${variable}`] ?? context[variable];

        if (path && value !== undefined) {
            const pathParts = path.split(".");
            for (const part of pathParts) {
                if (value && typeof value === "object" && part in value) {
                    value = (value as Record<string, unknown>)[part];
                } else {
                    value = undefined;
                    break;
                }
            }
        }

        // For string results, replace the variable
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            result = result.replace(fullMatch, String(value));
        } else if (value !== undefined) {
            // For complex values, if it's the entire expression, return the value
            if (expression.trim() === fullMatch) {
                return value;
            }
            result = result.replace(fullMatch, JSON.stringify(value));
        }
    }

    // Try to evaluate as boolean/number if it looks like one
    if (result === "true") return true;
    if (result === "false") return false;
    if (!isNaN(Number(result)) && result.trim() !== "") return Number(result);

    return result;
}

/**
 * Interpolate variables in an object recursively
 */
function interpolateArgs(
    args: Record<string, unknown>,
    context: ExpressionContext
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
        if (typeof value === "string") {
            result[key] = evaluateExpression(value, context);
        } else if (Array.isArray(value)) {
            result[key] = value.map((item) =>
                typeof item === "string"
                    ? evaluateExpression(item, context)
                    : item
            );
        } else if (typeof value === "object" && value !== null) {
            result[key] = interpolateArgs(value as Record<string, unknown>, context);
        } else {
            result[key] = value;
        }
    }

    return result;
}

// ============================================================================
// Step Executors
// ============================================================================

type StepExecutor = (
    step: WorkflowStep,
    context: ExpressionContext,
    options: { userId: string; runId: string }
) => Promise<StepResult>;

async function executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    context: { userId: string }
): Promise<unknown> {
    const toolId = toolName as ToolId;
    const apiKeys = await getUserApiKeys(context.userId);
    const localAccess = await getLocalAccessContext(context.userId);
    const toolContext: ToolContext = {
        userId: context.userId,
        apiKeys,
        localFileAccessEnabled: localAccess.localFileAccessEnabled,
        commandExecutionEnabled: localAccess.commandExecutionEnabled,
        fileAccessBaseDir: localAccess.fileAccessBaseDir,
        workspaceQuotaMb: localAccess.workspaceQuotaMb,
        hostedSandbox: localAccess.hostedSandbox,
    };

    const result = await executeTool({ toolId, params: args }, toolContext);
    if (!result.success) {
        throw new Error(result.error || `Tool execution failed: ${toolName}`);
    }

    return result.data;
}

/**
 * Execute a tool step
 */
const executeToolStep: StepExecutor = async (step, context, options) => {
    const startedAt = new Date();

    try {
        const toolName = step.tool!;
        const action = step.action;
        const args = step.args ? interpolateArgs(step.args, context) : {};

        // Execute the tool
        const result = await executeToolCall(
            toolName,
            action ? { action, ...args } : args,
            { userId: options.userId }
        );

        return {
            stepId: step.id,
            status: "success",
            output: result,
            startedAt,
            completedAt: new Date(),
            duration: Date.now() - startedAt.getTime(),
        };
    } catch (error) {
        return {
            stepId: step.id,
            status: "failure",
            error: error instanceof Error ? error.message : "Tool execution failed",
            startedAt,
            completedAt: new Date(),
            duration: Date.now() - startedAt.getTime(),
        };
    }
};

/**
 * Execute an LLM step
 */
const executeLLMStep: StepExecutor = async (step, context, options) => {
    const startedAt = new Date();

    try {
        const prompt = evaluateExpression(step.prompt!, context) as string;
        const modelId = step.model || "gpt-4o-mini";
        const modelConfig = getModelConfig(modelId);
        if (!modelConfig) {
            throw new Error(`Model not found: ${modelId}`);
        }

        const apiKeys = await getUserApiKeys(options.userId);
        const model = getModelWithKey(modelId, apiKeys);

        const { text } = await generateText({
            model,
            messages: [{ role: "user", content: prompt }],
        });

        // Try to parse as JSON if it looks like JSON
        let output: unknown = text;
        if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
            try {
                output = JSON.parse(text);
            } catch {
                // Keep as string
            }
        }

        return {
            stepId: step.id,
            status: "success",
            output,
            startedAt,
            completedAt: new Date(),
            duration: Date.now() - startedAt.getTime(),
        };
    } catch (error) {
        return {
            stepId: step.id,
            status: "failure",
            error: error instanceof Error ? error.message : "LLM execution failed",
            startedAt,
            completedAt: new Date(),
            duration: Date.now() - startedAt.getTime(),
        };
    }
};

/**
 * Execute a condition step
 */
const executeConditionStep: StepExecutor = async (step, context) => {
    const startedAt = new Date();

    try {
        const condition = step.condition!;
        const result = evaluateExpression(condition, context);

        return {
            stepId: step.id,
            status: "success",
            output: Boolean(result),
            startedAt,
            completedAt: new Date(),
            duration: Date.now() - startedAt.getTime(),
        };
    } catch (error) {
        return {
            stepId: step.id,
            status: "failure",
            error: error instanceof Error ? error.message : "Condition evaluation failed",
            startedAt,
            completedAt: new Date(),
            duration: Date.now() - startedAt.getTime(),
        };
    }
};

/**
 * Execute a transform step
 */
const executeTransformStep: StepExecutor = async (step, context) => {
    const startedAt = new Date();

    try {
        const input = evaluateExpression(step.transform!.input, context);
        const expression = step.transform!.expression;

        // Simple transform - in production, use a sandboxed evaluator
        let output: unknown;

        if (expression === "JSON.stringify") {
            output = JSON.stringify(input);
        } else if (expression === "JSON.parse") {
            output = JSON.parse(input as string);
        } else if (expression.startsWith("map:")) {
            const mapExpr = expression.slice(4);
            if (Array.isArray(input)) {
                output = input.map((item) =>
                    evaluateExpression(mapExpr.replace("$item", JSON.stringify(item)), context)
                );
            }
        } else {
            output = input;
        }

        return {
            stepId: step.id,
            status: "success",
            output,
            startedAt,
            completedAt: new Date(),
            duration: Date.now() - startedAt.getTime(),
        };
    } catch (error) {
        return {
            stepId: step.id,
            status: "failure",
            error: error instanceof Error ? error.message : "Transform failed",
            startedAt,
            completedAt: new Date(),
            duration: Date.now() - startedAt.getTime(),
        };
    }
};

const STEP_EXECUTORS: Record<string, StepExecutor> = {
    tool: executeToolStep,
    llm: executeLLMStep,
    condition: executeConditionStep,
    transform: executeTransformStep,
};

// ============================================================================
// Workflow Executor Class
// ============================================================================

export class WorkflowExecutor {
    private eventHandlers: WorkflowEventHandler[] = [];

    /**
     * Register an event handler
     */
    onEvent(handler: WorkflowEventHandler): void {
        this.eventHandlers.push(handler);
    }

    /**
     * Emit an event
     */
    private async emitEvent(event: WorkflowEvent): Promise<void> {
        for (const handler of this.eventHandlers) {
            try {
                await handler(event);
            } catch (error) {
                console.error("[Workflow] Event handler error:", error);
            }
        }
    }

    /**
     * Execute a workflow
     */
    async execute(options: ExecuteWorkflowOptions): Promise<WorkflowExecutionResult> {
        const { workflowId, userId, input = {} } = options;

        // Load workflow
        const [workflow] = await db
            .select()
            .from(workflows)
            .where(eq(workflows.id, workflowId))
            .limit(1);

        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        // Create run record
        const runId = crypto.randomUUID();
        const initialState: WorkflowRunState = {
            currentStepIndex: 0,
            currentStepId: null,
            stepResults: {},
            variables: { ...input },
        };

        await db.insert(workflowRuns).values({
            id: runId,
            workflowId,
            userId,
            status: "running",
            currentStepId: null,
            stepResults: {},
            input,
            startedAt: new Date(),
        });

        await this.emitEvent({
            type: "workflow.started",
            timestamp: new Date(),
            runId,
            workflowId,
        });

        // Execute workflow
        return this.executeSteps(workflow, runId, userId, input, initialState);
    }

    /**
     * Resume a paused workflow
     */
    async resume(options: ResumeWorkflowOptions): Promise<WorkflowExecutionResult> {
        const { resumeToken, approved } = options;

        // Validate token
        const { runId, valid } = validateResumeToken(resumeToken);

        if (!valid || !runId) {
            throw new Error("Invalid or expired resume token");
        }

        // Load run
        const [run] = await db
            .select()
            .from(workflowRuns)
            .where(eq(workflowRuns.id, runId))
            .limit(1);

        if (!run) {
            throw new Error(`Workflow run not found: ${runId}`);
        }

        if (run.status !== "paused") {
            throw new Error(`Workflow run is not paused: ${run.status}`);
        }

        // Load workflow
        const [workflow] = await db
            .select()
            .from(workflows)
            .where(eq(workflows.id, run.workflowId))
            .limit(1);

        if (!workflow) {
            throw new Error(`Workflow not found: ${run.workflowId}`);
        }

        // Record approval
        if (run.pendingApprovalStepId) {
            await db.insert(workflowApprovals).values({
                runId,
                stepId: run.pendingApprovalStepId,
                prompt: run.pendingApprovalPrompt || "",
                items: run.pendingApprovalItems,
                approved,
                approvedAt: new Date(),
            });

            await this.emitEvent({
                type: "approval.received",
                timestamp: new Date(),
                runId,
                workflowId: run.workflowId,
                stepId: run.pendingApprovalStepId,
                data: { approved },
            });
        }

        if (!approved) {
            // Approval rejected - cancel workflow
            await db
                .update(workflowRuns)
                .set({
                    status: "cancelled",
                    completedAt: new Date(),
                })
                .where(eq(workflowRuns.id, runId));

            return {
                runId,
                status: "cancelled",
                completedSteps: Object.keys(run.stepResults as Record<string, unknown> || {}),
                pendingSteps: [],
            };
        }

        // Resume execution
        const state: WorkflowRunState = {
            currentStepIndex: this.findStepIndex(
                workflow.definition as WorkflowDefinition,
                run.currentStepId || ""
            ) + 1,
            currentStepId: run.currentStepId,
            stepResults: run.stepResults as Record<string, StepResult>,
            variables: run.input as Record<string, unknown> || {},
        };

        // Mark approval step as completed
        if (run.pendingApprovalStepId) {
            state.stepResults[run.pendingApprovalStepId] = {
                stepId: run.pendingApprovalStepId,
                status: "success",
                output: { approved: true },
                startedAt: new Date(),
                completedAt: new Date(),
                duration: 0,
            };
        }

        await db
            .update(workflowRuns)
            .set({
                status: "running",
                pendingApprovalStepId: null,
                pendingApprovalPrompt: null,
                pendingApprovalItems: null,
                resumeToken: null,
            })
            .where(eq(workflowRuns.id, runId));

        await this.emitEvent({
            type: "workflow.resumed",
            timestamp: new Date(),
            runId,
            workflowId: run.workflowId,
        });

        return this.executeSteps(
            workflow,
            runId,
            run.userId,
            run.input as Record<string, unknown>,
            state
        );
    }

    /**
     * Execute workflow steps
     */
    private async executeSteps(
        workflow: typeof workflows.$inferSelect,
        runId: string,
        userId: string,
        input: Record<string, unknown>,
        state: WorkflowRunState
    ): Promise<WorkflowExecutionResult> {
        const definition = workflow.definition as WorkflowDefinition;
        const steps = definition.steps;

        // Build expression context
        const buildContext = (): ExpressionContext => {
            const ctx: ExpressionContext = {
                $input: input,
                $output: null,
            };

            // Add step results
            for (const [stepId, result] of Object.entries(state.stepResults)) {
                ctx[`$${stepId}`] = {
                    success: result.status === "success",
                    output: result.output,
                    error: result.error,
                };
            }

            // Add variables
            for (const [key, value] of Object.entries(state.variables)) {
                ctx[key] = value;
            }

            return ctx;
        };

        const stepIndexById = new Map(steps.map((step, index) => [step.id, index]));
        let currentIndex = state.currentStepIndex;
        let lastStepId: string | null = null;

        const resolveNextIndex = (
            index: number,
            step: WorkflowStep,
            result: StepResult
        ): number => {
            let nextIndex = index + 1;

            if (step.type === "condition" && result.status === "success" && typeof result.output === "boolean") {
                const targetId = result.output ? step.onSuccess : step.onFailure;
                const targetIndex = targetId ? stepIndexById.get(targetId) : undefined;
                if (targetIndex !== undefined && targetIndex >= 0) {
                    return targetIndex;
                }
                return nextIndex;
            }

            if (result.status === "success" && step.onSuccess) {
                const targetIndex = stepIndexById.get(step.onSuccess);
                if (targetIndex !== undefined && targetIndex >= 0) {
                    nextIndex = targetIndex;
                }
            }

            if (result.status === "failure" && step.onFailure) {
                const targetIndex = stepIndexById.get(step.onFailure);
                if (targetIndex !== undefined && targetIndex >= 0) {
                    nextIndex = targetIndex;
                }
            }

            return nextIndex;
        };

        // Execute remaining steps
        while (currentIndex < steps.length) {
            const step = steps[currentIndex];
            state.currentStepIndex = currentIndex;
            state.currentStepId = step.id;

            // Check condition
            if (step.condition) {
                const ctx = buildContext();
                const conditionResult = evaluateExpression(step.condition, ctx);

                if (!conditionResult) {
                    // Skip this step
                    state.stepResults[step.id] = {
                        stepId: step.id,
                        status: "skipped",
                        output: { reason: "Condition not met" },
                        startedAt: new Date(),
                        completedAt: new Date(),
                        duration: 0,
                    };

                    await this.emitEvent({
                        type: "step.skipped",
                        timestamp: new Date(),
                        runId,
                        workflowId: workflow.id,
                        stepId: step.id,
                    });

                    lastStepId = step.id;
                    currentIndex += 1;
                    continue;
                }
            }

            // Handle approval step
            if (step.type === "approval" && step.approval?.required) {
                const ctx = buildContext();
                const prompt = evaluateExpression(step.approval.prompt, ctx) as string;
                const items = step.approval.items
                    ? (evaluateExpression(JSON.stringify(step.approval.items), ctx) as unknown[])
                    : undefined;

                const resumeToken = generateResumeToken(runId);

                // Pause workflow
                await db
                    .update(workflowRuns)
                    .set({
                        status: "paused",
                        currentStepId: step.id,
                        stepResults: state.stepResults,
                        pendingApprovalStepId: step.id,
                        pendingApprovalPrompt: prompt,
                        pendingApprovalItems: items,
                        resumeToken,
                        pausedAt: new Date(),
                    })
                    .where(eq(workflowRuns.id, runId));

                await this.emitEvent({
                    type: "workflow.paused",
                    timestamp: new Date(),
                    runId,
                    workflowId: workflow.id,
                });

                await this.emitEvent({
                    type: "approval.requested",
                    timestamp: new Date(),
                    runId,
                    workflowId: workflow.id,
                    stepId: step.id,
                    data: { prompt, items },
                });

                return {
                    runId,
                    status: "paused",
                    approval: {
                        runId,
                        stepId: step.id,
                        prompt,
                        items,
                        resumeToken,
                        expiresAt: step.approval.timeout
                            ? new Date(Date.now() + step.approval.timeout)
                            : undefined,
                    },
                    completedSteps: Object.keys(state.stepResults),
                    pendingSteps: steps.slice(currentIndex + 1).map((s) => s.id),
                };
            }

            // Execute step
            await this.emitEvent({
                type: "step.started",
                timestamp: new Date(),
                runId,
                workflowId: workflow.id,
                stepId: step.id,
            });

            const executor = STEP_EXECUTORS[step.type];

            if (!executor) {
                throw new Error(`Unknown step type: ${step.type}`);
            }

            const result = await executor(step, buildContext(), { userId, runId });
            state.stepResults[step.id] = result;
            lastStepId = step.id;

            if (result.status === "success" && step.type === "transform" && step.transform?.output) {
                state.variables[step.transform.output] = result.output;
            }

            // Update run state
            await db
                .update(workflowRuns)
                .set({
                    currentStepId: step.id,
                    stepResults: state.stepResults,
                })
                .where(eq(workflowRuns.id, runId));

            if (result.status === "failure") {
                await this.emitEvent({
                    type: "step.failed",
                    timestamp: new Date(),
                    runId,
                    workflowId: workflow.id,
                    stepId: step.id,
                    data: { error: result.error },
                });

                if (!step.continueOnError && !step.onFailure) {
                    // Workflow failed
                    await db
                        .update(workflowRuns)
                        .set({
                            status: "failed",
                            error: result.error,
                            completedAt: new Date(),
                        })
                        .where(eq(workflowRuns.id, runId));

                    await this.emitEvent({
                        type: "workflow.failed",
                        timestamp: new Date(),
                        runId,
                        workflowId: workflow.id,
                        data: { error: result.error },
                    });

                    return {
                        runId,
                        status: "failed",
                        error: result.error,
                        completedSteps: Object.keys(state.stepResults),
                        pendingSteps: steps.slice(currentIndex + 1).map((s) => s.id),
                    };
                }
            } else {
                await this.emitEvent({
                    type: "step.completed",
                    timestamp: new Date(),
                    runId,
                    workflowId: workflow.id,
                    stepId: step.id,
                    data: { output: result.output },
                });
            }

            currentIndex = resolveNextIndex(currentIndex, step, result);
        }

        // Workflow completed
        const output = lastStepId ? state.stepResults[lastStepId]?.output : null;

        await db
            .update(workflowRuns)
            .set({
                status: "completed",
                output,
                completedAt: new Date(),
            })
            .where(eq(workflowRuns.id, runId));

        await this.emitEvent({
            type: "workflow.completed",
            timestamp: new Date(),
            runId,
            workflowId: workflow.id,
            data: { output },
        });

        return {
            runId,
            status: "completed",
            output,
            completedSteps: Object.keys(state.stepResults),
            pendingSteps: [],
        };
    }

    /**
     * Find step index by ID
     */
    private findStepIndex(definition: WorkflowDefinition, stepId: string): number {
        return definition.steps.findIndex((s) => s.id === stepId);
    }

    /**
     * Cancel a running workflow
     */
    async cancel(runId: string): Promise<void> {
        const [run] = await db
            .select()
            .from(workflowRuns)
            .where(eq(workflowRuns.id, runId))
            .limit(1);

        if (!run) {
            throw new Error(`Workflow run not found: ${runId}`);
        }

        if (run.status !== "running" && run.status !== "paused") {
            throw new Error(`Cannot cancel workflow in status: ${run.status}`);
        }

        await db
            .update(workflowRuns)
            .set({
                status: "cancelled",
                completedAt: new Date(),
            })
            .where(eq(workflowRuns.id, runId));
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const workflowExecutor = new WorkflowExecutor();
