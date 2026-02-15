/**
 * Boot Runner
 *
 * Executes boot scripts on startup or channel connection.
 * Boot scripts are markdown instructions that the AI agent processes.
 */

import { db } from "@/lib/db";
import { bootScripts } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { runIsolatedAgent } from "@/lib/scheduler/isolated-agent";
import { getAdminSettings } from "@/lib/admin/settings";

// ============================================================================
// Types
// ============================================================================

export interface BootRunOptions {
    runOnServerStart?: boolean;
    runOnChannelStart?: boolean;
    userId?: string;
    channelAccountId?: string;
}

export interface BootRunResult {
    total: number;
    ran: number;
    skipped: number;
    failed: number;
    errors: string[];
    results: Array<{
        scriptId: string;
        scriptName: string;
        status: "success" | "skipped" | "failed";
        output?: string;
        error?: string;
        durationMs: number;
    }>;
}

// ============================================================================
// Boot Runner
// ============================================================================

/**
 * Run boot scripts based on options
 */
export async function runBootScripts(options: BootRunOptions): Promise<BootRunResult> {
    const { runOnServerStart, runOnChannelStart, userId, channelAccountId } = options;

    console.log("[BootRunner] Running boot scripts...", { runOnServerStart, runOnChannelStart, userId });

    // Check if boot scripts are enabled
    const settings = await getAdminSettings();
    if (!settings.bootScriptsEnabled) {
        console.log("[BootRunner] Boot scripts disabled in settings");
        return {
            total: 0,
            ran: 0,
            skipped: 0,
            failed: 0,
            errors: [],
            results: [],
        };
    }

    // Build query conditions
    const conditions = [eq(bootScripts.isEnabled, true)];

    if (runOnServerStart) {
        conditions.push(eq(bootScripts.runOnServerStart, true));
    }

    if (runOnChannelStart) {
        conditions.push(eq(bootScripts.runOnChannelStart, true));
    }

    if (userId) {
        conditions.push(eq(bootScripts.userId, userId));
    }

    // Get boot scripts
    const scripts = await db
        .select()
        .from(bootScripts)
        .where(and(...conditions))
        .orderBy(desc(bootScripts.priority));

    const result: BootRunResult = {
        total: scripts.length,
        ran: 0,
        skipped: 0,
        failed: 0,
        errors: [],
        results: [],
    };

    if (scripts.length === 0) {
        console.log("[BootRunner] No boot scripts to run");
        return result;
    }

    console.log(`[BootRunner] Found ${scripts.length} boot script(s) to run`);

    // Run each script
    for (const script of scripts) {
        const startTime = Date.now();

        try {
            console.log(`[BootRunner] Running script: ${script.name}`);

            // Run the script as an isolated agent task
            const agentResult = await runIsolatedAgent({
                userId: script.userId,
                taskId: script.id,
                taskName: `Boot: ${script.name}`,
                message: buildBootPrompt(script.content, script.name),
                channelAccountId,
                sessionTarget: "isolated",
                includeRecentMessages: 0,
                maxAttempts: 3,
                requireToolCall: false,
                deliver: false, // Boot scripts don't auto-deliver
                timeout: 120000, // 2 minute timeout for boot scripts
            });

            const durationMs = Date.now() - startTime;

            if (agentResult.success) {
                result.ran++;
                result.results.push({
                    scriptId: script.id,
                    scriptName: script.name,
                    status: "success",
                    output: agentResult.output,
                    durationMs,
                });

                // Update script status
                await db
                    .update(bootScripts)
                    .set({
                        lastRunAt: new Date(),
                        lastStatus: "success",
                        lastError: null,
                        lastOutput: agentResult.output?.substring(0, 10000),
                        updatedAt: new Date(),
                    })
                    .where(eq(bootScripts.id, script.id));

                console.log(`[BootRunner] Script "${script.name}" completed successfully`);
            } else {
                result.failed++;
                result.errors.push(`${script.name}: ${agentResult.error}`);
                result.results.push({
                    scriptId: script.id,
                    scriptName: script.name,
                    status: "failed",
                    error: agentResult.error,
                    durationMs,
                });

                // Update script status
                await db
                    .update(bootScripts)
                    .set({
                        lastRunAt: new Date(),
                        lastStatus: "failed",
                        lastError: agentResult.error,
                        updatedAt: new Date(),
                    })
                    .where(eq(bootScripts.id, script.id));

                console.error(`[BootRunner] Script "${script.name}" failed:`, agentResult.error);
            }
        } catch (error) {
            const durationMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : "Unknown error";

            result.failed++;
            result.errors.push(`${script.name}: ${errorMessage}`);
            result.results.push({
                scriptId: script.id,
                scriptName: script.name,
                status: "failed",
                error: errorMessage,
                durationMs,
            });

            // Update script status
            await db
                .update(bootScripts)
                .set({
                    lastRunAt: new Date(),
                    lastStatus: "failed",
                    lastError: errorMessage,
                    updatedAt: new Date(),
                })
                .where(eq(bootScripts.id, script.id));

            console.error(`[BootRunner] Script "${script.name}" error:`, error);
        }
    }

    console.log(
        `[BootRunner] Completed: ${result.ran} ran, ${result.skipped} skipped, ${result.failed} failed`
    );

    return result;
}

