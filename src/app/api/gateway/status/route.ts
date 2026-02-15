/**
 * Gateway Status API
 *
 * GET /api/gateway/status - Get gateway connection status
 */

import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channelAccounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get active channel count
        const activeChannels = await db.select({ id: channelAccounts.id })
            .from(channelAccounts)
            .where(and(
                eq(channelAccounts.userId, userId),
                eq(channelAccounts.isActive, true)
            ));

        // Check if any channels are actively connected
        const hasActiveChannels = activeChannels.length > 0;

        return NextResponse.json({
            status: hasActiveChannels ? 'connected' : 'disconnected',
            activeChannels: activeChannels.length,
            messageQueueSize: 0,
        });
    } catch (error) {
        console.error('[API] Gateway status error:', error);
        return NextResponse.json({
            status: 'error',
            error: 'Failed to check gateway status',
        }, { status: 500 });
    }
}
