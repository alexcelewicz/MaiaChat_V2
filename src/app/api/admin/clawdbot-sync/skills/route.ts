/**
 * Clawdbot Skills API
 *
 * Phase 6: Clawdbot Sync Service
 * - GET: List all Clawdbot skills
 * - POST: Enable/disable skills
 *
 * @see UNIFIED_ROADMAP.md Phase 6
 */

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import {
    listClawdbotSkills,
    getSkillBySlug,
    enableSkill,
    disableSkill,
    updateEnabledSkills,
    getSkillsByCategory,
    getCompatibleSkills,
} from "@/lib/services/clawdbot-sync";

/**
 * GET /api/admin/clawdbot-sync/skills
 * List all Clawdbot skills
 */
export async function GET(request: Request) {
    const session = await getServerSession();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const filter = searchParams.get("filter");
        const groupBy = searchParams.get("groupBy");
        const slug = searchParams.get("slug");

        // Get single skill by slug
        if (slug) {
            const skill = await getSkillBySlug(slug);
            if (!skill) {
                return NextResponse.json(
                    { error: "Skill not found" },
                    { status: 404 }
                );
            }
            return NextResponse.json({ skill });
        }

        // Get skills grouped by category
        if (groupBy === "category") {
            const categorized = await getSkillsByCategory();
            return NextResponse.json({ categories: categorized });
        }

        // Get compatible skills only
        if (filter === "compatible") {
            const skills = await getCompatibleSkills();
            return NextResponse.json({ skills, count: skills.length });
        }

        // Get all skills
        const skills = await listClawdbotSkills();
        return NextResponse.json({
            skills,
            count: skills.length,
        });
    } catch (error) {
        console.error("[ClawdbotSkills API] GET error:", error);
        return NextResponse.json(
            { error: "Failed to list skills" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/clawdbot-sync/skills
 * Enable/disable skills
 */
export async function POST(request: Request) {
    const session = await getServerSession();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { action, slug, slugs } = body;

        switch (action) {
            case "enable": {
                if (!slug) {
                    return NextResponse.json(
                        { error: "slug is required" },
                        { status: 400 }
                    );
                }
                const result = await enableSkill(slug);
                return NextResponse.json(result);
            }

            case "disable": {
                if (!slug) {
                    return NextResponse.json(
                        { error: "slug is required" },
                        { status: 400 }
                    );
                }
                const result = await disableSkill(slug);
                return NextResponse.json(result);
            }

            case "toggle": {
                if (!slug) {
                    return NextResponse.json(
                        { error: "slug is required" },
                        { status: 400 }
                    );
                }
                const skill = await getSkillBySlug(slug);
                if (!skill) {
                    return NextResponse.json(
                        { error: "Skill not found" },
                        { status: 404 }
                    );
                }
                const result = skill.isEnabled
                    ? await disableSkill(slug)
                    : await enableSkill(slug);
                return NextResponse.json({
                    ...result,
                    isEnabled: !skill.isEnabled,
                });
            }

            case "bulk": {
                if (!Array.isArray(slugs)) {
                    return NextResponse.json(
                        { error: "slugs array is required" },
                        { status: 400 }
                    );
                }
                const result = await updateEnabledSkills(slugs);
                return NextResponse.json(result);
            }

            case "enableAll": {
                const skills = await listClawdbotSkills();
                const allSlugs = skills.map((s) => s.slug);
                const result = await updateEnabledSkills(allSlugs);
                return NextResponse.json({
                    ...result,
                    count: allSlugs.length,
                });
            }

            case "enableCompatible": {
                const skills = await getCompatibleSkills();
                const compatibleSlugs = skills.map((s) => s.slug);
                const result = await updateEnabledSkills(compatibleSlugs);
                return NextResponse.json({
                    ...result,
                    count: compatibleSlugs.length,
                });
            }

            case "disableAll": {
                const result = await updateEnabledSkills([]);
                return NextResponse.json(result);
            }

            default:
                return NextResponse.json(
                    { error: `Unknown action: ${action}` },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error("[ClawdbotSkills API] POST error:", error);
        return NextResponse.json(
            { error: "Failed to update skills" },
            { status: 500 }
        );
    }
}
