/**
 * Google OAuth Callback Handler
 *
 * Handles the OAuth callback from Google after user authorization.
 * Exchanges the authorization code for tokens and stores them.
 */

import { NextRequest, NextResponse } from "next/server";
import { completeOAuthFlow } from "@/lib/integrations/google/oauth";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Get the base URL for redirects
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Handle OAuth errors
    if (error) {
        console.error("[Google OAuth] Error from Google:", error);
        return NextResponse.redirect(
            `${baseUrl}/settings/integrations?error=${encodeURIComponent(error)}`
        );
    }

    // Validate required parameters
    if (!code || !state) {
        console.error("[Google OAuth] Missing code or state parameter");
        return NextResponse.redirect(
            `${baseUrl}/settings/integrations?error=missing_parameters`
        );
    }

    try {
        // Complete the OAuth flow
        const result = await completeOAuthFlow(code, state);

        if (!result.success) {
            console.error("[Google OAuth] Flow failed:", result.error);
            return NextResponse.redirect(
                `${baseUrl}/settings/integrations?error=${encodeURIComponent(result.error || "oauth_failed")}`
            );
        }

        // Success - redirect to settings with success message
        const email = result.credentials?.email || "";
        return NextResponse.redirect(
            `${baseUrl}/settings/integrations?success=google_connected&email=${encodeURIComponent(email)}`
        );
    } catch (error) {
        console.error("[Google OAuth] Callback error:", error);
        return NextResponse.redirect(
            `${baseUrl}/settings/integrations?error=callback_failed`
        );
    }
}
