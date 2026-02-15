/**
 * User Preferences API
 *
 * Stores and retrieves user preferences as JSONB on the users table.
 * Used for web search model configuration and other per-user settings.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const preferencesSchema = z.object({
    webSearchModel: z.enum(["auto", "gemini", "perplexity-sonar", "perplexity-sonar-pro", "duckduckgo"]).optional(),
    deepResearchModel: z.enum(["none", "perplexity-sonar-deep-research", "perplexity-sonar-reasoning-pro"]).optional(),
}).strict(); // Reject unknown keys to prevent arbitrary data injection

export async function GET() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [user] = await db.select({ preferences: users.preferences })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        return NextResponse.json({
            preferences: user?.preferences || {},
        });
    } catch (error) {
        console.error("[UserPreferences] GET error:", error);
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
        const validation = preferencesSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                { error: "Invalid preferences", details: validation.error.message },
                { status: 400 }
            );
        }

        // Merge with existing preferences
        const [user] = await db.select({ preferences: users.preferences })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        const existing = (user?.preferences as Record<string, unknown>) || {};
        const updated = { ...existing, ...validation.data };

        await db.update(users)
            .set({ preferences: updated, updatedAt: new Date() })
            .where(eq(users.id, userId));

        return NextResponse.json({
            success: true,
            preferences: updated,
        });
    } catch (error) {
        console.error("[UserPreferences] PATCH error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
