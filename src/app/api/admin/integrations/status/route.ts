/**
 * Integration Environment Status API Route
 *
 * GET - Check presence of OAuth env vars for integrations (never returns actual values)
 */

import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";

export async function GET() {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
        google: {
            clientIdSet: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
            clientSecretSet: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        },
        hubspot: {
            clientIdSet: !!process.env.HUBSPOT_CLIENT_ID,
            clientSecretSet: !!process.env.HUBSPOT_CLIENT_SECRET,
        },
        asana: {
            clientIdSet: !!process.env.ASANA_CLIENT_ID,
            clientSecretSet: !!process.env.ASANA_CLIENT_SECRET,
        },
    });
}
