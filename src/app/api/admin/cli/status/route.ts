/**
 * CLI Status API Route
 *
 * GET - Check CLI availability and configuration
 */

import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getCLIStatus, getAvailableCLIs } from "@/lib/tools/coding-cli";

/**
 * GET /api/admin/cli/status
 *
 * Check CLI availability and return status
 */
export async function GET() {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const status = await getCLIStatus();
        const available = await getAvailableCLIs();

        return NextResponse.json({
            success: true,
            claudeAvailable: available.includes("claude"),
            geminiAvailable: available.includes("gemini"),
            defaultCli: status.default,
            workspaceRoot: status.workspaceRoot,
            available: status.available,
        });
    } catch (error) {
        console.error("[CLI Status API] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to check CLI status" },
            { status: 500 }
        );
    }
}
