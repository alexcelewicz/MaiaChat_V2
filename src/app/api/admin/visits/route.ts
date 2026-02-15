import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pageVisits } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import { getSessionUserId } from "@/lib/auth/session";

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
        await requireAdmin();
        const limitParam = request.nextUrl.searchParams.get("limit");
        const limit = limitParam ? Math.min(500, Math.max(1, Number(limitParam))) : 200;

        const visits = await db.select()
            .from(pageVisits)
            .orderBy(desc(pageVisits.createdAt))
            .limit(limit);

        return NextResponse.json({ visits });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        const status = message.includes("Unauthorized") ? 401 : 403;
        return NextResponse.json({ error: message }, { status });
    }
}

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json();
        const path = typeof payload.path === "string" ? payload.path : "/";
        const method = typeof payload.method === "string" ? payload.method : "GET";
        const ipAddress = typeof payload.ipAddress === "string" ? payload.ipAddress : getClientIp(request);
        const userAgent = typeof payload.userAgent === "string" ? payload.userAgent : request.headers.get("user-agent") || "";
        const referer = typeof payload.referer === "string" ? payload.referer : request.headers.get("referer") || "";
        const isBot = typeof payload.isBot === "boolean" ? payload.isBot : /bot|crawler|spider|crawl/i.test(userAgent);

        const userId = await getSessionUserId();

        await db.insert(pageVisits).values({
            userId: userId || null,
            path,
            method,
            ipAddress: ipAddress || null,
            country: typeof payload.country === "string" ? payload.country : null,
            region: typeof payload.region === "string" ? payload.region : null,
            city: typeof payload.city === "string" ? payload.city : null,
            latitude: payload.latitude !== undefined && payload.latitude !== null
                ? String(payload.latitude)
                : null,
            longitude: payload.longitude !== undefined && payload.longitude !== null
                ? String(payload.longitude)
                : null,
            timezone: typeof payload.timezone === "string" ? payload.timezone : null,
            userAgent,
            referer,
            isBot,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Admin] Visit log error:", error);
        return NextResponse.json({ success: false }, { status: 200 });
    }
}
