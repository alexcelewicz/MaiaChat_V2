import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import {
    getContact,
    getContactTimeline,
    updateContact,
    deleteContact,
} from "@/lib/crm";

interface RouteContext {
    params: Promise<{ contactId: string }>;
}

// GET /api/crm/contacts/[contactId] - Get single contact with timeline
export async function GET(request: NextRequest, { params }: RouteContext) {
    try {
        const userId = await getSessionUserId();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const { contactId } = await params;
        const contact = await getContact(userId, contactId);

        if (!contact) {
            return NextResponse.json(
                { error: "Contact not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        const timeline = await getContactTimeline(contactId, userId);

        return NextResponse.json({
            success: true,
            contact,
            timeline,
        });
    } catch (error) {
        console.error("[CRM] Get contact error:", error);
        return NextResponse.json(
            { error: "Failed to get contact", code: "GET_FAILED" },
            { status: 500 }
        );
    }
}

// PUT /api/crm/contacts/[contactId] - Update contact
export async function PUT(request: NextRequest, { params }: RouteContext) {
    try {
        const userId = await getSessionUserId();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const { contactId } = await params;
        const body = await request.json();

        const contact = await updateContact(userId, contactId, body);

        if (!contact) {
            return NextResponse.json(
                { error: "Contact not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            contact,
        });
    } catch (error) {
        console.error("[CRM] Update contact error:", error);
        return NextResponse.json(
            { error: "Failed to update contact", code: "UPDATE_FAILED" },
            { status: 500 }
        );
    }
}

// PATCH /api/crm/contacts/[contactId] - Partial update (same as PUT)
export { PUT as PATCH };

// DELETE /api/crm/contacts/[contactId] - Delete contact
export async function DELETE(request: NextRequest, { params }: RouteContext) {
    try {
        const userId = await getSessionUserId();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const { contactId } = await params;

        try {
            await deleteContact(userId, contactId);
        } catch (error) {
            console.error("[CRM] Delete contact failed:", error);
            return NextResponse.json(
                { error: "Contact not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Contact deleted",
        });
    } catch (error) {
        console.error("[CRM] Delete contact error:", error);
        return NextResponse.json(
            { error: "Failed to delete contact", code: "DELETE_FAILED" },
            { status: 500 }
        );
    }
}
