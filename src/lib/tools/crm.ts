/**
 * CRM Tool
 *
 * Provides CRM capabilities to AI agents: manage contacts, log interactions,
 * get relationship summaries, morning briefings, and find stale contacts.
 */

import { z } from "zod";
import type { Tool, ToolResult } from "./types";
import {
    createContact,
    getContact,
    updateContact,
    searchContacts,
    listContacts,
    getContactTimeline,
    logInteraction,
    findStaleContacts,
    getMorningBriefingData,
    getUpcomingMeetingsWithContacts,
} from "@/lib/crm";
import { calculateRelationshipScore, updateAllScores } from "@/lib/crm/scoring";
import { syncFromGmail, syncFromCalendar } from "@/lib/crm/ingestion";
import { enrichContact, deduplicateContacts } from "@/lib/crm/enrichment";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import { db } from "@/lib/db";
import { crmContacts } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

// ============================================================================
// Tool Schema
// ============================================================================

const crmToolSchema = z.object({
    action: z.enum([
        "search_contacts",
        "get_contact",
        "add_contact",
        "update_contact",
        "log_interaction",
        "get_timeline",
        "get_upcoming_meetings",
        "morning_briefing",
        "relationship_summary",
        "find_stale_contacts",
        "sync",
        "enrich",
        "deduplicate",
    ]),

    // Search parameters
    query: z.string().optional(),
    filters: z
        .object({
            relationship: z.string().optional(),
            importance: z.string().optional(),
            tags: z.array(z.string()).optional(),
            company: z.string().optional(),
        })
        .optional(),

    // Contact identification
    contactId: z.string().optional(),

    // Add/Update contact fields
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    company: z.string().optional(),
    role: z.string().optional(),
    relationship: z.string().optional(),
    importance: z.string().optional(),
    tags: z.array(z.string()).optional(),
    contactFrequencyDays: z.number().optional(),
    linkedinUrl: z.string().optional(),
    twitterHandle: z.string().optional(),
    notes: z.string().optional(),

    // Interaction fields
    interactionType: z.string().optional(),
    channel: z.string().optional(),
    subject: z.string().optional(),
    summary: z.string().optional(),
    sentiment: z.enum(["positive", "neutral", "negative"]).optional(),

    // Pagination
    limit: z.number().min(1).max(100).optional(),
    offset: z.number().min(0).optional(),

    // Sync action
    source: z.enum(["gmail", "calendar", "all"]).optional(),
});

type CrmToolInput = z.infer<typeof crmToolSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const crmTool: Tool = {
    id: "crm",
    name: "CRM",
    description: `Manage contacts, log interactions, get relationship summaries and morning briefings. Search contacts, track relationship scores, and identify contacts that need attention.

Actions:
- search_contacts: Search contacts by name, email, or company with optional filters (relationship, importance, tags, company)
- get_contact: Get full details of a specific contact by contactId
- add_contact: Create a new contact (requires name)
- update_contact: Update an existing contact by contactId
- log_interaction: Log an interaction with a contact (requires contactId, interactionType)
- get_timeline: Get interaction history for a contact by contactId
- get_upcoming_meetings: Get today's upcoming meetings with attendee context from Google Calendar
- morning_briefing: Get a morning briefing with stale contacts, recent interactions, upcoming meetings, and stats
- relationship_summary: Get relationship score and summary for a contact by contactId
- find_stale_contacts: Find high-importance contacts that haven't been contacted in 14+ days
- sync: Ingest CRM interactions from Gmail and/or Calendar, then recalculate scores
- enrich: AI-enrich a single contact (by contactId) or batch-enrich contacts missing company/role data
- deduplicate: Find and merge duplicate contacts by email or name+company match`,
    category: "integration",
    icon: "ContactRound",
    schema: crmToolSchema,
    execute: async (params, context) => {
        if (!context?.userId) {
            return {
                success: false,
                error: "User context required for CRM actions",
            };
        }
        return executeCrmTool(params as CrmToolInput, { userId: context.userId });
    },
};

// ============================================================================
// Tool Execution
// ============================================================================

