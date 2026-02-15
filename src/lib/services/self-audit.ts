import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { listFiles } from "@/lib/storage/s3";
import {
    users,
    conversations,
    messages,
    agents,
    channelRuntimeState,
    scheduledTasks,
    crmContacts,
} from "@/lib/db/schema";
import { sql, eq, count } from "drizzle-orm";
import { listBackups } from "./backup";

// ============================================================================
// Types
// ============================================================================

export interface HealthCheckResult {
    overall: "healthy" | "degraded" | "unhealthy";
    checks: Array<{
        name: string;
        status: "ok" | "warning" | "error";
        message: string;
        latencyMs?: number;
    }>;
    checkedAt: Date;
}

export interface PromptAuditResult {
    agents: Array<{
        agentId: string;
        agentName: string;
        score: number;
        issues: string[];
        suggestions: string[];
    }>;
    overallScore: number;
    auditedAt: Date;
}

export interface SystemMetrics {
    conversations: number;
    messages: number;
    users: number;
    agents: number;
    activeChannels: number;
    scheduledTasks: number;
    crmContacts: number;
    backupCount: number;
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Run a comprehensive health check across all core services.
 */
export async function runHealthCheck(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult["checks"] = [];

    // 1. Database connectivity
    {
        const start = Date.now();
        try {
            await db.execute(sql`SELECT 1`);
            checks.push({
                name: "Database",
                status: "ok",
                message: "PostgreSQL connection healthy",
                latencyMs: Date.now() - start,
            });
        } catch (error) {
            checks.push({
                name: "Database",
                status: "error",
                message: error instanceof Error ? error.message : "Database connection failed",
                latencyMs: Date.now() - start,
            });
        }
    }

    // 2. S3 connectivity
    {
        const start = Date.now();
        try {
            await listFiles("backups/", 1);
            checks.push({
                name: "S3 Storage",
                status: "ok",
                message: "S3/MinIO connection healthy",
                latencyMs: Date.now() - start,
            });
        } catch (error) {
            checks.push({
                name: "S3 Storage",
                status: "error",
                message: error instanceof Error ? error.message : "S3 connection failed",
                latencyMs: Date.now() - start,
            });
        }
    }

    // 3. Redis connectivity
    {
        const start = Date.now();
        try {
            const pong = await redis.ping();
            checks.push({
                name: "Redis",
                status: pong === "PONG" ? "ok" : "warning",
                message: pong === "PONG" ? "Redis connection healthy" : `Unexpected response: ${pong}`,
                latencyMs: Date.now() - start,
            });
        } catch (error) {
            checks.push({
                name: "Redis",
                status: "error",
                message: error instanceof Error ? error.message : "Redis connection failed",
                latencyMs: Date.now() - start,
            });
        }
    }

    // 4. Channel connectivity - check channelRuntimeState for active channels
    {
        const start = Date.now();
        try {
            const activeChannels = await db
                .select({ id: channelRuntimeState.id })
                .from(channelRuntimeState)
                .where(eq(channelRuntimeState.running, true));

            checks.push({
                name: "Channels",
                status: "ok",
                message: `${activeChannels.length} active channel(s) running`,
                latencyMs: Date.now() - start,
            });
        } catch (error) {
            checks.push({
                name: "Channels",
                status: "warning",
                message: error instanceof Error ? error.message : "Could not check channel status",
                latencyMs: Date.now() - start,
            });
        }
    }

    // Determine overall status
    const hasError = checks.some((c) => c.status === "error");
    const hasWarning = checks.some((c) => c.status === "warning");
    // Database is critical
    const dbCheck = checks.find((c) => c.name === "Database");
    const dbDown = dbCheck?.status === "error";

    let overall: HealthCheckResult["overall"] = "healthy";
    if (dbDown || (hasError && checks.filter((c) => c.status === "error").length > 1)) {
        overall = "unhealthy";
    } else if (hasError || hasWarning) {
        overall = "degraded";
    }

    return {
        overall,
        checks,
        checkedAt: new Date(),
    };
}

// ============================================================================
// System Prompt Audit
// ============================================================================

/**
 * Audit all agent system prompts using a cheap LLM for quality analysis.
 * Sends each prompt to the model and asks for scoring and suggestions.
 */
export async function auditSystemPrompts(
    apiKeys: Record<string, string>
): Promise<PromptAuditResult> {
    // Fetch all agents with system prompts
    const allAgents = await db
        .select({
            id: agents.id,
            name: agents.name,
            systemPrompt: agents.systemPrompt,
        })
        .from(agents);

    const agentsWithPrompts = allAgents.filter((a) => a.systemPrompt && a.systemPrompt.trim());

    if (agentsWithPrompts.length === 0) {
        return {
            agents: [],
            overallScore: 100,
            auditedAt: new Date(),
        };
    }

    // Determine which API key to use: prefer Google (gemini-2.0-flash) for cheapness
    const googleKey = apiKeys.google;
    const openaiKey = apiKeys.openai;

    if (!googleKey && !openaiKey) {
        // Return a best-effort result without LLM analysis
        return {
            agents: agentsWithPrompts.map((a) => ({
                agentId: a.id,
                agentName: a.name,
                score: -1,
                issues: ["No API key available for audit (needs Google or OpenAI key)"],
                suggestions: [],
            })),
            overallScore: -1,
            auditedAt: new Date(),
        };
    }

    const results: PromptAuditResult["agents"] = [];

    for (const agent of agentsWithPrompts) {
        try {
            const auditPrompt = `Review this AI system prompt for anti-patterns, biases, or improvements. Return ONLY a JSON object (no markdown fences) with: {"score": 0-100, "issues": ["string array of issues found"], "suggestions": ["string array of improvement suggestions"]}\n\nSystem prompt to review:\n${agent.systemPrompt}`;

            let parsed: { score: number; issues: string[]; suggestions: string[] };

            if (googleKey) {
                // Use Gemini 2.0 Flash
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${googleKey}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: auditPrompt }] }],
                            generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
                        }),
                    }
                );

                const data = await response.json();
                const text =
                    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
                // Strip markdown fences if present
                const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
                parsed = JSON.parse(cleaned);
            } else if (openaiKey) {
                // Fallback to OpenAI gpt-4o-mini
                const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${openaiKey}`,
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [{ role: "user", content: auditPrompt }],
                        temperature: 0.2,
                        max_tokens: 1024,
                    }),
                });

                const data = await response.json();
                const text = data?.choices?.[0]?.message?.content ?? "{}";
                const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
                parsed = JSON.parse(cleaned);
            } else {
                parsed = { score: -1, issues: ["No API key available"], suggestions: [] };
            }

            results.push({
                agentId: agent.id,
                agentName: agent.name,
                score: typeof parsed.score === "number" ? parsed.score : 0,
                issues: Array.isArray(parsed.issues) ? parsed.issues : [],
                suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
            });
        } catch (error) {
            results.push({
                agentId: agent.id,
                agentName: agent.name,
                score: -1,
                issues: [
                    `Audit failed: ${error instanceof Error ? error.message : String(error)}`,
                ],
                suggestions: [],
            });
        }
    }

    // Calculate overall score (ignoring -1 failures)
    const validScores = results.filter((r) => r.score >= 0).map((r) => r.score);
    const overallScore =
        validScores.length > 0
            ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
            : -1;

    return {
        agents: results,
        overallScore,
        auditedAt: new Date(),
    };
}

// ============================================================================
// System Metrics
// ============================================================================

/**
 * Gather high-level system metrics: row counts across key tables.
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
    const [
        conversationCount,
        messageCount,
        userCount,
        agentCount,
        activeChannelCount,
        taskCount,
        contactCount,
        backupInfo,
    ] = await Promise.all([
        db.select({ value: count() }).from(conversations).then((r) => r[0]?.value ?? 0),
        db.select({ value: count() }).from(messages).then((r) => r[0]?.value ?? 0),
        db.select({ value: count() }).from(users).then((r) => r[0]?.value ?? 0),
        db.select({ value: count() }).from(agents).then((r) => r[0]?.value ?? 0),
        db
            .select({ value: count() })
            .from(channelRuntimeState)
            .where(eq(channelRuntimeState.running, true))
            .then((r) => r[0]?.value ?? 0),
        db.select({ value: count() }).from(scheduledTasks).then((r) => r[0]?.value ?? 0),
        db.select({ value: count() }).from(crmContacts).then((r) => r[0]?.value ?? 0),
        listBackups().then((b) => b.length).catch(() => 0),
    ]);

    return {
        conversations: conversationCount,
        messages: messageCount,
        users: userCount,
        agents: agentCount,
        activeChannels: activeChannelCount,
        scheduledTasks: taskCount,
        crmContacts: contactCount,
        backupCount: backupInfo,
    };
}
