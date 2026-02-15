/**
 * Google Integration API
 *
 * Endpoints:
 * - GET: Get Google connection status
 * - POST: Initiate OAuth flow (returns authorization URL)
 * - DELETE: Disconnect Google account
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import {
    initiateOAuthFlow,
    hasValidCredentials,
    getStoredCredentials,
    deleteCredentials,
} from "@/lib/integrations/google/oauth";
import { getConfig } from "@/lib/config";

/**
 * GET /api/integrations/google
 * Get Google connection status
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

        const config = await getConfig();

        if (!config.integrations.google.enabled) {
            return NextResponse.json({
                enabled: false,
                connected: false,
                message: "Google integration is not enabled",
            });
        }

        const connected = await hasValidCredentials(session.user.id);
        const credentials = connected
            ? await getStoredCredentials(session.user.id)
            : null;

        return NextResponse.json({
            enabled: true,
            connected,
            email: credentials?.email,
            scopes: credentials?.scope?.split(" ") || [],
        });
    } catch (error) {
        console.error("[Google API] GET error:", error);
        return NextResponse.json(
            { error: "Failed to get Google status" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/integrations/google
 * Initiate OAuth flow
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const config = await getConfig();

        if (!config.integrations.google.enabled) {
            return NextResponse.json(
                { error: "Google integration is not enabled" },
                { status: 400 }
            );
        }

        // Check if Google OAuth is configured
        if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
            return NextResponse.json(
                { error: "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET." },
                { status: 500 }
            );
        }

        // Get optional scopes from request
        const body = await request.json().catch(() => ({}));
        const scopes = body.scopes || config.integrations.google.scopes;

        // Initiate OAuth flow
        const { authUrl, state } = await initiateOAuthFlow(session.user.id, scopes);

        return NextResponse.json({
            authUrl,
            state,
        });
    } catch (error) {
        console.error("[Google API] POST error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to initiate OAuth" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/integrations/google
 * Disconnect Google account
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

        await deleteCredentials(session.user.id);

        return NextResponse.json({
            success: true,
            message: "Google account disconnected",
        });
    } catch (error) {
        console.error("[Google API] DELETE error:", error);
        return NextResponse.json(
            { error: "Failed to disconnect Google account" },
            { status: 500 }
        );
    }
}
