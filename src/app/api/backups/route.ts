import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import {
    listBackups,
    createBackup,
    getBackupStatus,
    cleanupOldBackups,
} from "@/lib/services/backup";

/**
 * GET /api/backups - List all available backups + status
 */
export async function GET() {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [backups, status] = await Promise.all([
            listBackups(),
            getBackupStatus(),
        ]);

        return NextResponse.json({ backups, status });
    } catch (error) {
        console.error("[API] List backups error:", error);
        return NextResponse.json(
            { error: "Failed to list backups" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/backups - Trigger a manual backup
 * Body: { target?: "s3" | "local", retentionCount?: number }
 */
export async function POST(request: Request) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const target = body.target === "local" ? "local" : "s3";
        const retentionCount =
            typeof body.retentionCount === "number" &&
            Number.isFinite(body.retentionCount) &&
            body.retentionCount > 0
                ? Math.min(Math.floor(body.retentionCount), 1000)
                : null;

        const result = await createBackup(target);
        const deletedBackups =
            retentionCount !== null
                ? await cleanupOldBackups(retentionCount)
                : 0;

        return NextResponse.json({ result, deletedBackups });
    } catch (error) {
        console.error("[API] Create backup error:", error);
        return NextResponse.json(
            { error: "Failed to create backup" },
            { status: 500 }
        );
    }
}
