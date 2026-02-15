import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { WORKFLOW_TEMPLATES } from "@/lib/workflows/types";
import type { WorkflowDefinition } from "@/lib/db/schema";

/**
 * POST /api/workflows/install
 * Install a workflow template as a user workflow
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { templateId, config } = body as { templateId: string; config?: Record<string, unknown> };

        if (!templateId) {
            return NextResponse.json({ error: "templateId is required" }, { status: 400 });
        }

        const template = WORKFLOW_TEMPLATES[templateId as keyof typeof WORKFLOW_TEMPLATES];
        if (!template) {
            return NextResponse.json({ error: `Template not found: ${templateId}` }, { status: 404 });
        }

        // Deep clone template definition to break readonly constraint
        const templateDef = JSON.parse(JSON.stringify(template.definition)) as Record<string, unknown>;

        // Merge user config into template variables
        const definition: WorkflowDefinition = {
            ...templateDef,
            version: (templateDef.version as string) || "1.0.0",
            variables: {
                ...((templateDef.variables as Record<string, unknown>) || {}),
                ...(config || {}),
            },
        } as WorkflowDefinition;

        const [workflow] = await db.insert(workflows).values({
            userId,
            name: template.name,
            description: template.description,
            definition,
            status: "active",
            isTemplate: false,
            tags: [(template as Record<string, unknown>).category as string || "general"],
        }).returning();

        return NextResponse.json({
            success: true,
            workflow: {
                id: workflow.id,
                name: workflow.name,
                status: workflow.status,
            },
        }, { status: 201 });
    } catch (error) {
        console.error("[API] Install workflow template error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to install template" },
            { status: 500 }
        );
    }
}
