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
import { encrypt } from '@/lib/crypto';

/**
 * PATCH /api/channels/[id] - Update channel settings
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { isActive, config, displayName, accessToken, channelId } = body;

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
    if (typeof accessToken === 'string' && accessToken.trim()) {
      updates.accessToken = encrypt(accessToken.trim());
    }
    if (typeof channelId === 'string' && channelId.trim()) {
      updates.channelId = channelId.trim();
    }

    const credentialsChanged = updates.accessToken !== undefined || updates.channelId !== undefined;

    const [account] = await db
      .update(channelAccounts)
      .set(updates)
      .where(and(eq(channelAccounts.id, id), eq(channelAccounts.userId, userId)))
      .returning({
        id: channelAccounts.id,
        channelType: channelAccounts.channelType,
        channelId: channelAccounts.channelId,
        displayName: channelAccounts.displayName,
        isActive: channelAccounts.isActive,
        config: channelAccounts.config,
        updatedAt: channelAccounts.updatedAt,
      });

    if (!account) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    // Restart channel connector when credentials change
    if (credentialsChanged && account.isActive) {
      try {
        const { getBackgroundService } = await import('@/lib/channels/background-service');
        const service = getBackgroundService();
        await service.stopChannel(userId, id).catch(() => {});
        service.startChannel(userId, id).catch((err) => {
          console.warn('[API] Channel restart after credential update failed:', err);
        });
      } catch (importErr) {
        console.warn('[API] Could not import background service for restart:', importErr);
      }
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

    const deleted = await db
      .delete(channelAccounts)
      .where(and(eq(channelAccounts.id, id), eq(channelAccounts.userId, userId)))
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
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const [account] = await db
      .select({
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
      .where(and(eq(channelAccounts.id, id), eq(channelAccounts.userId, userId)));

    if (!account) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    return NextResponse.json({ account });
  } catch (error) {
    console.error('[API] Get channel error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
