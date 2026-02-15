/**
 * Asana OAuth Callback Handler
 *
 * Handles the OAuth callback from Asana after user authorization.
 * Exchanges the authorization code for tokens and stores them.
 */

import { NextRequest, NextResponse } from "next/server";
import {
    completeAsanaOAuthFlow,
} from "@/lib/integrations/asana/oauth";

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
        console.error("[Asana OAuth] Missing code or state parameter");
        return NextResponse.redirect(
            `${baseUrl}/settings/integrations?error=missing_parameters`
        );
    }

    try {
        const result = await completeAsanaOAuthFlow(code, state);
        if (!result.success) {
            console.error("[Asana OAuth] Callback validation failed:", result.error);
            const errorCode = result.error?.toLowerCase().includes("state")
                ? "invalid_state"
                : "asana_callback_failed";
            return NextResponse.redirect(
                `${baseUrl}/settings/integrations?error=${errorCode}`
            );
        }

        return NextResponse.redirect(
            `${baseUrl}/settings/integrations?asana_success=true`
        );
    } catch (error) {
        console.error("[Asana OAuth] Callback error:", error);
        return NextResponse.redirect(
            `${baseUrl}/settings/integrations?error=asana_callback_failed`
        );
    }
}
