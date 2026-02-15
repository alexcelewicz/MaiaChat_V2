/**
 * GET /api/channels/connect/[type] - Start OAuth flow for a channel
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { redis } from '@/lib/redis';
import { SlackConnector, DiscordConnector } from '@/lib/channels';

// Connector factories for OAuth-enabled channels
const OAUTH_CONNECTORS: Record<string, () => { getAuthUrl?: (state: string) => string }> = {
    slack: () => new SlackConnector(),
    discord: () => new DiscordConnector(),
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ type: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { type: channelType } = await params;
        const connectorFactory = OAUTH_CONNECTORS[channelType];

        if (!connectorFactory) {
            return NextResponse.json(
                { error: 'Channel type does not support OAuth or is unknown' },
                { status: 400 }
            );
        }

        const connector = connectorFactory();
        if (!connector.getAuthUrl) {
            return NextResponse.json(
                { error: 'Channel type does not support OAuth' },
                { status: 400 }
            );
        }

        // Generate state token for CSRF protection
        const state = crypto.randomUUID();
        await redis.setex(
            `channel_oauth:${state}`,
            600, // 10 minutes
            JSON.stringify({ userId, channelType })
        );

        const authUrl = connector.getAuthUrl(state);

        return NextResponse.json({ authUrl });
    } catch (error) {
        console.error('[API] Channel connect error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
