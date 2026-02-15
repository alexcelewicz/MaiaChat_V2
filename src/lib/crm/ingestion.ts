/**
 * CRM Ingestion
 *
 * Scheduled ingestion from Gmail and Google Calendar.
 * Creates/updates contacts and logs interactions automatically.
 */

import { db } from "@/lib/db";
import { crmContacts, crmInteractions } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { searchEmails } from "@/lib/integrations/google/gmail";
import { listEvents } from "@/lib/integrations/google/calendar";
import { getValidCredentials } from "@/lib/integrations/google/oauth";
import { createContact, updateContact, logInteraction } from "./index";
import type { Contact, CreateContactInput } from "./index";
import { deduplicateContacts, enrichContact } from "./enrichment";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";

// ============================================================================
// Gmail Sync
// ============================================================================

/**
 * Sync contacts and interactions from Gmail.
 * Searches recent emails, extracts sender info, creates/updates contacts,
 * and logs email interactions.
 */
export async function syncFromGmail(
    userId: string
): Promise<{ contactsCreated: number; interactionsLogged: number; contactsMerged: number; contactsEnriched: number }> {
    // Check Google connection
    const credentials = await getValidCredentials(userId);
    if (!credentials) {
        throw new Error(
            "Google not connected. Please connect your Google account in Settings > Integrations."
        );
    }

    let contactsCreated = 0;
    let interactionsLogged = 0;

    // Search for recent emails (last 7 days)
    const result = await searchEmails(userId, "newer_than:7d", {
        maxResults: 50,
    });

    if (!result || result.messages.length === 0) {
        return { contactsCreated, interactionsLogged, contactsMerged: 0, contactsEnriched: 0 };
    }

    // Load existing contacts for dedup lookup
    const existingContacts = await db
        .select()
        .from(crmContacts)
        .where(
            and(
                eq(crmContacts.userId, userId),
                isNull(crmContacts.mergedIntoId)
            )
        );

    const contactsByEmail = new Map<string, Contact>();
    for (const contact of existingContacts) {
        if (contact.email) {
            contactsByEmail.set(contact.email.toLowerCase(), contact);
        }
    }

    // Track external IDs we've already logged to avoid duplicates within this sync
    const loggedExternalIds = new Set<string>();

    // Also load existing interaction external IDs for dedup
    const existingInteractions = await db
        .select({ externalId: crmInteractions.externalId })
        .from(crmInteractions)
        .where(eq(crmInteractions.userId, userId));

    for (const interaction of existingInteractions) {
        if (interaction.externalId) {
            loggedExternalIds.add(interaction.externalId);
        }
    }

    for (const message of result.messages) {
        // Parse sender email and name from "From" field
        const { email: senderEmail, name: senderName } = parseEmailAddress(
            message.from
        );

        if (!senderEmail) continue;

        // Skip if this interaction was already logged
        const externalId = `gmail:${message.id}`;
        if (loggedExternalIds.has(externalId)) continue;

        // Find or create contact
        let contact = contactsByEmail.get(senderEmail.toLowerCase());

        if (!contact) {
            try {
                contact = await createContact(userId, {
                    name: senderName || senderEmail,
                    email: senderEmail,
                });
                contactsByEmail.set(senderEmail.toLowerCase(), contact);
                contactsCreated++;
            } catch (error) {
                console.error(
                    `[CRM Ingestion] Failed to create contact for ${senderEmail}:`,
                    error
                );
                continue;
            }
        }

        // Log the email interaction
        try {
            await logInteraction(userId, {
                contactId: contact.id,
                type: "email_received",
                channel: "gmail",
                subject: message.subject,
                summary: message.snippet,
                externalId,
                occurredAt: message.date,
            });
            loggedExternalIds.add(externalId);
            interactionsLogged++;
        } catch (error) {
            console.error(
                `[CRM Ingestion] Failed to log interaction for message ${message.id}:`,
                error
            );
        }
    }

    // Post-sync: deduplicate contacts
    let contactsMerged = 0;
    try {
        const dedupeResult = await deduplicateContacts(userId);
        contactsMerged = dedupeResult.merged;
        if (contactsMerged > 0) {
            console.log(`[CRM Ingestion] Deduplicated ${contactsMerged} contacts`);
        }
    } catch (e) {
        console.error("[CRM Ingestion] Post-sync deduplication error (non-fatal):", e);
    }

    // Post-sync: enrich contacts missing company or role (limit 20)
    let contactsEnriched = 0;
    try {
        const apiKeys = await getUserApiKeys(userId);
        if (apiKeys.openai || apiKeys.anthropic) {
            const sparse = await db
                .select()
                .from(crmContacts)
                .where(
                    and(
                        eq(crmContacts.userId, userId),
                        isNull(crmContacts.company),
                        isNull(crmContacts.mergedIntoId)
                    )
                )
                .limit(20);
            for (const contact of sparse) {
                const enriched = await enrichContact(contact, apiKeys);
                if (Object.keys(enriched).length > 0) {
                    await updateContact(userId, contact.id, enriched as Partial<CreateContactInput>);
                    contactsEnriched++;
                }
            }
            if (contactsEnriched > 0) {
                console.log(`[CRM Ingestion] Enriched ${contactsEnriched} contacts`);
            }
        }
    } catch (e) {
        console.error("[CRM Ingestion] Post-sync enrichment error (non-fatal):", e);
    }

    return { contactsCreated, interactionsLogged, contactsMerged, contactsEnriched };
}

