import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { syncFromGmail, syncFromCalendar } from "@/lib/crm/ingestion";
import { updateAllScores } from "@/lib/crm/scoring";

// POST /api/crm/sync - Trigger Gmail/Calendar sync
export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }
        const body = await request.json().catch(() => ({}));
        const source = (body.source || "all") as "gmail" | "calendar" | "all";

        if (!source || !["gmail", "calendar", "all"].includes(source)) {
            return NextResponse.json(
                {
                    error: "Invalid source. Must be 'gmail', 'calendar', or 'all'",
                    code: "VALIDATION_ERROR",
                },
                { status: 400 }
            );
        }

        const results: {
            gmail?: Awaited<ReturnType<typeof syncFromGmail>>;
            calendar?: Awaited<ReturnType<typeof syncFromCalendar>>;
        } = {};

        if (source === "gmail" || source === "all") {
            results.gmail = await syncFromGmail(userId);
        }

        if (source === "calendar" || source === "all") {
            results.calendar = await syncFromCalendar(userId);
        }

        await updateAllScores(userId);

        return NextResponse.json({
            success: true,
            source,
            results,
            scoresUpdated: true,
        });
    } catch (error) {
        console.error("[CRM] Sync error:", error);
        return NextResponse.json(
            { error: "Failed to sync data", code: "SYNC_FAILED" },
            { status: 500 }
        );
    }
}
