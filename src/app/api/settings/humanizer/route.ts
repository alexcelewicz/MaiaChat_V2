/**
 * Humanizer Settings API
 *
 * GET  - Read current humanizer settings from user preferences
 * PUT  - Update humanizer settings in user preferences
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface HumanizerPreferences {
    enabled: boolean;
    level: "light" | "moderate" | "aggressive";
    categories: string[];
}

export async function GET() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [user] = await db
            .select({ preferences: users.preferences })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        const prefs = (user?.preferences as Record<string, unknown>) || {};
        const humanizer = (prefs.humanizer as HumanizerPreferences) || {
            enabled: false,
            level: "moderate",
            categories: [],
        };

        return NextResponse.json(humanizer);
    } catch (error) {
        console.error("[API] Get humanizer settings error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { enabled, level, categories } = body;

        // Validate
        if (typeof enabled !== "boolean") {
            return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
        }
        if (!["light", "moderate", "aggressive"].includes(level)) {
            return NextResponse.json({ error: "Invalid level" }, { status: 400 });
        }
        if (!Array.isArray(categories)) {
            return NextResponse.json({ error: "categories must be array" }, { status: 400 });
        }

        // Read current preferences, merge humanizer settings
        const [user] = await db
            .select({ preferences: users.preferences })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        const currentPrefs = (user?.preferences as Record<string, unknown>) || {};
        const updatedPrefs = {
            ...currentPrefs,
            humanizer: { enabled, level, categories },
        };

        await db
            .update(users)
            .set({ preferences: updatedPrefs, updatedAt: new Date() })
            .where(eq(users.id, userId));

        return NextResponse.json({ enabled, level, categories });
    } catch (error) {
        console.error("[API] Update humanizer settings error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
