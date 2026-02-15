/**
 * Unified Inbox API
 *
 * GET /api/inbox - Get all channel messages across connected channels
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channelMessages, channelAccounts } from '@/lib/db/schema';
import { eq, and, desc, like, or, sql } from 'drizzle-orm';

/**
 * GET /api/inbox - Get unified inbox messages
 */
export async function GET(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const channel = searchParams.get('channel');
        const search = searchParams.get('search');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Get user's connected channel accounts
        const userAccounts = await db.select()
            .from(channelAccounts)
            .where(eq(channelAccounts.userId, userId));

        if (userAccounts.length === 0) {
            return NextResponse.json({
                messages: [],
                stats: [],
                total: 0,
            });
        }

        const accountIds = userAccounts.map(a => a.id);

        // Build query conditions
        const conditions = [];

        // Filter by channel type if specified
        if (channel) {
            const channelAccount = userAccounts.find(a => a.channelType === channel);
            if (channelAccount) {
                conditions.push(eq(channelMessages.channelAccountId, channelAccount.id));
            }
        } else {
            // Filter to only user's accounts
            conditions.push(
                or(...accountIds.map(id => eq(channelMessages.channelAccountId, id)))
            );
        }

        // Search filter
        if (search) {
            conditions.push(
                or(
                    like(channelMessages.content, `%${search}%`),
                    like(channelMessages.senderDisplayName, `%${search}%`)
                )
            );
        }

        // Get messages - using actual schema fields
        const messages = await db.select({
            id: channelMessages.id,
            channelAccountId: channelMessages.channelAccountId,
            externalMessageId: channelMessages.externalMessageId,
            externalThreadId: channelMessages.externalThreadId,
            content: channelMessages.content,
            senderDisplayName: channelMessages.senderDisplayName,
            attachments: channelMessages.attachments,
            status: channelMessages.status,
            processedAt: channelMessages.processedAt,
            conversationId: channelMessages.conversationId,
            createdAt: channelMessages.createdAt,
        })
            .from(channelMessages)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(channelMessages.createdAt))
            .limit(limit)
            .offset(offset);

        // Map account info to messages
        const accountMap = new Map(userAccounts.map(a => [a.id, a]));

        const formattedMessages = messages.map(m => {
            const account = accountMap.get(m.channelAccountId);
            return {
                id: m.id,
                channelType: account?.channelType || 'unknown',
                channelId: account?.channelId || '',
                channelName: account?.displayName || account?.channelType,
                content: m.content,
                senderName: m.senderDisplayName || 'Unknown',
                senderAvatar: null, // Not in schema, could be derived
                timestamp: m.createdAt.toISOString(),
                isRead: m.status === 'read',
                isProcessed: !!m.processedAt,
                conversationId: m.conversationId,
                threadId: m.externalThreadId,
                attachments: m.attachments || [],
            };
        });

        // Get stats per channel using SQL count
        const stats = await Promise.all(
            userAccounts.map(async (account) => {
                const unreadResult = await db.select({
                    count: sql<number>`count(*)::int`
                })
                    .from(channelMessages)
                    .where(and(
                        eq(channelMessages.channelAccountId, account.id),
                        or(
                            eq(channelMessages.status, 'pending'),
                            eq(channelMessages.status, 'received')
                        )
                    ));

                const totalResult = await db.select({
                    count: sql<number>`count(*)::int`
                })
                    .from(channelMessages)
                    .where(eq(channelMessages.channelAccountId, account.id));

                return {
                    type: account.channelType,
                    unread: unreadResult[0]?.count || 0,
                    total: totalResult[0]?.count || 0,
                };
            })
        );

        return NextResponse.json({
            messages: formattedMessages,
            stats,
            total: formattedMessages.length,
        });
    } catch (error) {
        console.error('[API] Inbox fetch error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