/**
 * Run a single boot script by ID
 */
export async function runBootScript(scriptId: string): Promise<{
    success: boolean;
    output?: string;
    error?: string;
    durationMs: number;
}> {
    const startTime = Date.now();

    const [script] = await db
        .select()
        .from(bootScripts)
        .where(eq(bootScripts.id, scriptId))
        .limit(1);

    if (!script) {
        return {
            success: false,
            error: "Boot script not found",
            durationMs: Date.now() - startTime,
        };
    }

    try {
        const agentResult = await runIsolatedAgent({
            userId: script.userId,
            taskId: script.id,
            taskName: `Boot: ${script.name}`,
            message: buildBootPrompt(script.content, script.name),
            sessionTarget: "isolated",
            includeRecentMessages: 0,
            deliver: false,
            timeout: 120000,
        });

        const durationMs = Date.now() - startTime;

        // Update script status
        await db
            .update(bootScripts)
            .set({
                lastRunAt: new Date(),
                lastStatus: agentResult.success ? "success" : "failed",
                lastError: agentResult.success ? null : agentResult.error,
                lastOutput: agentResult.output?.substring(0, 10000),
                updatedAt: new Date(),
            })
            .where(eq(bootScripts.id, scriptId));

        return {
            success: agentResult.success,
            output: agentResult.output,
            error: agentResult.error,
            durationMs,
        };
    } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        await db
            .update(bootScripts)
            .set({
                lastRunAt: new Date(),
                lastStatus: "failed",
                lastError: errorMessage,
                updatedAt: new Date(),
            })
            .where(eq(bootScripts.id, scriptId));

        return {
            success: false,
            error: errorMessage,
            durationMs,
        };
    }
}

/**
 * Build boot prompt from script content
 */
function buildBootPrompt(content: string, scriptName: string): string {
    return `# Boot Script: ${scriptName}

You are executing a boot script. Follow the instructions below carefully and report on what you did.

---

${content}

---

## Instructions

1. Execute each task described above
2. Report what you did for each task
3. Note any issues or errors encountered
4. If you cannot complete a task, explain why

Provide a concise summary of the boot process results.`;
}

/**
 * Get boot script by ID
 */
export async function getBootScript(scriptId: string) {
    const [script] = await db
        .select()
        .from(bootScripts)
        .where(eq(bootScripts.id, scriptId))
        .limit(1);

    return script;
}

/**
 * Get all boot scripts for a user
 */
export async function getUserBootScripts(userId: string) {
    return db
        .select()
        .from(bootScripts)
        .where(eq(bootScripts.userId, userId))
        .orderBy(desc(bootScripts.priority));
}

/**
 * Create a boot script
 */
export async function createBootScript(data: {
    userId: string;
    name: string;
    description?: string;
    content: string;
    runOnServerStart?: boolean;
    runOnChannelStart?: boolean;
    isEnabled?: boolean;
    priority?: number;
}) {
    const [script] = await db
        .insert(bootScripts)
        .values({
            userId: data.userId,
            name: data.name,
            description: data.description ?? null,
            content: data.content,
            runOnServerStart: data.runOnServerStart ?? true,
            runOnChannelStart: data.runOnChannelStart ?? false,
            isEnabled: data.isEnabled ?? true,
            priority: data.priority ?? 0,
        })
        .returning();

    return script;
}

/**
 * Update a boot script
 */
export async function updateBootScript(
    scriptId: string,
    userId: string,
    data: Partial<{
        name: string;
        description: string | null;
        content: string;
        runOnServerStart: boolean;
        runOnChannelStart: boolean;
        isEnabled: boolean;
        priority: number;
    }>
) {
    const [script] = await db
        .update(bootScripts)
        .set({
            ...data,
            updatedAt: new Date(),
        })
        .where(and(eq(bootScripts.id, scriptId), eq(bootScripts.userId, userId)))
        .returning();

    return script;
}

/**
 * Delete a boot script
 */
export async function deleteBootScript(scriptId: string, userId: string) {
    await db
        .delete(bootScripts)
        .where(and(eq(bootScripts.id, scriptId), eq(bootScripts.userId, userId)));
}
