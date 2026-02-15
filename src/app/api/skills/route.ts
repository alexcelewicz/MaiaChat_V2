/**
 * Skills API
 *
 * GET /api/skills - List all available skills
 * POST /api/skills/enable - Enable a skill for the user
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { skills, userSkills } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getDeploymentMode, isLocalMode } from '@/lib/admin/settings';

/**
 * GET /api/skills - List all available skills
 */
export async function GET(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get all skills with user's enabled status
        const allSkills = await db.select()
            .from(skills);

        // Get user's enabled skills
        const userEnabledSkills = await db.select()
            .from(userSkills)
            .where(eq(userSkills.userId, userId));

        const enabledMap = new Map(
            userEnabledSkills.map(us => [us.skillId, us])
        );

        const skillsWithStatus = allSkills.map(skill => ({
            id: skill.id,
            slug: skill.slug,
            name: skill.name,
            description: skill.description,
            version: skill.version,
            icon: skill.icon,
            category: skill.category,
            isBuiltin: skill.isBuiltin,
            permissions: skill.permissions,
            configSchema: skill.configSchema,
            toolDefinitions: skill.toolDefinitions,
            isEnabled: enabledMap.has(skill.id) && enabledMap.get(skill.id)!.isEnabled,
            userConfig: enabledMap.get(skill.id)?.config || null,
            usageCount: enabledMap.get(skill.id)?.usageCount || 0,
            lastUsedAt: enabledMap.get(skill.id)?.lastUsedAt || null,
        }));

        return NextResponse.json({
            skills: skillsWithStatus,
            deploymentMode: getDeploymentMode(),
            canLoadCustomSkills: isLocalMode(),
        });
    } catch (error) {
        console.error('[API] List skills error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

/**
 * POST /api/skills - Enable a skill for the user
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { skillId, config } = await request.json();

        if (!skillId) {
            return NextResponse.json({ error: 'Skill ID required' }, { status: 400 });
        }

        // Check if skill exists
        const [skill] = await db.select()
            .from(skills)
            .where(eq(skills.id, skillId));

        if (!skill) {
            return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
        }

        // Check if user already has this skill
        const [existingUserSkill] = await db.select()
            .from(userSkills)
            .where(and(
                eq(userSkills.userId, userId),
                eq(userSkills.skillId, skillId)
            ));

        let userSkill;
        if (existingUserSkill) {
            // Update existing
            [userSkill] = await db.update(userSkills)
                .set({
                    isEnabled: true,
                    config: config || existingUserSkill.config,
                    updatedAt: new Date(),
                })
                .where(eq(userSkills.id, existingUserSkill.id))
                .returning();
        } else {
            // Create new
            [userSkill] = await db.insert(userSkills)
                .values({
                    userId,
                    skillId,
                    isEnabled: true,
                    config: config || {},
                })
                .returning();
        }

        return NextResponse.json({
            skill: {
                ...skill,
                isEnabled: true,
                userConfig: userSkill.config,
            },
        });
    } catch (error) {
        console.error('[API] Enable skill error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
