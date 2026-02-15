/**
 * CRM Relationship Scoring
 *
 * Calculates a 0-100 relationship score based on:
 * - Interaction frequency (logarithmic)
 * - Recency of last interaction
 * - Sentiment of interactions
 * - Importance weight of the contact
 */

import { db } from "@/lib/db";
import { crmContacts, crmInteractions } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import type { Contact, Interaction } from "./index";

// ============================================================================
// Constants
// ============================================================================

const IMPORTANCE_WEIGHTS: Record<string, number> = {
    critical: 2.0,
    high: 1.5,
    normal: 1.0,
    low: 0.5,
};

const SENTIMENT_FACTORS: Record<string, number> = {
    positive: 1.2,
    neutral: 1.0,
    negative: 0.8,
};

// ============================================================================
// Scoring Algorithm
// ============================================================================

/**
 * Calculate the recency factor based on the most recent interaction.
 * More recent interactions yield a higher factor.
 */
function getRecencyFactor(interactions: Interaction[]): number {
    if (interactions.length === 0) return 0.1;

    const now = Date.now();
    const mostRecent = interactions.reduce((latest, i) => {
        const ts = new Date(i.occurredAt).getTime();
        return ts > latest ? ts : latest;
    }, 0);

    const daysSinceContact = (now - mostRecent) / (1000 * 60 * 60 * 24);

    if (daysSinceContact <= 7) return 1.0;
    if (daysSinceContact <= 14) return 0.8;
    if (daysSinceContact <= 30) return 0.5;
    if (daysSinceContact <= 60) return 0.3;
    return 0.1;
}

/**
 * Calculate the average sentiment factor across all interactions.
 */
function getSentimentFactor(interactions: Interaction[]): number {
    if (interactions.length === 0) return 1.0;

    const sentimentValues = interactions
        .filter((i) => i.sentiment)
        .map((i) => SENTIMENT_FACTORS[i.sentiment!] || 1.0);

    if (sentimentValues.length === 0) return 1.0;

    const sum = sentimentValues.reduce((acc, v) => acc + v, 0);
    return sum / sentimentValues.length;
}

/**
 * Calculate the frequency factor using logarithmic scaling.
 * More interactions = higher score, but with diminishing returns.
 */
function getFrequencyFactor(interactionCount: number): number {
    if (interactionCount === 0) return 0;
    // log2(count + 1) / log2(51) normalizes so that ~50 interactions => ~1.0
    return Math.min(1.0, Math.log2(interactionCount + 1) / Math.log2(51));
}

/**
 * Calculate the relationship score for a contact (0-100).
 *
 * Score = frequency * recency * sentiment * importance_weight * 100
 * Clamped to [0, 100].
 */
export function calculateRelationshipScore(
    contact: Contact,
    interactions: Interaction[]
): number {
    const importance = contact.importance || "normal";
    const importanceWeight = IMPORTANCE_WEIGHTS[importance] || 1.0;

    const frequencyFactor = getFrequencyFactor(interactions.length);
    const recencyFactor = getRecencyFactor(interactions);
    const sentimentFactor = getSentimentFactor(interactions);

    // Raw score: each factor contributes, importance amplifies
    const rawScore =
        frequencyFactor * recencyFactor * sentimentFactor * importanceWeight * 100;

    // Clamp to 0-100
    return Math.round(Math.max(0, Math.min(100, rawScore)));
}

/**
 * Recalculate and persist relationship score for a single contact.
 */
export async function updateContactScore(
    userId: string,
    contactId: string
): Promise<number | null> {
    const [contact] = await db
        .select()
        .from(crmContacts)
        .where(
            and(
                eq(crmContacts.userId, userId),
                eq(crmContacts.id, contactId),
                isNull(crmContacts.mergedIntoId)
            )
        )
        .limit(1);

    if (!contact) {
        return null;
    }

    const interactions = await db
        .select()
        .from(crmInteractions)
        .where(
            and(
                eq(crmInteractions.userId, userId),
                eq(crmInteractions.contactId, contactId)
            )
        );

    const score = calculateRelationshipScore(contact, interactions);

    await db
        .update(crmContacts)
        .set({
            relationshipScore: score,
            updatedAt: new Date(),
        })
        .where(eq(crmContacts.id, contact.id));

    return score;
}

/**
 * Recalculate and persist relationship scores for all of a user's contacts.
 */
export async function updateAllScores(userId: string): Promise<void> {
    // Get all active contacts
    const contacts = await db
        .select()
        .from(crmContacts)
        .where(
            and(
                eq(crmContacts.userId, userId),
                isNull(crmContacts.mergedIntoId)
            )
        );

    if (contacts.length === 0) return;

    // Get all interactions for this user in one query
    const allInteractions = await db
        .select()
        .from(crmInteractions)
        .where(eq(crmInteractions.userId, userId));

    // Group interactions by contactId
    const interactionsByContact = new Map<string, Interaction[]>();
    for (const interaction of allInteractions) {
        const existing = interactionsByContact.get(interaction.contactId) || [];
        existing.push(interaction);
        interactionsByContact.set(interaction.contactId, existing);
    }

    // Update each contact's score
    const updates = contacts.map(async (contact) => {
        const contactInteractions = interactionsByContact.get(contact.id) || [];
        const score = calculateRelationshipScore(contact, contactInteractions);

        await db
            .update(crmContacts)
            .set({
                relationshipScore: score,
                updatedAt: new Date(),
            })
            .where(eq(crmContacts.id, contact.id));
    });

    await Promise.all(updates);
}
