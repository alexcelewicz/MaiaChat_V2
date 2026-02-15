import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ipBlocks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getAdminSettings } from "@/lib/admin/settings";

function getClientIp(request: NextRequest): string | null {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        const first = forwardedFor.split(",")[0]?.trim();
        if (first) return first;
    }
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp.trim();
    return null;
}

export async function GET(request: NextRequest) {
    try {
        const settings = await getAdminSettings();
        if (!settings.ipFilteringEnabled) {
            return NextResponse.json({ blocked: false });
        }

        const ip = request.nextUrl.searchParams.get("ip") || getClientIp(request);
        if (!ip) {
            return NextResponse.json({ blocked: false });
        }

        const [block] = await db.select()
            .from(ipBlocks)
            .where(and(
                eq(ipBlocks.ipAddress, ip),
                eq(ipBlocks.isActive, true)
            ))
            .limit(1);

        return NextResponse.json({ blocked: Boolean(block) });
    } catch (error) {
        console.error("[IP Blocks] Check error:", error);
        return NextResponse.json({ blocked: false });
    }
}
