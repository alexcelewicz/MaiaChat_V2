/**
 * Skill Management API
 *
 * GET /api/skills/[id] - Get skill details
 * PATCH /api/skills/[id] - Update skill settings
 * DELETE /api/skills/[id] - Disable skill
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { skills, userSkills } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/skills/[id] - Get skill details
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Get skill by ID or slug
        const [skill] = await db.select()
            .from(skills)
            .where(eq(skills.id, id));

        if (!skill) {
            // Try by slug
            const [skillBySlug] = await db.select()
                .from(skills)
                .where(eq(skills.slug, id));

            if (!skillBySlug) {
                return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
            }

            // Get user's settings for this skill
            const [userSkill] = await db.select()
                .from(userSkills)
                .where(and(
                    eq(userSkills.userId, userId),
                    eq(userSkills.skillId, skillBySlug.id)
                ));

            return NextResponse.json({
                skill: {
                    ...skillBySlug,
                    isEnabled: userSkill?.isEnabled || false,
                    userConfig: userSkill?.config || null,
                    usageCount: userSkill?.usageCount || 0,
                    lastUsedAt: userSkill?.lastUsedAt || null,
                },
            });
        }

        // Get user's settings for this skill
        const [userSkill] = await db.select()
            .from(userSkills)
            .where(and(
                eq(userSkills.userId, userId),
                eq(userSkills.skillId, skill.id)
            ));

        return NextResponse.json({
            skill: {
                ...skill,
                isEnabled: userSkill?.isEnabled || false,
                userConfig: userSkill?.config || null,
                usageCount: userSkill?.usageCount || 0,
                lastUsedAt: userSkill?.lastUsedAt || null,
            },
        });
    } catch (error) {
        console.error('[API] Get skill error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

/**
 * PATCH /api/skills/[id] - Update skill settings
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const payload = await request.json();

        // Get skill
        const [skill] = await db.select()
            .from(skills)
            .where(eq(skills.id, id));

        if (!skill) {
            return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
        }

        // Get or create user skill record
        let [userSkill] = await db.select()
            .from(userSkills)
            .where(and(
                eq(userSkills.userId, userId),
                eq(userSkills.skillId, skill.id)
            ));

        if (!userSkill) {
            // Create new user skill record
            [userSkill] = await db.insert(userSkills)
                .values({
                    userId,
                    skillId: skill.id,
                    isEnabled: payload.isEnabled ?? false,
                    config: payload.config || {},
                })
                .returning();
        } else {
            // Update existing
            const updates: Record<string, unknown> = { updatedAt: new Date() };

            if (payload.isEnabled !== undefined) {
                updates.isEnabled = payload.isEnabled;
            }
            if (payload.config !== undefined) {
                updates.config = payload.config;
            }

            [userSkill] = await db.update(userSkills)
                .set(updates)
                .where(eq(userSkills.id, userSkill.id))
                .returning();
        }

        return NextResponse.json({
            skill: {
                ...skill,
                isEnabled: userSkill.isEnabled,
                userConfig: userSkill.config,
                usageCount: userSkill.usageCount,
                lastUsedAt: userSkill.lastUsedAt,
            },
        });
    } catch (error) {
        console.error('[API] Update skill error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

/**
 * DELETE /api/skills/[id] - Disable skill
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Get skill
        const [skill] = await db.select()
            .from(skills)
            .where(eq(skills.id, id));

        if (!skill) {
            return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
        }

        // Disable user skill record
        await db.update(userSkills)
            .set({
                isEnabled: false,
                updatedAt: new Date(),
            })
            .where(and(
                eq(userSkills.userId, userId),
                eq(userSkills.skillId, skill.id)
            ));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API] Disable skill error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
