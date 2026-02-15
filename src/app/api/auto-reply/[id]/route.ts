/**
 * Auto-Reply Rule Management API
 *
 * GET /api/auto-reply/[id] - Get rule details
 * PATCH /api/auto-reply/[id] - Update rule
 * DELETE /api/auto-reply/[id] - Delete rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { autoReplyRules } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/auto-reply/[id] - Get rule details
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

        const [rule] = await db.select()
            .from(autoReplyRules)
            .where(and(
                eq(autoReplyRules.id, id),
                eq(autoReplyRules.userId, userId)
            ));

        if (!rule) {
            return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
        }

        return NextResponse.json({ rule });
    } catch (error) {
        console.error('[API] Get auto-reply rule error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

/**
 * PATCH /api/auto-reply/[id] - Update rule
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
        const payload = await request.json();

        // Build update object with only allowed fields
        const allowedFields = [
            'name',
            'priority',
            'isEnabled',
            'channelAccountId',
            'triggerType',
            'triggerPattern',
            'triggerConfig',
            'actionType',
            'actionConfig',
            'maxTriggersPerHour',
            'cooldownSeconds',
        ];

        const updates: Record<string, unknown> = { updatedAt: new Date() };

        for (const field of allowedFields) {
            if (payload[field] !== undefined) {
                updates[field] = payload[field];
            }
        }

        const [rule] = await db.update(autoReplyRules)
            .set(updates)
            .where(and(
                eq(autoReplyRules.id, id),
                eq(autoReplyRules.userId, userId)
            ))
            .returning();

        if (!rule) {
            return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
        }

        return NextResponse.json({ rule });
    } catch (error) {
        console.error('[API] Update auto-reply rule error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

/**
 * DELETE /api/auto-reply/[id] - Delete rule
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

        const deleted = await db.delete(autoReplyRules)
            .where(and(
                eq(autoReplyRules.id, id),
                eq(autoReplyRules.userId, userId)
            ))
            .returning({ id: autoReplyRules.id });

        if (!deleted.length) {
            return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API] Delete auto-reply rule error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
