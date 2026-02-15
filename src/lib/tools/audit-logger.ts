/**
 * Tool Execution Audit Logger
 *
 * Logs every tool execution for security auditing and analytics.
 * Automatically redacts sensitive values from parameters.
 */

import { db } from "@/lib/db";
import { toolExecutionLogs } from "@/lib/db/schema";
import { and, eq, gte } from "drizzle-orm";
import type { ToolId, ToolResult } from "./types";

// ============================================================================
// Sensitive Field Redaction
// ============================================================================

const SENSITIVE_KEYS = new Set([
    "password", "secret", "token", "apikey", "api_key",
    "accesstoken", "access_token", "refreshtoken", "refresh_token",
    "authorization", "credential", "private_key", "privatekey",
    "ssn", "credit_card", "creditcard", "cvv", "pin",
]);

/**
 * Redact sensitive values from parameters before logging
 */
function redactParams(params: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase())) {
            redacted[key] = "[REDACTED]";
        } else if (Array.isArray(value)) {
            redacted[key] = value.map(item =>
                typeof item === "object" && item !== null
                    ? redactParams(item as Record<string, unknown>)
                    : item
            );
        } else if (typeof value === "object" && value !== null) {
            redacted[key] = redactParams(value as Record<string, unknown>);
        } else if (typeof value === "string" && value.length > 500) {
            // Truncate very long strings
            redacted[key] = value.slice(0, 500) + "...[truncated]";
        } else {
            redacted[key] = value;
        }
    }

    return redacted;
}

// ============================================================================
// Logging Functions
// ============================================================================

/**
 * Log a tool execution (fire-and-forget)
 */
export function logToolExecution(
    userId: string,
    conversationId: string | null,
    toolId: ToolId,
    toolName: string,
    params: Record<string, unknown>,
    result: ToolResult,
    durationMs: number
): void {
    // Extract action from params if present
    const action = typeof params.action === "string" ? params.action : undefined;

    // Fire-and-forget: don't await
    db.insert(toolExecutionLogs).values({
        userId,
        conversationId,
        toolId,
        toolName,
        action,
        params: redactParams(params),
        result: result.success ? "success" : "error",
        errorMessage: result.error || null,
        durationMs,
        metadata: result.metadata || null,
    }).catch(err => {
        console.error("[ToolAudit] Failed to log tool execution:", err);
    });
}

/**
 * Log a tool access denial
 */
export function logToolDenied(
    userId: string,
    toolId: ToolId,
    toolName: string,
    reason: string
): void {
    db.insert(toolExecutionLogs).values({
        userId,
        toolId,
        toolName,
        result: "denied",
        errorMessage: reason,
        metadata: { deniedReason: reason },
    }).catch(err => {
        console.error("[ToolAudit] Failed to log tool denial:", err);
    });
}

/**
 * Get tool usage statistics for a user
 */
export async function getToolUsageStats(
    userId: string,
    days: number = 30
): Promise<Array<{ toolId: string; toolName: string; totalCalls: number; successRate: number; avgDurationMs: number }>> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const logs = await db.select()
        .from(toolExecutionLogs)
        .where(
            and(
                eq(toolExecutionLogs.userId, userId),
                gte(toolExecutionLogs.createdAt, cutoff)
            )
        );

    // Aggregate by tool
    const statsMap = new Map<string, {
        toolId: string;
        toolName: string;
        total: number;
        successes: number;
        totalDuration: number;
        durationCount: number;
    }>();

    for (const log of logs) {
        const existing = statsMap.get(log.toolId) || {
            toolId: log.toolId,
            toolName: log.toolName,
            total: 0,
            successes: 0,
            totalDuration: 0,
            durationCount: 0,
        };

        existing.total++;
        if (log.result === "success") existing.successes++;
        if (log.durationMs) {
            existing.totalDuration += log.durationMs;
            existing.durationCount++;
        }

        statsMap.set(log.toolId, existing);
    }

    return Array.from(statsMap.values()).map(s => ({
        toolId: s.toolId,
        toolName: s.toolName,
        totalCalls: s.total,
        successRate: s.total > 0 ? Math.round((s.successes / s.total) * 100) : 0,
        avgDurationMs: s.durationCount > 0 ? Math.round(s.totalDuration / s.durationCount) : 0,
    })).sort((a, b) => b.totalCalls - a.totalCalls);
}
