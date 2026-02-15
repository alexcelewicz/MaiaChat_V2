/**
 * Clawdbot Sync API
 *
 * Syncs skills from GitHub to database.
 * - GET: Get sync status
 * - POST: Trigger sync from GitHub
 */

import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import {
    getSyncStatus,
    syncSkillsFromGitHub,
    getSkillStats,
} from "@/lib/services/clawdbot-sync";

/**
 * GET /api/admin/clawdbot-sync
 * Get sync status and statistics
 */
export async function GET() {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const [status, stats] = await Promise.all([
            getSyncStatus(),
            getSkillStats(),
        ]);

        return NextResponse.json({
            status,
            stats,
        });
    } catch (error) {
        console.error("[ClawdbotSync API] GET error:", error);
        return NextResponse.json(
            { error: "Failed to get sync status" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/clawdbot-sync
 * Trigger sync from GitHub
 */
export async function POST() {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await syncSkillsFromGitHub();
        return NextResponse.json(result);
    } catch (error) {
        console.error("[ClawdbotSync API] POST error:", error);
        return NextResponse.json(
            { error: "Failed to sync from GitHub" },
            { status: 500 }
        );
    }
}
