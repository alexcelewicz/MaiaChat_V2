/**
 * Channel Account Management API
 *
 * PATCH /api/channels/[id] - Update channel settings
 * DELETE /api/channels/[id] - Disconnect channel
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channelAccounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * PATCH /api/channels/[id] - Update channel settings
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const { isActive, config, displayName } = body;

        // Build update object
        const updates: Record<string, unknown> = { updatedAt: new Date() };

        if (typeof isActive === 'boolean') {
            updates.isActive = isActive;
        }
        if (config !== undefined) {
            updates.config = config;
        }
        if (displayName !== undefined) {
            updates.displayName = displayName;
        }

        const [account] = await db.update(channelAccounts)
            .set(updates)
            .where(and(
                eq(channelAccounts.id, id),
                eq(channelAccounts.userId, userId)
            ))
            .returning({
                id: channelAccounts.id,
                channelType: channelAccounts.channelType,
                displayName: channelAccounts.displayName,
                isActive: channelAccounts.isActive,
                config: channelAccounts.config,
                updatedAt: channelAccounts.updatedAt,
            });

        if (!account) {
            return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
        }

        return NextResponse.json({ account });
    } catch (error) {
        console.error('[API] Update channel error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

/**
 * DELETE /api/channels/[id] - Disconnect channel
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const deleted = await db.delete(channelAccounts)
            .where(and(
                eq(channelAccounts.id, id),
                eq(channelAccounts.userId, userId)
            ))
            .returning({ id: channelAccounts.id });

        if (!deleted.length) {
            return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API] Disconnect channel error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

/**
 * GET /api/channels/[id] - Get channel details
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const [account] = await db.select({
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
            .where(and(
                eq(channelAccounts.id, id),
                eq(channelAccounts.userId, userId)
            ));

        if (!account) {
            return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
        }

        return NextResponse.json({ account });
    } catch (error) {
        console.error('[API] Get channel error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