async function executeCrmTool(
    input: CrmToolInput,
    context: { userId: string }
): Promise<ToolResult> {
    const { action } = input;
    const { userId } = context;

    try {
        switch (action) {
            case "search_contacts":
                return await handleSearchContacts(userId, input);

            case "get_contact":
                return await handleGetContact(userId, input);

            case "add_contact":
                return await handleAddContact(userId, input);

            case "update_contact":
                return await handleUpdateContact(userId, input);

            case "log_interaction":
                return await handleLogInteraction(userId, input);

            case "get_timeline":
                return await handleGetTimeline(userId, input);

            case "get_upcoming_meetings":
                return await handleGetUpcomingMeetings(userId);

            case "morning_briefing":
                return await handleMorningBriefing(userId);

            case "relationship_summary":
                return await handleRelationshipSummary(userId, input);

            case "find_stale_contacts":
                return await handleFindStaleContacts(userId);

            case "sync":
                return await handleSync(userId, input);

            case "enrich":
                return await handleEnrich(userId, input);

            case "deduplicate":
                return await handleDeduplicate(userId);

            default:
                return {
                    success: false,
                    error: `Unknown action: ${action}`,
                };
        }
    } catch (error) {
        console.error("[CRM Tool] Error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "CRM operation failed",
        };
    }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleSearchContacts(
    userId: string,
    input: CrmToolInput
): Promise<ToolResult> {
    if (!input.query) {
        // If no query, list contacts instead
        const result = await listContacts(userId, {
            limit: input.limit || 20,
            offset: input.offset || 0,
        });
        return {
            success: true,
            data: {
                contacts: result.contacts.map(formatContactSummary),
                total: result.total,
            },
        };
    }

    const contacts = await searchContacts(userId, input.query, input.filters);

    return {
        success: true,
        data: {
            count: contacts.length,
            contacts: contacts.map(formatContactSummary),
        },
    };
}

async function handleGetContact(
    userId: string,
    input: CrmToolInput
): Promise<ToolResult> {
    if (!input.contactId) {
        return {
            success: false,
            error: "contactId is required for get_contact action",
        };
    }

    const contact = await getContact(userId, input.contactId);

    if (!contact) {
        return {
            success: false,
            error: `Contact ${input.contactId} not found`,
        };
    }

    return {
        success: true,
        data: formatContactFull(contact),
    };
}

async function handleAddContact(
    userId: string,
    input: CrmToolInput
): Promise<ToolResult> {
    if (!input.name) {
        return {
            success: false,
            error: "name is required for add_contact action",
        };
    }

    const contact = await createContact(userId, {
        name: input.name,
        email: input.email,
        phone: input.phone,
        company: input.company,
        role: input.role,
        relationship: input.relationship,
        importance: input.importance,
        tags: input.tags,
        contactFrequencyDays: input.contactFrequencyDays,
        linkedinUrl: input.linkedinUrl,
        twitterHandle: input.twitterHandle,
        notes: input.notes,
    });

    return {
        success: true,
        data: {
            message: `Contact "${contact.name}" created successfully`,
            contact: formatContactFull(contact),
        },
    };
}

async function handleUpdateContact(
    userId: string,
    input: CrmToolInput
): Promise<ToolResult> {
    if (!input.contactId) {
        return {
            success: false,
            error: "contactId is required for update_contact action",
        };
    }

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.company !== undefined) updateData.company = input.company;
    if (input.role !== undefined) updateData.role = input.role;
    if (input.relationship !== undefined) updateData.relationship = input.relationship;
    if (input.importance !== undefined) updateData.importance = input.importance;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.contactFrequencyDays !== undefined)
        updateData.contactFrequencyDays = input.contactFrequencyDays;
    if (input.linkedinUrl !== undefined) updateData.linkedinUrl = input.linkedinUrl;
    if (input.twitterHandle !== undefined) updateData.twitterHandle = input.twitterHandle;
    if (input.notes !== undefined) updateData.notes = input.notes;

    const contact = await updateContact(userId, input.contactId, updateData);

    return {
        success: true,
        data: {
            message: `Contact "${contact.name}" updated successfully`,
            contact: formatContactFull(contact),
        },
    };
}

async function handleLogInteraction(
    userId: string,
    input: CrmToolInput
): Promise<ToolResult> {
    if (!input.contactId) {
        return {
            success: false,
            error: "contactId is required for log_interaction action",
        };
    }
    if (!input.interactionType) {
        return {
            success: false,
            error: "interactionType is required for log_interaction action",
        };
    }

    const interaction = await logInteraction(userId, {
        contactId: input.contactId,
        type: input.interactionType,
        channel: input.channel,
        subject: input.subject,
        summary: input.summary,
        sentiment: input.sentiment,
    });

    return {
        success: true,
        data: {
            message: "Interaction logged successfully",
            interaction: {
                id: interaction.id,
                type: interaction.type,
                channel: interaction.channel,
                subject: interaction.subject,
                summary: interaction.summary,
                sentiment: interaction.sentiment,
                occurredAt: interaction.occurredAt,
            },
        },
    };
}

