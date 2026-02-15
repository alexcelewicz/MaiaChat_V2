import { NextRequest, NextResponse } from "next/server";
import { WORKFLOW_TEMPLATES } from "@/lib/workflows/types";

/**
 * GET /api/workflows/templates
 * List all available workflow templates, optionally filtered by category
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const templates = Object.entries(WORKFLOW_TEMPLATES).map(([key, template]) => {
        const def = template.definition as Record<string, unknown>;
        const trigger = def.trigger as { type?: string } | undefined;
        const steps = def.steps as unknown[];
        return {
            id: key,
            name: template.name,
            description: template.description,
            category: (template as Record<string, unknown>).category || "general",
            icon: (template as Record<string, unknown>).icon || "Workflow",
            requiredIntegrations: (template as Record<string, unknown>).requiredIntegrations || [],
            requiredTools: (template as Record<string, unknown>).requiredTools || [],
            stepCount: steps?.length || 0,
            triggerType: trigger?.type || "manual",
        };
    });

    const filtered = category && category !== "all"
        ? templates.filter((t) => t.category === category)
        : templates;

    return NextResponse.json({ templates: filtered });
}
