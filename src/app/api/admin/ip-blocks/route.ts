import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { ipBlocks } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
    try {
        await requireAdmin();
        const blocks = await db.select()
            .from(ipBlocks)
            .orderBy(desc(ipBlocks.createdAt));

        return NextResponse.json({ blocks });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        const status = message.includes("Unauthorized") ? 401 : 403;
        return NextResponse.json({ error: message }, { status });
    }
}

export async function POST(request: NextRequest) {
    try {
        await requireAdmin();
        const payload = await request.json();

        const ipAddress = typeof payload.ipAddress === "string" ? payload.ipAddress.trim() : "";
        const label = typeof payload.label === "string" ? payload.label.trim() : null;
        const isActive = payload.isActive !== false;

        if (!ipAddress) {
            return NextResponse.json({ error: "IP address is required" }, { status: 400 });
        }

        const [block] = await db.insert(ipBlocks)
            .values({
                ipAddress,
                label,
                isActive,
            })
            .returning();

        return NextResponse.json({ block }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        const status = message.includes("Unauthorized") ? 401 : 403;
        return NextResponse.json({ error: message }, { status });
    }
}