async function handleGetTimeline(
    userId: string,
    input: CrmToolInput
): Promise<ToolResult> {
    if (!input.contactId) {
        return {
            success: false,
            error: "contactId is required for get_timeline action",
        };
    }

    const contact = await getContact(userId, input.contactId);
    if (!contact) {
        return {
            success: false,
            error: `Contact ${input.contactId} not found`,
        };
    }

    const interactions = await getContactTimeline(input.contactId, userId);

    return {
        success: true,
        data: {
            contact: formatContactSummary(contact),
            interactionCount: interactions.length,
            timeline: interactions.map((i) => ({
                id: i.id,
                type: i.type,
                channel: i.channel,
                subject: i.subject,
                summary: i.summary,
                sentiment: i.sentiment,
                occurredAt: i.occurredAt,
            })),
        },
    };
}

async function handleGetUpcomingMeetings(userId: string): Promise<ToolResult> {
    const meetings = await getUpcomingMeetingsWithContacts(userId);

    return {
        success: true,
        data: {
            count: meetings.length,
            meetings,
        },
    };
}

async function handleMorningBriefing(userId: string): Promise<ToolResult> {
    const briefing = await getMorningBriefingData(userId);

    return {
        success: true,
        data: {
            totalContacts: briefing.totalContacts,
            staleContacts: {
                count: briefing.staleContacts.length,
                contacts: briefing.staleContacts.map(formatContactSummary),
            },
            recentInteractions: {
                count: briefing.recentInteractions.length,
                interactions: briefing.recentInteractions.map((i) => ({
                    id: i.id,
                    contactId: i.contactId,
                    type: i.type,
                    channel: i.channel,
                    subject: i.subject,
                    summary: i.summary,
                    sentiment: i.sentiment,
                    occurredAt: i.occurredAt,
                })),
            },
            upcomingMeetings: briefing.upcomingMeetings,
        },
    };
}

async function handleRelationshipSummary(
    userId: string,
    input: CrmToolInput
): Promise<ToolResult> {
    if (!input.contactId) {
        return {
            success: false,
            error: "contactId is required for relationship_summary action",
        };
    }

    const contact = await getContact(userId, input.contactId);
    if (!contact) {
        return {
            success: false,
            error: `Contact ${input.contactId} not found`,
        };
    }

    const interactions = await getContactTimeline(input.contactId, userId);
    const score = calculateRelationshipScore(contact, interactions);

    // Compute summary stats
    const now = Date.now();
    const lastInteraction = interactions[0];
    const daysSinceContact = lastInteraction
        ? Math.round(
              (now - new Date(lastInteraction.occurredAt).getTime()) /
                  (1000 * 60 * 60 * 24)
          )
        : null;

    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    for (const i of interactions) {
        if (i.sentiment && i.sentiment in sentimentCounts) {
            sentimentCounts[i.sentiment as keyof typeof sentimentCounts]++;
        }
    }

    const typeCounts: Record<string, number> = {};
    for (const i of interactions) {
        typeCounts[i.type] = (typeCounts[i.type] || 0) + 1;
    }

    return {
        success: true,
        data: {
            contact: formatContactSummary(contact),
            relationshipScore: score,
            totalInteractions: interactions.length,
            daysSinceLastContact: daysSinceContact,
            lastInteraction: lastInteraction
                ? {
                      type: lastInteraction.type,
                      subject: lastInteraction.subject,
                      occurredAt: lastInteraction.occurredAt,
                  }
                : null,
            sentimentBreakdown: sentimentCounts,
            interactionTypes: typeCounts,
            needsAttention:
                contact.importance !== "low" &&
                daysSinceContact !== null &&
                daysSinceContact > 14,
        },
    };
}

async function handleFindStaleContacts(userId: string): Promise<ToolResult> {
    const staleContacts = await findStaleContacts(userId);

    return {
        success: true,
        data: {
            count: staleContacts.length,
            contacts: staleContacts.map((c) => ({
                ...formatContactSummary(c),
                daysSinceContact: c.lastContactAt
                    ? Math.round(
                          (Date.now() - new Date(c.lastContactAt).getTime()) /
                              (1000 * 60 * 60 * 24)
                      )
                    : "never",
            })),
        },
    };
}

