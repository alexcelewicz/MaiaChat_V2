/**
 * CRM Service
 *
 * CRUD operations for contacts and interactions.
 * Provides search, timeline, stale contact detection, and morning briefing data.
 */

import { db } from "@/lib/db";
import { crmContacts, crmInteractions } from "@/lib/db/schema";
import { eq, and, desc, ilike, sql, isNull } from "drizzle-orm";
import { getUpcomingEvents } from "@/lib/integrations/google/calendar";
import { getValidCredentials } from "@/lib/integrations/google/oauth";

// ============================================================================
// Types
// ============================================================================

export interface CreateContactInput {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
    relationship?: string;
    importance?: string;
    tags?: string[];
    contactFrequencyDays?: number;
    linkedinUrl?: string;
    twitterHandle?: string;
    notes?: string;
}

export interface ContactFilters {
    relationship?: string;
    importance?: string;
    tags?: string[];
    company?: string;
}

export interface CreateInteractionInput {
    contactId: string;
    type: string;
    channel?: string;
    subject?: string;
    summary?: string;
    sentiment?: string;
    externalId?: string;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
}

export type Contact = typeof crmContacts.$inferSelect;
export type Interaction = typeof crmInteractions.$inferSelect;

export interface MorningBriefingData {
    staleContacts: Contact[];
    recentInteractions: Interaction[];
    upcomingMeetings: unknown[];
    totalContacts: number;
}

// ============================================================================
// Contact CRUD
// ============================================================================

/**
 * Create a new contact for a user
 */
export async function createContact(
    userId: string,
    data: CreateContactInput
): Promise<Contact> {
    const [contact] = await db
        .insert(crmContacts)
        .values({
            userId,
            name: data.name,
            email: data.email,
            phone: data.phone,
            company: data.company,
            role: data.role,
            relationship: data.relationship || "colleague",
            importance: data.importance || "normal",
            tags: data.tags || [],
            contactFrequencyDays: data.contactFrequencyDays,
            linkedinUrl: data.linkedinUrl,
            twitterHandle: data.twitterHandle,
            notes: data.notes,
        })
        .returning();

    return contact;
}

/**
 * Get a single contact by ID (scoped to user)
 */
export async function getContact(
    userId: string,
    contactId: string
): Promise<Contact | null> {
    const [contact] = await db
        .select()
        .from(crmContacts)
        .where(
            and(
                eq(crmContacts.id, contactId),
                eq(crmContacts.userId, userId),
                isNull(crmContacts.mergedIntoId)
            )
        )
        .limit(1);

    return contact || null;
}

/**
 * Update a contact (scoped to user)
 */
export async function updateContact(
    userId: string,
    contactId: string,
    data: Partial<CreateContactInput>
): Promise<Contact> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.company !== undefined) updateData.company = data.company;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.relationship !== undefined) updateData.relationship = data.relationship;
    if (data.importance !== undefined) updateData.importance = data.importance;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.contactFrequencyDays !== undefined) updateData.contactFrequencyDays = data.contactFrequencyDays;
    if (data.linkedinUrl !== undefined) updateData.linkedinUrl = data.linkedinUrl;
    if (data.twitterHandle !== undefined) updateData.twitterHandle = data.twitterHandle;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const [contact] = await db
        .update(crmContacts)
        .set(updateData)
        .where(
            and(
                eq(crmContacts.id, contactId),
                eq(crmContacts.userId, userId)
            )
        )
        .returning();

    if (!contact) {
        throw new Error(`Contact ${contactId} not found`);
    }

    return contact;
}

/**
 * Delete a contact (scoped to user)
 */
export async function deleteContact(
    userId: string,
    contactId: string
): Promise<void> {
    const result = await db
        .delete(crmContacts)
        .where(
            and(
                eq(crmContacts.id, contactId),
                eq(crmContacts.userId, userId)
            )
        )
        .returning({ id: crmContacts.id });

    if (result.length === 0) {
        throw new Error(`Contact ${contactId} not found`);
    }
}

// ============================================================================
// Search & List
// ============================================================================

/**
 * Search contacts by name, email, or company with optional filters
 */
