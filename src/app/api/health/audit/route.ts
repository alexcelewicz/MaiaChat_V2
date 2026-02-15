import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { runHealthCheck, auditSystemPrompts, getSystemMetrics } from "@/lib/services/self-audit";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";

/**
 * GET /api/health/audit - Run health check + system metrics
 */
export async function GET() {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [health, metrics] = await Promise.all([
            runHealthCheck(),
            getSystemMetrics(),
        ]);

        return NextResponse.json({ health, metrics });
    } catch (error) {
        console.error("[API] Health audit error:", error);
        return NextResponse.json(
            { error: "Failed to run health audit" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/health/audit - Trigger system prompt audit
 * Uses the first admin user's API keys for the LLM call.
 */
export async function POST() {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Use the first admin user's API keys for maintenance audits.
        // If no keys are configured, auditSystemPrompts returns graceful warnings.
        const apiKeyOwner = await (async () => {
            const { db } = await import("@/lib/db");
            const { users } = await import("@/lib/db/schema");
            const { eq } = await import("drizzle-orm");
            const [adminUser] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.role, "admin"))
                .limit(1);
            return adminUser?.id ?? null;
        })();

        const apiKeys = apiKeyOwner ? await getUserApiKeys(apiKeyOwner) : {};
        const result = await auditSystemPrompts(apiKeys as Record<string, string>);

        return NextResponse.json({ result });
    } catch (error) {
        console.error("[API] Prompt audit error:", error);
        return NextResponse.json(
            { error: "Failed to run prompt audit" },
            { status: 500 }
        );
    }
}
