/**
 * Boot Scripts API
 *
 * GET - List user's boot scripts
 * POST - Create a new boot script
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { bootScripts } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { getAdminSettings, getDeploymentMode } from "@/lib/admin/settings";

// ============================================================================
// GET - List boot scripts
// ============================================================================

export async function GET(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const scripts = await db
            .select()
            .from(bootScripts)
            .where(eq(bootScripts.userId, userId));

        return NextResponse.json({ scripts });
    } catch (error) {
        console.error("[API] Boot scripts list error:", error);
        return NextResponse.json(
            { error: "Failed to list boot scripts" },
            { status: 500 }
        );
    }
}

// ============================================================================
// POST - Create boot script
// ============================================================================

export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check if boot scripts are enabled
        const settings = await getAdminSettings();
        const deploymentMode = getDeploymentMode();

        if (deploymentMode === "hosted" && !settings.bootScriptsEnabled) {
            return NextResponse.json(
                { error: "Boot scripts are disabled" },
                { status: 403 }
            );
        }

        // Check script limit in hosted mode
        if (deploymentMode === "hosted") {
            const [scriptCount] = await db
                .select({ count: count() })
                .from(bootScripts)
                .where(eq(bootScripts.userId, userId));

            const maxScripts = 10; // Default limit for hosted mode
            if ((scriptCount?.count ?? 0) >= maxScripts) {
                return NextResponse.json(
                    { error: `Maximum of ${maxScripts} boot scripts allowed` },
                    { status: 403 }
                );
            }
        }

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

        if (!name || !content) {
            return NextResponse.json(
                { error: "Missing required fields: name, content" },
                { status: 400 }
            );
        }

        // Create script
        const [script] = await db
            .insert(bootScripts)
            .values({
                userId,
                name,
                description: description || null,
                content,
                runOnServerStart: runOnServerStart ?? true,
                runOnChannelStart: runOnChannelStart ?? false,
                runOnSchedule: runOnSchedule || null,
                isEnabled: isEnabled ?? true,
                priority: priority ?? 0,
            })
            .returning();

        return NextResponse.json({ script }, { status: 201 });
    } catch (error) {
        console.error("[API] Boot script create error:", error);
        return NextResponse.json(
            { error: "Failed to create boot script" },
            { status: 500 }
        );
    }
}
