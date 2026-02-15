import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import {
    getContactTimeline,
    logInteraction,
    type CreateInteractionInput,
} from "@/lib/crm";

// GET /api/crm/interactions - List interactions for a contact
export async function GET(request: NextRequest) {
    try {
        const userId = await getSessionUserId();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }
        const { searchParams } = new URL(request.url);
        const contactId = searchParams.get("contactId");

        if (!contactId) {
            return NextResponse.json(
                { error: "contactId query parameter is required", code: "VALIDATION_ERROR" },
                { status: 400 }
            );
        }

        const interactions = await getContactTimeline(contactId, userId);

        return NextResponse.json({
            success: true,
            interactions,
            total: interactions.length,
        });
    } catch (error) {
        console.error("[CRM] List interactions error:", error);
        return NextResponse.json(
            { error: "Failed to list interactions", code: "LIST_FAILED" },
            { status: 500 }
        );
    }
}

// POST /api/crm/interactions - Log a new interaction
export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }
        const body = (await request.json()) as CreateInteractionInput;

        if (!body.contactId || !body.type) {
            return NextResponse.json(
                { error: "contactId and type are required", code: "VALIDATION_ERROR" },
                { status: 400 }
            );
        }

        const interaction = await logInteraction(userId, body);

        return NextResponse.json(
            { success: true, interaction },
            { status: 201 }
        );
    } catch (error) {
        console.error("[CRM] Log interaction error:", error);
        return NextResponse.json(
            { error: "Failed to log interaction", code: "CREATE_FAILED" },
            { status: 500 }
        );
    }
}
