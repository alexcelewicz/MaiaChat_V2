/**
 * GET /api/channels - List connected channel accounts
 */

import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channelAccounts } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const accounts = await db.select({
            id: channelAccounts.id,
            channelType: channelAccounts.channelType,
            channelId: channelAccounts.channelId,
            displayName: channelAccounts.displayName,
            avatarUrl: channelAccounts.avatarUrl,
            isActive: channelAccounts.isActive,
            config: channelAccounts.config,
            lastSyncAt: channelAccounts.lastSyncAt,
            createdAt: channelAccounts.createdAt,
            updatedAt: channelAccounts.updatedAt,
        })
            .from(channelAccounts)
            .where(eq(channelAccounts.userId, userId))
            .orderBy(desc(channelAccounts.updatedAt));

        return NextResponse.json({ accounts });
    } catch (error) {
        console.error('[API] List channels error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
