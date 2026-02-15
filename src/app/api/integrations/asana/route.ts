/**
 * Asana Integration API
 *
 * Endpoints:
 * - GET: Check Asana connection status
 * - POST: Initiate OAuth flow (returns authorization URL)
 * - DELETE: Disconnect Asana account
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import {
    hasValidAsanaCredentials,
    getValidAsanaCredentials,
    initiateAsanaOAuthFlow,
    deleteAsanaCredentials,
} from "@/lib/integrations/asana/oauth";

/**
 * GET /api/integrations/asana
 * Check Asana connection status
 */
export async function GET() {
    try {
        const session = await getServerSession();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const connected = await hasValidAsanaCredentials(session.user.id);
        const credentials = connected
            ? await getValidAsanaCredentials(session.user.id)
            : null;

        return NextResponse.json({
            connected,
            workspaceId: credentials?.workspaceId,
        });
    } catch (error) {
        console.error("[Asana API] GET error:", error);
        return NextResponse.json(
            { error: "Failed to get Asana status" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/integrations/asana
 * Initiate OAuth flow
 */
export async function POST() {
    try {
        const session = await getServerSession();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        if (!process.env.ASANA_CLIENT_ID || !process.env.ASANA_CLIENT_SECRET) {
            return NextResponse.json(
                { error: "Asana OAuth is not configured. Set ASANA_CLIENT_ID and ASANA_CLIENT_SECRET." },
                { status: 500 }
            );
        }

        const { authUrl } = await initiateAsanaOAuthFlow(session.user.id);

        return NextResponse.json({ authUrl });
    } catch (error) {
        console.error("[Asana API] POST error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to initiate OAuth" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/integrations/asana
 * Disconnect Asana account
 */
export async function DELETE() {
    try {
        const session = await getServerSession();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        await deleteAsanaCredentials(session.user.id);

        return NextResponse.json({
            success: true,
            message: "Asana account disconnected",
        });
    } catch (error) {
        console.error("[Asana API] DELETE error:", error);
        return NextResponse.json(
            { error: "Failed to disconnect Asana account" },
            { status: 500 }
        );
    }
}
