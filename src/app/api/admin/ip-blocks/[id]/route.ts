import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { ipBlocks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireAdmin();
        const { id } = await params;
        const payload = await request.json();

        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (typeof payload.isActive === "boolean") {
            updates.isActive = payload.isActive;
        }
        if (typeof payload.label === "string") {
            updates.label = payload.label.trim();
        }

        const [block] = await db.update(ipBlocks)
            .set(updates)
            .where(eq(ipBlocks.id, id))
            .returning();

        if (!block) {
            return NextResponse.json({ error: "IP block not found" }, { status: 404 });
        }

        return NextResponse.json({ block });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        const status = message.includes("Unauthorized") ? 401 : 403;
        return NextResponse.json({ error: message }, { status });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireAdmin();
        const { id } = await params;

        const deleted = await db.delete(ipBlocks)
            .where(eq(ipBlocks.id, id))
            .returning();

        if (!deleted.length) {
            return NextResponse.json({ error: "IP block not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        const status = message.includes("Unauthorized") ? 401 : 403;
        return NextResponse.json({ error: message }, { status });
    }
}
