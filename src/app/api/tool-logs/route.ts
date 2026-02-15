import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { toolExecutionLogs } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const searchParams = request.nextUrl.searchParams;
        const toolId = searchParams.get("toolId");
        const result = searchParams.get("result");
        const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
        const offset = parseInt(searchParams.get("offset") || "0");

        // Non-admins can only see their own logs
        const conditions = [];
        if (user.role !== "admin") {
            conditions.push(eq(toolExecutionLogs.userId, user.id));
        }
        if (toolId) {
            conditions.push(eq(toolExecutionLogs.toolId, toolId));
        }
        if (result && ["success", "error", "denied"].includes(result)) {
            conditions.push(eq(toolExecutionLogs.result, result as "success" | "error" | "denied"));
        }

        const logs = await db.select()
            .from(toolExecutionLogs)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(toolExecutionLogs.createdAt))
            .limit(limit)
            .offset(offset);

        return NextResponse.json({ logs, limit, offset });
    } catch (error) {
        console.error("[ToolLogs] GET error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
