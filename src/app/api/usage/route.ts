import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { usageRecords } from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { z } from "zod";

const usageQuerySchema = z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    groupBy: z.enum(["day", "provider", "model"]).optional().default("day"),
});

// GET /api/usage - Get usage statistics
export async function GET(request: Request) {
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

        // Parse query parameters
        const { searchParams } = new URL(request.url);
        const queryResult = usageQuerySchema.safeParse({
            startDate: searchParams.get("startDate") || undefined,
            endDate: searchParams.get("endDate") || undefined,
            groupBy: searchParams.get("groupBy") || undefined,
        });

        if (!queryResult.success) {
            return NextResponse.json(
                { error: "Invalid query parameters", code: "INVALID_QUERY" },
                { status: 400 }
            );
        }

        const { startDate, endDate, groupBy } = queryResult.data;

        // Build where conditions
        const conditions = [eq(usageRecords.userId, userId)];

        if (startDate) {
            conditions.push(gte(usageRecords.createdAt, new Date(startDate)));
        }
        if (endDate) {
            conditions.push(lte(usageRecords.createdAt, new Date(endDate)));
        }

        // Get total summary
        const totalResult = await db
            .select({
                totalInputTokens: sql<number>`COALESCE(SUM(${usageRecords.inputTokens}), 0)::int`,
                totalOutputTokens: sql<number>`COALESCE(SUM(${usageRecords.outputTokens}), 0)::int`,
                totalCost: sql<number>`COALESCE(SUM(${usageRecords.cost}), 0)::int`,
                messageCount: sql<number>`COUNT(*)::int`,
            })
            .from(usageRecords)
            .where(and(...conditions));

        const summary = totalResult[0] || {
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalCost: 0,
            messageCount: 0,
        };

        // Convert cost from micro-cents to USD
        const totalCostUsd = (summary.totalCost || 0) / 1_000_000;

        // Get breakdown by grouping
        let breakdown: Array<Record<string, unknown>> = [];

        if (groupBy === "provider") {
            breakdown = await db
                .select({
                    provider: usageRecords.provider,
                    inputTokens: sql<number>`COALESCE(SUM(${usageRecords.inputTokens}), 0)::int`,
                    outputTokens: sql<number>`COALESCE(SUM(${usageRecords.outputTokens}), 0)::int`,
                    cost: sql<number>`COALESCE(SUM(${usageRecords.cost}), 0)::int`,
                    count: sql<number>`COUNT(*)::int`,
                })
                .from(usageRecords)
                .where(and(...conditions))
                .groupBy(usageRecords.provider);
        } else if (groupBy === "model") {
            breakdown = await db
                .select({
                    provider: usageRecords.provider,
                    model: usageRecords.model,
                    inputTokens: sql<number>`COALESCE(SUM(${usageRecords.inputTokens}), 0)::int`,
                    outputTokens: sql<number>`COALESCE(SUM(${usageRecords.outputTokens}), 0)::int`,
                    cost: sql<number>`COALESCE(SUM(${usageRecords.cost}), 0)::int`,
                    count: sql<number>`COUNT(*)::int`,
                })
                .from(usageRecords)
                .where(and(...conditions))
                .groupBy(usageRecords.provider, usageRecords.model);
        } else {
            // Group by day
            breakdown = await db
                .select({
                    date: sql<string>`DATE(${usageRecords.createdAt})::text`,
                    inputTokens: sql<number>`COALESCE(SUM(${usageRecords.inputTokens}), 0)::int`,
                    outputTokens: sql<number>`COALESCE(SUM(${usageRecords.outputTokens}), 0)::int`,
                    cost: sql<number>`COALESCE(SUM(${usageRecords.cost}), 0)::int`,
                    count: sql<number>`COUNT(*)::int`,
                })
                .from(usageRecords)
                .where(and(...conditions))
                .groupBy(sql`DATE(${usageRecords.createdAt})`)
                .orderBy(sql`DATE(${usageRecords.createdAt})`);
        }

        // Convert costs in breakdown
        const breakdownWithUsd = breakdown.map((item) => ({
            ...item,
            costUsd: ((item.cost as number) || 0) / 1_000_000,
        }));

        return NextResponse.json({
            success: true,
            summary: {
                totalInputTokens: summary.totalInputTokens,
                totalOutputTokens: summary.totalOutputTokens,
                totalTokens: (summary.totalInputTokens || 0) + (summary.totalOutputTokens || 0),
                totalCostUsd,
                messageCount: summary.messageCount,
            },
            breakdown: breakdownWithUsd,
            groupBy,
            filters: {
                startDate,
                endDate,
            },
        });
    } catch (error) {
        console.error("Usage API error:", error);
        // Return empty data instead of error for better UX
        return NextResponse.json({
            success: true,
            summary: {
                totalInputTokens: 0,
                totalOutputTokens: 0,
                totalTokens: 0,
                totalCostUsd: 0,
                messageCount: 0,
            },
            breakdown: [],
            groupBy: "day",
            filters: {},
        });
    }
}
