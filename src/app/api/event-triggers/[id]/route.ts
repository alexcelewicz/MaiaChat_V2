/**
 * Event Trigger Detail API
 *
 * GET - Get trigger details
 * PATCH - Update trigger
 * DELETE - Delete trigger
 * POST - Test/fire trigger manually
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { eventTriggers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { fireTrigger, type TriggerEvent } from "@/lib/events";

interface RouteParams {
    params: Promise<{ id: string }>;
}

// ============================================================================
// GET - Get trigger details
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        const [trigger] = await db
            .select()
            .from(eventTriggers)
            .where(and(eq(eventTriggers.id, id), eq(eventTriggers.userId, userId)))
            .limit(1);

        if (!trigger) {
            return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
        }

        return NextResponse.json({ trigger });
    } catch (error) {
        console.error("[API] Event trigger get error:", error);
        return NextResponse.json(
            { error: "Failed to get event trigger" },
            { status: 500 }
        );
    }
}

// ============================================================================
// PATCH - Update trigger
// ============================================================================

export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();

        const {
            name,
            description,
            sourceConfig,
            actionConfig,
            isEnabled,
            maxTriggersPerHour,
            cooldownSeconds,
        } = body;

        // Verify ownership
        const [existing] = await db
            .select()
            .from(eventTriggers)
            .where(and(eq(eventTriggers.id, id), eq(eventTriggers.userId, userId)))
            .limit(1);

        if (!existing) {
            return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
        }

        // Build update object
        const updates: Partial<typeof eventTriggers.$inferInsert> = {
            updatedAt: new Date(),
        };

        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (sourceConfig !== undefined) updates.sourceConfig = sourceConfig;
        if (actionConfig !== undefined) updates.actionConfig = actionConfig;
        if (isEnabled !== undefined) updates.isEnabled = isEnabled;
        if (maxTriggersPerHour !== undefined) updates.maxTriggersPerHour = maxTriggersPerHour;
        if (cooldownSeconds !== undefined) updates.cooldownSeconds = cooldownSeconds;

        const [trigger] = await db
            .update(eventTriggers)
            .set(updates)
            .where(and(eq(eventTriggers.id, id), eq(eventTriggers.userId, userId)))
            .returning();

        return NextResponse.json({ trigger });
    } catch (error) {
        console.error("[API] Event trigger update error:", error);
        return NextResponse.json(
            { error: "Failed to update event trigger" },
            { status: 500 }
        );
    }
}

// ============================================================================
// DELETE - Delete trigger
// ============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Verify ownership
        const [existing] = await db
            .select()
            .from(eventTriggers)
            .where(and(eq(eventTriggers.id, id), eq(eventTriggers.userId, userId)))
            .limit(1);

        if (!existing) {
            return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
        }

        await db
            .delete(eventTriggers)
            .where(and(eq(eventTriggers.id, id), eq(eventTriggers.userId, userId)));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[API] Event trigger delete error:", error);
        return NextResponse.json(
            { error: "Failed to delete event trigger" },
            { status: 500 }
        );
    }
}

// ============================================================================
// POST - Test/fire trigger manually
// ============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const { testPayload } = body;

        // Verify ownership
        const [trigger] = await db
            .select()
            .from(eventTriggers)
            .where(and(eq(eventTriggers.id, id), eq(eventTriggers.userId, userId)))
            .limit(1);

        if (!trigger) {
            return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
        }

        // Build test event
        const testEvent: TriggerEvent = {
            sourceType: trigger.sourceType as "webhook" | "file_watch" | "email" | "schedule",
            payload: testPayload || { test: true, timestamp: new Date().toISOString() },
            metadata: {
                path: "/test",
                method: "POST",
            },
        };

        // Fire the trigger
        const result = await fireTrigger(id, testEvent);

        return NextResponse.json({
            success: result.success,
            status: result.status,
            output: result.output,
            error: result.error,
            durationMs: result.durationMs,
        });
    } catch (error) {
        console.error("[API] Event trigger test error:", error);
        return NextResponse.json(
            { error: "Failed to test event trigger" },
            { status: 500 }
        );
    }
}
