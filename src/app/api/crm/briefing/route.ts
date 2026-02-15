import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { getMorningBriefingData } from "@/lib/crm";

// GET /api/crm/briefing - Get morning briefing data
export async function GET(_request: NextRequest) {
    try {
        const userId = await getSessionUserId();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }
        const briefing = await getMorningBriefingData(userId);

        return NextResponse.json({
            success: true,
            briefing,
        });
    } catch (error) {
        console.error("[CRM] Get briefing error:", error);
        return NextResponse.json(
            { error: "Failed to get briefing data", code: "BRIEFING_FAILED" },
            { status: 500 }
        );
    }
}