export async function searchContacts(
    userId: string,
    query: string,
    filters?: ContactFilters
): Promise<Contact[]> {
    const conditions = [
        eq(crmContacts.userId, userId),
        isNull(crmContacts.mergedIntoId),
    ];

    // Text search across name, email, company
    const searchPattern = `%${query}%`;
    conditions.push(
        sql`(
            ${ilike(crmContacts.name, searchPattern)}
            OR ${ilike(crmContacts.email, searchPattern)}
            OR ${ilike(crmContacts.company, searchPattern)}
        )`
    );

    // Apply filters
    if (filters?.relationship) {
        conditions.push(eq(crmContacts.relationship, filters.relationship));
    }
    if (filters?.importance) {
        conditions.push(eq(crmContacts.importance, filters.importance));
    }
    if (filters?.company) {
        conditions.push(ilike(crmContacts.company, `%${filters.company}%`));
    }
    if (filters?.tags && filters.tags.length > 0) {
        // Check if contact tags contain any of the filter tags
        conditions.push(
            sql`${crmContacts.tags}::jsonb ?| array[${sql.join(
                filters.tags.map((t) => sql`${t}`),
                sql`, `
            )}]`
        );
    }

    return db
        .select()
        .from(crmContacts)
        .where(and(...conditions))
        .orderBy(desc(crmContacts.relationshipScore))
        .limit(50);
}

/**
 * List contacts with pagination and sorting
 */
export async function listContacts(
    userId: string,
    options?: {
        limit?: number;
        offset?: number;
        sortBy?: string;
        sortOrder?: string;
    }
): Promise<{ contacts: Contact[]; total: number }> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const conditions = [
        eq(crmContacts.userId, userId),
        isNull(crmContacts.mergedIntoId),
    ];

    // Determine sort column
    let orderByColumn;
    switch (options?.sortBy) {
        case "name":
            orderByColumn = crmContacts.name;
            break;
        case "company":
            orderByColumn = crmContacts.company;
            break;
        case "relationship_score":
            orderByColumn = crmContacts.relationshipScore;
            break;
        case "last_contact_at":
            orderByColumn = crmContacts.lastContactAt;
            break;
        case "created_at":
            orderByColumn = crmContacts.createdAt;
            break;
        default:
            orderByColumn = crmContacts.updatedAt;
    }

    const isDesc = options?.sortOrder !== "asc";

    const [contacts, countResult] = await Promise.all([
        db
            .select()
            .from(crmContacts)
            .where(and(...conditions))
            .orderBy(isDesc ? desc(orderByColumn) : orderByColumn)
            .limit(limit)
            .offset(offset),
        db
            .select({ count: sql<number>`count(*)::int` })
            .from(crmContacts)
            .where(and(...conditions)),
    ]);

    return {
        contacts,
        total: countResult[0]?.count || 0,
    };
}

// ============================================================================
// Interactions
// ============================================================================

/**
 * Get the interaction timeline for a contact, ordered by occurredAt desc
 */
export async function getContactTimeline(
    contactId: string,
    userId: string
): Promise<Interaction[]> {
    return db
        .select()
        .from(crmInteractions)
        .where(
            and(
                eq(crmInteractions.contactId, contactId),
                eq(crmInteractions.userId, userId)
            )
        )
        .orderBy(desc(crmInteractions.occurredAt));
}

/**
 * Log a new interaction and update the contact's lastContactAt
 */
export async function logInteraction(
    userId: string,
    data: CreateInteractionInput
): Promise<Interaction> {
    const occurredAt = data.occurredAt || new Date();

    const [interaction] = await db
        .insert(crmInteractions)
        .values({
            contactId: data.contactId,
            userId,
            type: data.type,
            channel: data.channel,
            subject: data.subject,
            summary: data.summary,
            sentiment: data.sentiment,
            externalId: data.externalId,
            metadata: data.metadata,
            occurredAt,
        })
        .returning();

    // Update contact's lastContactAt
    await db
        .update(crmContacts)
        .set({
            lastContactAt: occurredAt,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(crmContacts.id, data.contactId),
                eq(crmContacts.userId, userId)
            )
        );

    // Recalculate score after every interaction so CRM ranking stays fresh.
    try {
        const { updateContactScore } = await import("./scoring");
        await updateContactScore(userId, data.contactId);
    } catch (error) {
        console.error("[CRM] Failed to update relationship score:", error);
    }

    return interaction;
}

