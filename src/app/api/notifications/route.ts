import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { z } from "zod";

export async function GET(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const unreadOnly = request.nextUrl.searchParams.get("unread") === "true";

        const conditions = [eq(notifications.userId, userId)];
        if (unreadOnly) {
            conditions.push(eq(notifications.isRead, false));
        }

        const items = await db.select()
            .from(notifications)
            .where(and(...conditions))
            .orderBy(desc(notifications.createdAt))
            .limit(50);

        const [countResult] = await db.select({ value: count() })
            .from(notifications)
            .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

        return NextResponse.json({
            notifications: items,
            unreadCount: countResult?.value ?? 0,
        });
    } catch (error) {
        console.error("[Notifications] GET error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const schema = z.object({
            type: z.string().min(1).max(50),
            title: z.string().min(1).max(200),
            body: z.string().max(2000).optional(),
            link: z.string().url().max(500).optional(),
            icon: z.string().max(50).optional(),
        });

        const validation = schema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
        }

        const { type, title, body: notifBody, link, icon } = validation.data;

        const [notification] = await db.insert(notifications).values({
            userId,
            type,
            title,
            body: notifBody || null,
            link: link || null,
            icon: icon || null,
        }).returning();

        return NextResponse.json({ notification }, { status: 201 });
    } catch (error) {
        console.error("[Notifications] POST error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const patchSchema = z.object({
            id: z.string().uuid().optional(),
            markAllRead: z.boolean().optional(),
        }).strict();
        const validation = patchSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
        }
        const { id, markAllRead } = validation.data;

        if (markAllRead) {
            await db.update(notifications)
                .set({ isRead: true })
                .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
            return NextResponse.json({ success: true });
        }

        if (!id) {
            return NextResponse.json({ error: "id is required" }, { status: 400 });
        }

        await db.update(notifications)
            .set({ isRead: true })
            .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Notifications] PATCH error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
