/**
 * Event Triggers API
 *
 * GET - List user's event triggers
 * POST - Create a new event trigger
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { eventTriggers, users } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { getAdminSettings, getDeploymentMode } from "@/lib/admin/settings";
import { generateWebhookPath, generateWebhookSecret } from "@/lib/events";

// ============================================================================
// GET - List event triggers
// ============================================================================

export async function GET(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const triggers = await db
            .select()
            .from(eventTriggers)
            .where(eq(eventTriggers.userId, userId));

        return NextResponse.json({ triggers });
    } catch (error) {
        console.error("[API] Event triggers list error:", error);
        return NextResponse.json(
            { error: "Failed to list event triggers" },
            { status: 500 }
        );
    }
}

// ============================================================================
// POST - Create event trigger
// ============================================================================

export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check if event triggers are enabled
        const settings = await getAdminSettings();
        const deploymentMode = getDeploymentMode();

        if (deploymentMode === "hosted" && !settings.eventTriggersEnabled) {
            return NextResponse.json(
                { error: "Event triggers are disabled" },
                { status: 403 }
            );
        }

        // Check trigger limit in hosted mode
        if (deploymentMode === "hosted") {
            const [triggerCount] = await db
                .select({ count: count() })
                .from(eventTriggers)
                .where(eq(eventTriggers.userId, userId));

            const maxTriggers = 25; // Default limit for hosted mode
            if ((triggerCount?.count ?? 0) >= maxTriggers) {
                return NextResponse.json(
                    { error: `Maximum of ${maxTriggers} event triggers allowed` },
                    { status: 403 }
                );
            }
        }

        const body = await request.json();
        const {
            name,
            description,
            sourceType,
            sourceConfig,
            actionType,
            actionConfig,
            isEnabled,
            maxTriggersPerHour,
            cooldownSeconds,
        } = body;

        if (!name || !sourceType || !actionType) {
            return NextResponse.json(
                { error: "Missing required fields: name, sourceType, actionType" },
                { status: 400 }
            );
        }

        // Validate source type
        const validSourceTypes = ["webhook", "file_watch", "email", "schedule"];
        if (!validSourceTypes.includes(sourceType)) {
            return NextResponse.json(
                { error: `Invalid source type. Must be one of: ${validSourceTypes.join(", ")}` },
                { status: 400 }
            );
        }

        // Validate action type
        const validActionTypes = ["agent_turn", "notify", "skill"];
        if (!validActionTypes.includes(actionType)) {
            return NextResponse.json(
                { error: `Invalid action type. Must be one of: ${validActionTypes.join(", ")}` },
                { status: 400 }
            );
        }

        // Generate webhook path and secret if webhook type
        let finalSourceConfig = sourceConfig || {};
        if (sourceType === "webhook") {
            const webhookSecret = generateWebhookSecret();
            finalSourceConfig = {
                ...finalSourceConfig,
                webhookSecret,
            };
        }

        // Create trigger
        const [trigger] = await db
            .insert(eventTriggers)
            .values({
                userId,
                name,
                description: description || null,
                sourceType,
                sourceConfig: finalSourceConfig,
                actionType,
                actionConfig: actionConfig || null,
                isEnabled: isEnabled ?? true,
                maxTriggersPerHour: maxTriggersPerHour ?? settings.defaultTriggerMaxPerHour ?? 60,
                cooldownSeconds: cooldownSeconds ?? 0,
            })
            .returning();

        // Add webhook path after creation (uses trigger ID)
        if (sourceType === "webhook") {
            const webhookPath = generateWebhookPath(trigger.id);
            await db
                .update(eventTriggers)
                .set({
                    sourceConfig: {
                        ...finalSourceConfig,
                        webhookPath,
                    },
                })
                .where(eq(eventTriggers.id, trigger.id));

            trigger.sourceConfig = {
                ...finalSourceConfig,
                webhookPath,
            };
        }

        return NextResponse.json({ trigger }, { status: 201 });
    } catch (error) {
        console.error("[API] Event trigger create error:", error);
        return NextResponse.json(
            { error: "Failed to create event trigger" },
            { status: 500 }
        );
    }
}
