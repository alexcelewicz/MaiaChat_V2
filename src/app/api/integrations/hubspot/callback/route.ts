/**
 * HubSpot OAuth Callback Handler
 *
 * Handles the OAuth callback from HubSpot after user authorization.
 * Exchanges the authorization code for tokens and stores them.
 */

import { NextRequest, NextResponse } from "next/server";
import {
    completeHubSpotOAuthFlow,
} from "@/lib/integrations/hubspot/oauth";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    const baseUrl =
        process.env.NEXTAUTH_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "http://localhost:3000";

    // Validate required parameters
    if (!code || !state) {
        console.error("[HubSpot OAuth] Missing code or state parameter");
        return NextResponse.redirect(
            `${baseUrl}/settings/integrations?error=missing_parameters`
        );
    }

    try {
        const result = await completeHubSpotOAuthFlow(code, state);
        if (!result.success) {
            console.error("[HubSpot OAuth] Callback validation failed:", result.error);
            const errorCode = result.error?.toLowerCase().includes("state")
                ? "invalid_state"
                : "hubspot_callback_failed";
            return NextResponse.redirect(
                `${baseUrl}/settings/integrations?error=${errorCode}`
            );
        }

        return NextResponse.redirect(
            `${baseUrl}/settings/integrations?hubspot_success=true`
        );
    } catch (error) {
        console.error("[HubSpot OAuth] Callback error:", error);
        return NextResponse.redirect(
            `${baseUrl}/settings/integrations?error=hubspot_callback_failed`
        );
    }
}
