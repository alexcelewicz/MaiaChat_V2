/**
 * Channel Contacts API
 *
 * GET /api/channels/[id]/contacts - Fetch known contacts (distinct senders from channel messages)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channelAccounts, channelMessages } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

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

        // Verify channel belongs to user
        const [account] = await db.select({ id: channelAccounts.id })
            .from(channelAccounts)
            .where(and(
                eq(channelAccounts.id, id),
                eq(channelAccounts.userId, userId)
            ));

        if (!account) {
            return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
        }

        // Get distinct senders from inbound channel messages.
        // Use senderExternalId when available, fall back to senderDisplayName for older WhatsApp
        // messages where the connector stored empty sender IDs (fixed in connector.ts).
        const contacts = await db
            .select({
                id: sql<string>`COALESCE(NULLIF(${channelMessages.senderExternalId}, ''), ${channelMessages.senderDisplayName})`,
                name: channelMessages.senderDisplayName,
                lastMessageAt: sql<string>`MAX(${channelMessages.createdAt})`,
                messageCount: sql<number>`COUNT(*)`,
            })
            .from(channelMessages)
            .where(and(
                eq(channelMessages.channelAccountId, id),
                eq(channelMessages.direction, 'inbound'),
                // Must have at least a name or ID
                sql`COALESCE(${channelMessages.senderExternalId}, ${channelMessages.senderDisplayName}, '') != ''`
            ))
            .groupBy(
                sql`COALESCE(NULLIF(${channelMessages.senderExternalId}, ''), ${channelMessages.senderDisplayName})`,
                channelMessages.senderDisplayName,
            )
            .orderBy(sql`MAX(${channelMessages.createdAt}) DESC`);

        return NextResponse.json({ contacts });
    } catch (error) {
        console.error('[API] Get channel contacts error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
