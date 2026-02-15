import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { downloadBackup, restoreBackup } from "@/lib/services/backup";

/**
 * GET /api/backups/[backupId] - Download a backup file
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ backupId: string }> }
) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { backupId } = await params;
        const buffer = await downloadBackup(backupId);

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                "Content-Type": "application/gzip",
                "Content-Disposition": `attachment; filename="${backupId}.json.gz"`,
                "Content-Length": String(buffer.length),
            },
        });
    } catch (error) {
        console.error("[API] Download backup error:", error);
        const message = error instanceof Error ? error.message : "Failed to download backup";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/backups/[backupId] - Restore from a backup
 * Body: { tables?: string[] }
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ backupId: string }> }
) {
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { backupId } = await params;
        const body = await request.json().catch(() => ({}));
        const tables = Array.isArray(body.tables) ? body.tables : undefined;

        const result = await restoreBackup(backupId, tables);

        return NextResponse.json({ result });
    } catch (error) {
        console.error("[API] Restore backup error:", error);
        const message = error instanceof Error ? error.message : "Failed to restore backup";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
