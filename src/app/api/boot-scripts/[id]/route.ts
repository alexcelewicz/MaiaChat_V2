/**
 * Boot Script Detail API
 *
 * GET - Get script details
 * PATCH - Update script
 * DELETE - Delete script
 * POST - Run script manually
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { bootScripts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { runBootScript } from "@/lib/boot";

interface RouteParams {
    params: Promise<{ id: string }>;
}

// ============================================================================
// GET - Get script details
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        const [script] = await db
            .select()
            .from(bootScripts)
            .where(and(eq(bootScripts.id, id), eq(bootScripts.userId, userId)))
            .limit(1);

        if (!script) {
            return NextResponse.json({ error: "Script not found" }, { status: 404 });
        }

        return NextResponse.json({ script });
    } catch (error) {
        console.error("[API] Boot script get error:", error);
        return NextResponse.json(
            { error: "Failed to get boot script" },
            { status: 500 }
        );
    }
}

// ============================================================================
// PATCH - Update script
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
            content,
            runOnServerStart,
            runOnChannelStart,
            runOnSchedule,
            isEnabled,
            priority,
        } = body;

        // Verify ownership
        const [existing] = await db
            .select()
            .from(bootScripts)
            .where(and(eq(bootScripts.id, id), eq(bootScripts.userId, userId)))
            .limit(1);

        if (!existing) {
            return NextResponse.json({ error: "Script not found" }, { status: 404 });
        }

        // Build update object
        const updates: Partial<typeof bootScripts.$inferInsert> = {
            updatedAt: new Date(),
        };

        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (content !== undefined) updates.content = content;
        if (runOnServerStart !== undefined) updates.runOnServerStart = runOnServerStart;
        if (runOnChannelStart !== undefined) updates.runOnChannelStart = runOnChannelStart;
        if (runOnSchedule !== undefined) updates.runOnSchedule = runOnSchedule;
        if (isEnabled !== undefined) updates.isEnabled = isEnabled;
        if (priority !== undefined) updates.priority = priority;

        const [script] = await db
            .update(bootScripts)
            .set(updates)
            .where(and(eq(bootScripts.id, id), eq(bootScripts.userId, userId)))
            .returning();

        return NextResponse.json({ script });
    } catch (error) {
        console.error("[API] Boot script update error:", error);
        return NextResponse.json(
            { error: "Failed to update boot script" },
            { status: 500 }
        );
    }
}

// ============================================================================
// DELETE - Delete script
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
            .from(bootScripts)
            .where(and(eq(bootScripts.id, id), eq(bootScripts.userId, userId)))
            .limit(1);

        if (!existing) {
            return NextResponse.json({ error: "Script not found" }, { status: 404 });
        }

        await db
            .delete(bootScripts)
            .where(and(eq(bootScripts.id, id), eq(bootScripts.userId, userId)));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[API] Boot script delete error:", error);
        return NextResponse.json(
            { error: "Failed to delete boot script" },
            { status: 500 }
        );
    }
}

// ============================================================================
// POST - Run script manually
// ============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Verify ownership
        const [script] = await db
            .select()
            .from(bootScripts)
            .where(and(eq(bootScripts.id, id), eq(bootScripts.userId, userId)))
            .limit(1);

        if (!script) {
            return NextResponse.json({ error: "Script not found" }, { status: 404 });
        }

        // Run the script
        const result = await runBootScript(id);

        return NextResponse.json({
            success: result.success,
            output: result.output,
            error: result.error,
            durationMs: result.durationMs,
        });
    } catch (error) {
        console.error("[API] Boot script run error:", error);
        return NextResponse.json(
            { error: "Failed to run boot script" },
            { status: 500 }
        );
    }
}
