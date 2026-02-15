/**
 * Skills Reload API
 *
 * POST /api/skills/reload - Re-scan SKILL.md directories and sync to DB
 * Only available in local/self-hosted deployment modes.
 */

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { isLocalMode } from "@/lib/admin/settings";
import { pluginRegistry } from "@/lib/plugins";

export async function POST() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!isLocalMode()) {
            return NextResponse.json(
                { error: "Skill reload is only available in local/self-hosted mode" },
                { status: 403 }
            );
        }

        // Re-scan and load SKILL.md plugins
        await pluginRegistry.loadSkillMdPlugins();

        // Sync all plugins (including newly loaded) to database
        await pluginRegistry.syncToDatabase();

        const allPlugins = pluginRegistry.list();
        const customPlugins = allPlugins.filter(p => p.sourceType === "custom");

        return NextResponse.json({
            success: true,
            totalPlugins: allPlugins.length,
            customPlugins: customPlugins.length,
            customSkills: customPlugins.map(p => ({
                slug: p.manifest.slug,
                name: p.manifest.name,
                version: p.manifest.version,
            })),
        });
    } catch (error) {
        console.error("[API] Skills reload error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
