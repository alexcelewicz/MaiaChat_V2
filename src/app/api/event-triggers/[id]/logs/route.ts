/**
 * Event Trigger Logs API
 *
 * GET - Get execution logs for a trigger
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { eventTriggers, eventTriggerLogs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

interface RouteParams {
    params: Promise<{ id: string }>;
}

// ============================================================================
// GET - Get trigger logs
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get("limit") || "50", 10);
        const offset = parseInt(searchParams.get("offset") || "0", 10);

        // Verify ownership
        const [trigger] = await db
            .select()
            .from(eventTriggers)
            .where(and(eq(eventTriggers.id, id), eq(eventTriggers.userId, userId)))
            .limit(1);

        if (!trigger) {
            return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
        }

        // Get logs
        const logs = await db
            .select()
            .from(eventTriggerLogs)
            .where(eq(eventTriggerLogs.triggerId, id))
            .orderBy(desc(eventTriggerLogs.triggeredAt))
            .limit(Math.min(limit, 100))
            .offset(offset);

        return NextResponse.json({ logs, trigger });
    } catch (error) {
        console.error("[API] Event trigger logs error:", error);
        return NextResponse.json(
            { error: "Failed to get trigger logs" },
            { status: 500 }
        );
    }
}
