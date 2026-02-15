/**
 * HubSpot Integration API
 *
 * Endpoints:
 * - GET: Check HubSpot connection status
 * - POST: Initiate OAuth flow (returns authorization URL)
 * - DELETE: Disconnect HubSpot account
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import {
    hasValidHubSpotCredentials,
    getValidHubSpotCredentials,
    initiateHubSpotOAuthFlow,
    deleteHubSpotCredentials,
} from "@/lib/integrations/hubspot/oauth";

/**
 * GET /api/integrations/hubspot
 * Check HubSpot connection status
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

        const connected = await hasValidHubSpotCredentials(session.user.id);
        const credentials = connected
            ? await getValidHubSpotCredentials(session.user.id)
            : null;

        return NextResponse.json({
            connected,
            portalId: credentials?.portalId,
        });
    } catch (error) {
        console.error("[HubSpot API] GET error:", error);
        return NextResponse.json(
            { error: "Failed to get HubSpot status" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/integrations/hubspot
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

        if (!process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET) {
            return NextResponse.json(
                { error: "HubSpot OAuth is not configured. Set HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET." },
                { status: 500 }
            );
        }

        const { authUrl } = await initiateHubSpotOAuthFlow(session.user.id);

        return NextResponse.json({ authUrl });
    } catch (error) {
        console.error("[HubSpot API] POST error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to initiate OAuth" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/integrations/hubspot
 * Disconnect HubSpot account
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

        await deleteHubSpotCredentials(session.user.id);

        return NextResponse.json({
            success: true,
            message: "HubSpot account disconnected",
        });
    } catch (error) {
        console.error("[HubSpot API] DELETE error:", error);
        return NextResponse.json(
            { error: "Failed to disconnect HubSpot account" },
            { status: 500 }
        );
    }
}