async function handleSync(userId: string, input: CrmToolInput): Promise<ToolResult> {
    const source = input.source || "all";

    const result: {
        source: "gmail" | "calendar" | "all";
        gmail?: Awaited<ReturnType<typeof syncFromGmail>>;
        calendar?: Awaited<ReturnType<typeof syncFromCalendar>>;
        scoresUpdated: boolean;
    } = {
        source,
        scoresUpdated: false,
    };

    if (source === "gmail" || source === "all") {
        result.gmail = await syncFromGmail(userId);
    }

    if (source === "calendar" || source === "all") {
        result.calendar = await syncFromCalendar(userId);
    }

    await updateAllScores(userId);
    result.scoresUpdated = true;

    return {
        success: true,
        data: result,
    };
}

async function handleEnrich(userId: string, input: CrmToolInput): Promise<ToolResult> {
    const apiKeys = await getUserApiKeys(userId);
    if (!apiKeys.openai && !apiKeys.anthropic) {
        return {
            success: false,
            error: "No AI API keys configured. Add OpenAI or Anthropic keys in Settings to use enrichment.",
        };
    }

    // Single contact enrichment
    if (input.contactId) {
        const contact = await getContact(userId, input.contactId);
        if (!contact) {
            return { success: false, error: `Contact ${input.contactId} not found` };
        }
        const enriched = await enrichContact(contact, apiKeys);
        if (Object.keys(enriched).length === 0) {
            return {
                success: true,
                data: { message: `Contact "${contact.name}" already has sufficient data or not enough context to enrich.`, enrichedFields: [] },
            };
        }
        await updateContact(userId, contact.id, enriched as Parameters<typeof updateContact>[2]);
        return {
            success: true,
            data: { message: `Contact "${contact.name}" enriched successfully`, enrichedFields: Object.keys(enriched) },
        };
    }

    // Batch enrichment: contacts missing company or role
    const sparse = await db
        .select()
        .from(crmContacts)
        .where(and(eq(crmContacts.userId, userId), isNull(crmContacts.company), isNull(crmContacts.mergedIntoId)))
        .limit(20);

    if (sparse.length === 0) {
        return {
            success: true,
            data: { message: "No contacts need enrichment — all have company data.", enriched: 0 },
        };
    }

    let enrichedCount = 0;
    for (const contact of sparse) {
        const enriched = await enrichContact(contact, apiKeys);
        if (Object.keys(enriched).length > 0) {
            await updateContact(userId, contact.id, enriched as Parameters<typeof updateContact>[2]);
            enrichedCount++;
        }
    }

    return {
        success: true,
        data: { message: `Enriched ${enrichedCount} of ${sparse.length} contacts`, enriched: enrichedCount, checked: sparse.length },
    };
}

async function handleDeduplicate(userId: string): Promise<ToolResult> {
    const result = await deduplicateContacts(userId);
    return {
        success: true,
        data: {
            message: result.merged > 0
                ? `Merged ${result.merged} duplicate contact${result.merged === 1 ? "" : "s"}`
                : "No duplicate contacts found",
            merged: result.merged,
            details: result.duplicates,
        },
    };
}

// ============================================================================
// Formatters
// ============================================================================

function formatContactSummary(contact: {
    id: string;
    name: string;
    email: string | null;
    company: string | null;
    role: string | null;
    relationship: string | null;
    importance: string | null;
    relationshipScore: number | null;
    lastContactAt: Date | null;
    tags: unknown;
}) {
    return {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        company: contact.company,
        role: contact.role,
        relationship: contact.relationship,
        importance: contact.importance,
        relationshipScore: contact.relationshipScore,
        lastContactAt: contact.lastContactAt,
        tags: contact.tags,
    };
}

function formatContactFull(contact: Record<string, unknown>) {
    return {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        role: contact.role,
        relationship: contact.relationship,
        importance: contact.importance,
        tags: contact.tags,
        relationshipScore: contact.relationshipScore,
        lastContactAt: contact.lastContactAt,
        contactFrequencyDays: contact.contactFrequencyDays,
        linkedinUrl: contact.linkedinUrl,
        twitterHandle: contact.twitterHandle,
        notes: contact.notes,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
    };
}

export default crmTool;