// ============================================================================
// Intelligence
// ============================================================================

/**
 * Find high-importance contacts with no interaction in 14+ days
 */
export async function findStaleContacts(userId: string): Promise<Contact[]> {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    return db
        .select()
        .from(crmContacts)
        .where(
            and(
                eq(crmContacts.userId, userId),
                isNull(crmContacts.mergedIntoId),
                sql`${crmContacts.importance} IN ('critical', 'high')`,
                sql`(
                    ${crmContacts.lastContactAt} IS NULL
                    OR ${crmContacts.lastContactAt} < ${fourteenDaysAgo}
                )`
            )
        )
        .orderBy(desc(crmContacts.relationshipScore));
}

/**
 * Get upcoming meetings with CRM contact context.
 * Cross-references calendar attendees with CRM contacts.
 */
export async function getUpcomingMeetingsWithContacts(
    userId: string
): Promise<Array<{
    eventId: string;
    summary: string;
    start: string | null;
    end: string | null;
    location?: string;
    htmlLink: string;
    attendees: Array<{
        email: string;
        displayName?: string;
        responseStatus?: string;
        crmContact?: { id: string; name: string; company: string | null; importance: string | null };
    }>;
}>> {
    const credentials = await getValidCredentials(userId);
    if (!credentials) {
        return []; // Google not connected, return empty
    }

    try {
        const events = await getUpcomingEvents(userId, 24, 20);

        // Collect all attendee emails to batch-lookup CRM contacts
        const allEmails = new Set<string>();
        for (const event of events) {
            for (const attendee of event.attendees || []) {
                if (attendee.email) allEmails.add(attendee.email.toLowerCase());
            }
        }

        // Batch lookup: find CRM contacts matching attendee emails
        const contactsByEmail = new Map<string, Contact>();
        if (allEmails.size > 0) {
            const emailArray = Array.from(allEmails);
            const contacts = await db
                .select()
                .from(crmContacts)
                .where(
                    and(
                        eq(crmContacts.userId, userId),
                        isNull(crmContacts.mergedIntoId),
                        sql`LOWER(${crmContacts.email}) IN (${sql.join(
                            emailArray.map((e) => sql`${e}`),
                            sql`, `
                        )})`
                    )
                );
            for (const c of contacts) {
                if (c.email) contactsByEmail.set(c.email.toLowerCase(), c);
            }
        }

        return events.map((event) => ({
            eventId: event.id,
            summary: event.summary,
            start: event.start?.dateTime || event.start?.date || null,
            end: event.end?.dateTime || event.end?.date || null,
            location: event.location,
            htmlLink: event.htmlLink,
            attendees: (event.attendees || []).map((a) => {
                const contact = a.email ? contactsByEmail.get(a.email.toLowerCase()) : undefined;
                return {
                    email: a.email,
                    displayName: a.displayName,
                    responseStatus: a.responseStatus,
                    crmContact: contact
                        ? { id: contact.id, name: contact.name, company: contact.company, importance: contact.importance }
                        : undefined,
                };
            }),
        }));
    } catch (error) {
        console.error("[CRM] Failed to fetch upcoming meetings:", error);
        return [];
    }
}

/**
 * Get data for the morning briefing: stale contacts, recent interactions, upcoming meetings
 */
export async function getMorningBriefingData(
    userId: string
): Promise<MorningBriefingData> {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const [staleContacts, recentInteractions, totalResult, upcomingMeetings] = await Promise.all([
        findStaleContacts(userId),
        db
            .select()
            .from(crmInteractions)
            .where(
                and(
                    eq(crmInteractions.userId, userId),
                    sql`${crmInteractions.occurredAt} >= ${twentyFourHoursAgo}`
                )
            )
            .orderBy(desc(crmInteractions.occurredAt))
            .limit(20),
        db
            .select({ count: sql<number>`count(*)::int` })
            .from(crmContacts)
            .where(
                and(
                    eq(crmContacts.userId, userId),
                    isNull(crmContacts.mergedIntoId)
                )
            ),
        getUpcomingMeetingsWithContacts(userId),
    ]);

    return {
        staleContacts,
        recentInteractions,
        upcomingMeetings,
        totalContacts: totalResult[0]?.count || 0,
    };
}
