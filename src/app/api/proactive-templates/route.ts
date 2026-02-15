import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { proactiveTemplates, scheduledTasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { computeNextRunAt } from "@/lib/scheduler/schedule";

// Built-in templates seeded on first request
const BUILTIN_TEMPLATES = [
    {
        name: "Morning Briefing",
        description: "Daily summary of emails, calendar events, and news",
        category: "briefing",
        icon: "Sun",
        defaultPrompt: "Give me a morning briefing. Include: 1) My calendar events for today, 2) Important unread emails (summarize top 5), 3) Any scheduled tasks due today. Format it clearly with sections.",
        defaultCron: "0 7 * * *",
        defaultTimezone: "UTC",
        requiredTools: ["email", "google_calendar", "scheduled_task"],
        requiredIntegrations: ["google"],
    },
    {
        name: "Email Digest",
        description: "Periodic summary of important emails",
        category: "digest",
        icon: "Mail",
        defaultPrompt: "Search my recent emails from the last 4 hours and give me a digest. Summarize important ones, flag urgent items, and suggest responses for emails that need replies.",
        defaultCron: "0 */4 * * *",
        defaultTimezone: "UTC",
        requiredTools: ["email"],
        requiredIntegrations: ["google"],
    },
    {
        name: "Daily Calendar Review",
        description: "Evening review of tomorrow's schedule",
        category: "briefing",
        icon: "Calendar",
        defaultPrompt: "Review my calendar for tomorrow. List all events with times, identify potential conflicts, and suggest preparation needed for each meeting.",
        defaultCron: "0 20 * * *",
        defaultTimezone: "UTC",
        requiredTools: ["google_calendar"],
        requiredIntegrations: ["google"],
    },
    {
        name: "Website Monitor",
        description: "Check a website for changes periodically",
        category: "monitor",
        icon: "Globe",
        defaultPrompt: "Fetch the following URL and summarize any notable changes or updates: {{url}}. Compare with previous checks if available.",
        defaultCron: "0 */6 * * *",
        defaultTimezone: "UTC",
        requiredTools: ["url_fetch"],
        requiredIntegrations: [],
    },
    {
        name: "Weekly Summary",
        description: "End of week activity recap",
        category: "digest",
        icon: "BarChart3",
        defaultPrompt: "Give me a weekly summary. Include: 1) Number of conversations this week, 2) Key topics discussed, 3) Tools used and their frequency, 4) Suggestions for next week.",
        defaultCron: "0 17 * * 5",
        defaultTimezone: "UTC",
        requiredTools: [],
        requiredIntegrations: [],
    },
    {
        name: "GitHub Activity Report",
        description: "Summary of recent GitHub activity",
        category: "digest",
        icon: "Github",
        defaultPrompt: "Check my GitHub activity. List recent PRs, issues, and commits across my repositories. Highlight any PRs waiting for review.",
        defaultCron: "0 9 * * 1-5",
        defaultTimezone: "UTC",
        requiredTools: ["github_integration"],
        requiredIntegrations: [],
    },
];

export async function GET() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get templates from DB
        let templates = await db.select().from(proactiveTemplates);

        // Seed built-in templates if empty (with race condition protection)
        if (templates.length === 0) {
            try {
                const values = BUILTIN_TEMPLATES.map(tmpl => ({
                    ...tmpl,
                    isBuiltin: true as const,
                }));
                await db.insert(proactiveTemplates).values(values);
            } catch {
                // Another request may have already seeded - ignore duplicate errors
            }
            templates = await db.select().from(proactiveTemplates);
        }

        return NextResponse.json({ templates });
    } catch (error) {
        console.error("[ProactiveTemplates] GET error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { templateId, customPrompt, customCron, timezone, channelAccountId } = body;

        if (!templateId) {
            return NextResponse.json({ error: "templateId required" }, { status: 400 });
        }

        // Get template
        const [template] = await db.select()
            .from(proactiveTemplates)
            .where(eq(proactiveTemplates.id, templateId))
            .limit(1);

        if (!template) {
            return NextResponse.json({ error: "Template not found" }, { status: 404 });
        }

        // Create scheduled task from template
        const cronExpr = customCron || template.defaultCron;
        const tz = timezone || template.defaultTimezone || "UTC";
        const nextRunAt = computeNextRunAt(cronExpr, tz);

        const [task] = await db.insert(scheduledTasks).values({
            userId,
            channelAccountId: channelAccountId || null,
            name: template.name,
            prompt: customPrompt || template.defaultPrompt,
            cron: cronExpr,
            timezone: tz,
            isEnabled: true,
            nextRunAt,
            schedule: {
                kind: "cron" as const,
                expr: cronExpr,
                tz,
            },
            payload: {
                kind: "agentTurn" as const,
                message: customPrompt || template.defaultPrompt,
                deliver: !!channelAccountId,
            },
        }).returning();

        return NextResponse.json({ task, template: template.name }, { status: 201 });
    } catch (error) {
        console.error("[ProactiveTemplates] POST error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
