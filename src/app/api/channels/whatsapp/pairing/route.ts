/**
 * GET /api/channels/whatsapp/pairing?accountId=xxx
 *
 * Returns the current WhatsApp QR pairing state for a channel account.
 * Polled by the ManualConnectDialog to show QR codes in the frontend.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channelAccounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPairingState } from '@/lib/channels/whatsapp/pairing-state';

export async function GET(request: NextRequest) {
    const userId = await getSessionUserId();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = request.nextUrl.searchParams.get('accountId');
    if (!accountId) {
        return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    // Verify the account belongs to this user
    const [account] = await db.select({ id: channelAccounts.id })
        .from(channelAccounts)
        .where(and(
            eq(channelAccounts.id, accountId),
            eq(channelAccounts.userId, userId),
        ))
        .limit(1);

    if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const state = getPairingState(accountId);

    return NextResponse.json({
        status: state?.status ?? 'waiting_qr',
        qr: state?.qr ?? null,
        updatedAt: state?.updatedAt ?? null,
        error: state?.error ?? null,
    });
}
