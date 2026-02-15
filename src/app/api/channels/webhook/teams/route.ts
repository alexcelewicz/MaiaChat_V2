/**
 * Microsoft Teams Webhook Endpoint
 *
 * Receives incoming activities (messages, edits, deletes) from
 * the Microsoft Bot Framework and routes them to the Teams connector.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { channelAccounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getChannelManager } from "@/lib/channels/manager";
import { TeamsConnector } from "@/lib/channels/teams/connector";

export async function POST(request: NextRequest) {
    try {
        const activity = await request.json();

        if (!activity || !activity.type) {
            return NextResponse.json({ error: "Invalid activity" }, { status: 400 });
        }

        // Find an active Teams account from DB to get userId
        const [teamsAccount] = await db
            .select()
            .from(channelAccounts)
            .where(
                and(
                    eq(channelAccounts.channelType, "teams"),
                    eq(channelAccounts.isActive, true)
                )
            )
            .limit(1);

        if (!teamsAccount) {
            return NextResponse.json(
                { error: "No Teams channel configured" },
                { status: 404 }
            );
        }

        // Get the connector from the ChannelManager
        const channelManager = getChannelManager();
        const connector = channelManager.findConnectorByType(
            teamsAccount.userId,
            "teams"
        );

        if (!connector) {
            return NextResponse.json(
                { error: "Teams channel is not currently active" },
                { status: 503 }
            );
        }

        const teamsConnector = connector as TeamsConnector;

        // Validate the incoming request JWT from Microsoft Bot Framework
        const authHeader = request.headers.get("authorization") ?? undefined;
        const isValid = await teamsConnector.validateIncomingRequest(authHeader);

        if (!isValid) {
            console.warn("[Teams Webhook] Invalid authentication");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Route the activity to the connector asynchronously.
        // Microsoft Bot Framework expects a response within ~15s — if AI processing
        // takes longer, the webhook times out and Microsoft retries, causing duplicates.
        // Fire-and-forget with error logging prevents this.
        teamsConnector.handleIncomingActivity(activity).catch((err) => {
            console.error("[Teams Webhook] Background processing error:", err);
        });

        // Acknowledge immediately — processing continues in background
        return NextResponse.json({ status: "ok" }, { status: 200 });
    } catch (error) {
        console.error("[Teams Webhook] Error processing activity:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
