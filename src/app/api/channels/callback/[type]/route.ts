/**
 * GET /api/channels/callback/[type] - OAuth callback handler
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channelAccounts } from '@/lib/db/schema';
import { redis } from '@/lib/redis';
import { encrypt } from '@/lib/crypto';
import { SlackConnector, DiscordConnector } from '@/lib/channels';

// Connector factories for OAuth-enabled channels
const OAUTH_CONNECTORS: Record<string, () => {
    handleAuthCallback?: (code: string, state: string) => Promise<{
        channelType: string;
        credentials: Record<string, string>;
        settings?: Record<string, unknown>;
    }>;
}> = {
    slack: () => new SlackConnector(),
    discord: () => new DiscordConnector(),
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ type: string }> }
) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    try {
        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        // Handle OAuth errors
        if (error) {
            console.error('[OAuth] Provider error:', error);
            return NextResponse.redirect(`${appUrl}/settings/channels?error=${error}`);
        }

        if (!code || !state) {
            return NextResponse.redirect(`${appUrl}/settings/channels?error=missing_params`);
        }

        // Verify state token
        const stateData = await redis.get(`channel_oauth:${state}`);
        if (!stateData) {
            return NextResponse.redirect(`${appUrl}/settings/channels?error=invalid_state`);
        }

        const { userId, channelType: expectedType } = JSON.parse(stateData);
        await redis.del(`channel_oauth:${state}`);

        const { type: channelType } = await params;

        // Verify channel type matches
        if (channelType !== expectedType) {
            return NextResponse.redirect(`${appUrl}/settings/channels?error=type_mismatch`);
        }

        // Get connector and exchange code for tokens
        const connectorFactory = OAUTH_CONNECTORS[channelType];
        if (!connectorFactory) {
            return NextResponse.redirect(`${appUrl}/settings/channels?error=unknown_channel`);
        }

        const connector = connectorFactory();
        if (!connector.handleAuthCallback) {
            return NextResponse.redirect(`${appUrl}/settings/channels?error=no_oauth_handler`);
        }

        const config = await connector.handleAuthCallback(code, state);

        // Determine channel and account IDs from credentials
        const channelId = config.credentials.teamId ||
                         config.credentials.guildId ||
                         config.credentials.chatId ||
                         crypto.randomUUID();

        const accountId = config.credentials.botUserId ||
                         config.credentials.userId ||
                         'bot';

        const displayName = config.credentials.teamName ||
                           config.credentials.guildName ||
                           config.credentials.chatName ||
                           `${channelType} Account`;

        // Store channel account (upsert)
        await db.insert(channelAccounts).values({
            userId,
            channelType,
            channelId,
            accountId,
            accessToken: config.credentials.botToken || config.credentials.accessToken
                ? encrypt(config.credentials.botToken || config.credentials.accessToken)
                : null,
            refreshToken: config.credentials.refreshToken
                ? encrypt(config.credentials.refreshToken)
                : null,
            config: config.settings || {},
            displayName,
            isActive: true,
        }).onConflictDoUpdate({
            target: [channelAccounts.userId, channelAccounts.channelType, channelAccounts.channelId],
            set: {
                accessToken: config.credentials.botToken || config.credentials.accessToken
                    ? encrypt(config.credentials.botToken || config.credentials.accessToken)
                    : null,
                refreshToken: config.credentials.refreshToken
                    ? encrypt(config.credentials.refreshToken)
                    : null,
                displayName,
                isActive: true,
                updatedAt: new Date(),
            },
        });

        return NextResponse.redirect(`${appUrl}/settings/channels?success=true`);
    } catch (error) {
        console.error('[OAuth] Callback error:', error);
        return NextResponse.redirect(`${appUrl}/settings/channels?error=internal`);
    }
}
