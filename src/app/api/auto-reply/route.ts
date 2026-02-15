/**
 * Auto-Reply Rules API
 *
 * GET /api/auto-reply - List all rules
 * POST /api/auto-reply - Create a new rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { autoReplyRules } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * GET /api/auto-reply - List all auto-reply rules
 */
export async function GET() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rules = await db.select()
            .from(autoReplyRules)
            .where(eq(autoReplyRules.userId, userId))
            .orderBy(desc(autoReplyRules.priority));

        return NextResponse.json({ rules });
    } catch (error) {
        console.error('[API] List auto-reply rules error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

/**
 * POST /api/auto-reply - Create a new auto-reply rule
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await request.json();

        // Validate required fields
        if (!payload.name || !payload.triggerType || !payload.actionType) {
            return NextResponse.json(
                { error: 'Missing required fields: name, triggerType, actionType' },
                { status: 400 }
            );
        }

        // Validate trigger type
        const validTriggerTypes = ['keyword', 'regex', 'sender', 'time', 'all'];
        if (!validTriggerTypes.includes(payload.triggerType)) {
            return NextResponse.json(
                { error: `Invalid triggerType. Must be one of: ${validTriggerTypes.join(', ')}` },
                { status: 400 }
            );
        }

        // Validate action type
        const validActionTypes = ['reply', 'forward', 'agent', 'skill'];
        if (!validActionTypes.includes(payload.actionType)) {
            return NextResponse.json(
                { error: `Invalid actionType. Must be one of: ${validActionTypes.join(', ')}` },
                { status: 400 }
            );
        }

        const [rule] = await db.insert(autoReplyRules)
            .values({
                userId,
                channelAccountId: payload.channelAccountId ?? null,
                name: payload.name,
                priority: payload.priority ?? 0,
                isEnabled: payload.isEnabled ?? true,
                triggerType: payload.triggerType,
                triggerPattern: payload.triggerPattern ?? null,
                triggerConfig: payload.triggerConfig ?? null,
                actionType: payload.actionType,
                actionConfig: payload.actionConfig ?? null,
                maxTriggersPerHour: payload.maxTriggersPerHour ?? null,
                cooldownSeconds: payload.cooldownSeconds ?? null,
            })
            .returning();

        return NextResponse.json({ rule }, { status: 201 });
    } catch (error) {
        console.error('[API] Create auto-reply rule error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