// ============================================================================
// Calendar Sync
// ============================================================================

/**
 * Sync interactions from Google Calendar.
 * Imports recent and upcoming events as meeting interactions.
 */
export async function syncFromCalendar(
    userId: string
): Promise<{ interactionsLogged: number }> {
    // Check Google connection
    const credentials = await getValidCredentials(userId);
    if (!credentials) {
        throw new Error(
            "Google not connected. Please connect your Google account in Settings > Integrations."
        );
    }

    let interactionsLogged = 0;

    // Get events from the last 7 days and upcoming 7 days
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let events;
    try {
        events = await listEvents(userId, {
            timeMin: sevenDaysAgo.toISOString(),
            timeMax: sevenDaysAhead.toISOString(),
            maxResults: 100,
            singleEvents: true,
            orderBy: "startTime",
        });
    } catch (error) {
        console.error("[CRM Ingestion] Failed to fetch calendar events:", error);
        return { interactionsLogged };
    }

    if (!events || events.length === 0) {
        return { interactionsLogged };
    }

    // Load existing contacts for matching
    const existingContacts = await db
        .select()
        .from(crmContacts)
        .where(
            and(
                eq(crmContacts.userId, userId),
                isNull(crmContacts.mergedIntoId)
            )
        );

    const contactsByEmail = new Map<string, Contact>();
    for (const contact of existingContacts) {
        if (contact.email) {
            contactsByEmail.set(contact.email.toLowerCase(), contact);
        }
    }

    // Load existing interaction external IDs for dedup
    const existingInteractions = await db
        .select({ externalId: crmInteractions.externalId })
        .from(crmInteractions)
        .where(eq(crmInteractions.userId, userId));

    const loggedExternalIds = new Set<string>();
    for (const interaction of existingInteractions) {
        if (interaction.externalId) {
            loggedExternalIds.add(interaction.externalId);
        }
    }

    for (const event of events) {
        if (!event.attendees || event.attendees.length === 0) continue;

        const externalId = `calendar:${event.id}`;
        if (loggedExternalIds.has(externalId)) continue;

        const eventStart = event.start.dateTime || event.start.date;
        const occurredAt = eventStart ? new Date(eventStart) : now;

        // Log interaction for each attendee that matches a contact
        for (const attendee of event.attendees) {
            if (!attendee.email) continue;

            const contact = contactsByEmail.get(attendee.email.toLowerCase());
            if (!contact) continue;

            const attendeeExternalId = `${externalId}:${attendee.email}`;
            if (loggedExternalIds.has(attendeeExternalId)) continue;

            try {
                await logInteraction(userId, {
                    contactId: contact.id,
                    type: "meeting",
                    channel: "calendar",
                    subject: event.summary,
                    summary: event.description
                        ? event.description.substring(0, 500)
                        : undefined,
                    externalId: attendeeExternalId,
                    occurredAt,
                    metadata: {
                        eventId: event.id,
                        location: event.location,
                        attendeeCount: event.attendees?.length || 0,
                        responseStatus: attendee.responseStatus,
                    },
                });
                loggedExternalIds.add(attendeeExternalId);
                interactionsLogged++;
            } catch (error) {
                console.error(
                    `[CRM Ingestion] Failed to log calendar interaction for ${attendee.email}:`,
                    error
                );
            }
        }
    }

    return { interactionsLogged };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse an email "From" field into name and email components.
 * Handles formats like:
 * - "John Smith <john@example.com>"
 * - "john@example.com"
 * - "<john@example.com>"
 */
function parseEmailAddress(from: string): {
    email: string | null;
    name: string | null;
} {
    if (!from) return { email: null, name: null };

    // Try "Name <email>" format
    const bracketMatch = from.match(/^"?([^"<]*)"?\s*<([^>]+)>/);
    if (bracketMatch) {
        return {
            name: bracketMatch[1].trim() || null,
            email: bracketMatch[2].trim(),
        };
    }

    // Try plain email
    const emailMatch = from.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    if (emailMatch) {
        return { email: emailMatch[0], name: null };
    }

    return { email: null, name: null };
}
