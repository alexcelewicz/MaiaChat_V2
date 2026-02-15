/**
 * CRM Contact Enrichment
 *
 * AI-powered contact enrichment:
 * - Enrich contacts using LLM analysis of notes and existing data
 * - Extract contact info from email signatures (regex first, LLM fallback)
 * - Deduplicate contacts by email or similar name+company
 */

import { db } from "@/lib/db";
import { crmContacts } from "@/lib/db/schema";
import { eq, and, isNull, sql, ilike } from "drizzle-orm";
import type { Contact, CreateContactInput } from "./index";

// ============================================================================
// AI Enrichment
// ============================================================================

/**
 * Enrich a contact using LLM to analyze notes and existing data.
 * Returns partial contact fields that can be merged.
 */
export async function enrichContact(
    contact: Contact,
    apiKeys: Record<string, string>
): Promise<Partial<Contact>> {
    const enriched: Partial<Contact> = {};

    // Build a context string from existing contact data
    const contextParts: string[] = [];
    if (contact.name) contextParts.push(`Name: ${contact.name}`);
    if (contact.email) contextParts.push(`Email: ${contact.email}`);
    if (contact.company) contextParts.push(`Company: ${contact.company}`);
    if (contact.role) contextParts.push(`Role: ${contact.role}`);
    if (contact.notes) contextParts.push(`Notes: ${contact.notes}`);
    if (contact.linkedinUrl) contextParts.push(`LinkedIn: ${contact.linkedinUrl}`);
    if (contact.twitterHandle) contextParts.push(`Twitter: ${contact.twitterHandle}`);

    if (contextParts.length < 2) {
        // Not enough data to enrich
        return enriched;
    }

    const prompt = `Analyze this contact information and extract any additional structured data you can infer. Return ONLY a JSON object with fields you can confidently fill in. Only include fields where you have high confidence.

Available fields: company, role, relationship (colleague|client|prospect|friend|family), importance (critical|high|normal|low), tags (array of strings)

Contact data:
${contextParts.join("\n")}

Return only valid JSON, no markdown or explanation.`;

    try {
        // Try OpenAI first, then Anthropic
        const apiKey = apiKeys.openai || apiKeys.anthropic;
        if (!apiKey) return enriched;

        let response: Response;
        let result: string;

        if (apiKeys.openai) {
            response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKeys.openai}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    max_tokens: 500,
                }),
            });
            const data = await response.json();
            result = data.choices?.[0]?.message?.content || "{}";
        } else {
            response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "x-api-key": apiKeys.anthropic,
                    "Content-Type": "application/json",
                    "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                    model: "claude-haiku-4-20250514",
                    max_tokens: 500,
                    messages: [{ role: "user", content: prompt }],
                }),
            });
            const data = await response.json();
            result = data.content?.[0]?.text || "{}";
        }

        // Parse the LLM response
        const parsed = JSON.parse(result.replace(/```json\n?|```/g, "").trim());

        if (parsed.company && !contact.company) enriched.company = parsed.company;
        if (parsed.role && !contact.role) enriched.role = parsed.role;
        if (parsed.relationship) enriched.relationship = parsed.relationship;
        if (parsed.importance) enriched.importance = parsed.importance;
        if (parsed.tags && Array.isArray(parsed.tags)) {
            const existingTags = (contact.tags as string[]) || [];
            const newTags = parsed.tags.filter(
                (t: string) => !existingTags.includes(t)
            );
            if (newTags.length > 0) {
                enriched.tags = [...existingTags, ...newTags];
            }
        }
    } catch (error) {
        console.error("[CRM Enrichment] LLM enrichment failed:", error);
    }

    return enriched;
}

// ============================================================================
// Email Signature Extraction
// ============================================================================

/**
 * Extract contact information from email content/signatures.
 * Uses regex patterns first for common fields, then falls back to LLM
 * for more complex extraction.
 */
export async function extractContactFromEmail(
    emailContent: string,
    apiKeys: Record<string, string>
): Promise<Partial<CreateContactInput>> {
    const result: Partial<CreateContactInput> = {};

    // --- Regex extraction for common patterns ---

    // Email address
    const emailMatch = emailContent.match(
        /[\w.+-]+@[\w-]+\.[\w.]+/
    );
    if (emailMatch) result.email = emailMatch[0];

    // Phone number (various formats)
    const phoneMatch = emailContent.match(
        /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/
    );
    if (phoneMatch) result.phone = phoneMatch[0].trim();

    // LinkedIn URL
    const linkedinMatch = emailContent.match(
        /https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/i
    );
    if (linkedinMatch) result.linkedinUrl = linkedinMatch[0];

    // Twitter handle
    const twitterMatch = emailContent.match(
        /(?:@|(?:twitter|x)\.com\/)([A-Za-z0-9_]{1,15})/i
    );
    if (twitterMatch) result.twitterHandle = `@${twitterMatch[1]}`;

    // Try to extract name from common email signature patterns
    // "Best regards,\nJohn Smith" or "Regards,\nJane Doe"
    const signatureMatch = emailContent.match(
        /(?:regards|best|sincerely|cheers|thanks|thank you)[,\s]*\n+([A-Z][a-z]+ [A-Z][a-z]+)/i
    );
    if (signatureMatch) result.name = signatureMatch[1].trim();

    // Company - look for common patterns like "at Company" or "| Company"
    const companyMatch = emailContent.match(
        /(?:at|@|\|)\s+([A-Z][\w\s&.]+(?:Ltd|Inc|Corp|LLC|GmbH|Co|Group|Technologies|Solutions)?)/i
    );
    if (companyMatch) result.company = companyMatch[1].trim();

    // Role/Title - look for common job title patterns
    const roleMatch = emailContent.match(
        /(?:^|\n)\s*((?:Chief|Senior|Junior|Lead|Head|VP|Director|Manager|Engineer|Developer|Designer|Analyst|Consultant|Associate|Partner|Founder|CEO|CTO|CFO|COO|CMO|CIO|CSO|President|Executive)[\w\s,&]*)/im
    );
    if (roleMatch) result.role = roleMatch[1].trim();

    // If we got a name from regex, we have enough for a basic extraction
    if (result.name) return result;

    // --- LLM fallback for complex extraction ---
    try {
        const apiKey = apiKeys.openai || apiKeys.anthropic;
        if (!apiKey) return result;

        const prompt = `Extract contact information from this email content. Return ONLY a JSON object with any of these fields you can find: name, email, phone, company, role, linkedinUrl, twitterHandle.

Email content:
${emailContent.substring(0, 2000)}

Return only valid JSON, no markdown or explanation.`;

        let llmResult: string;

        if (apiKeys.openai) {
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKeys.openai}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    max_tokens: 500,
                }),
            });
            const data = await response.json();
            llmResult = data.choices?.[0]?.message?.content || "{}";
        } else {
            const response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "x-api-key": apiKeys.anthropic,
                    "Content-Type": "application/json",
                    "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                    model: "claude-haiku-4-20250514",
                    max_tokens: 500,
                    messages: [{ role: "user", content: prompt }],
                }),
            });
            const data = await response.json();
            llmResult = data.content?.[0]?.text || "{}";
        }

        const parsed = JSON.parse(
            llmResult.replace(/```json\n?|```/g, "").trim()
        );

        // Merge LLM results with regex results (regex takes precedence)
        if (parsed.name && !result.name) result.name = parsed.name;
        if (parsed.email && !result.email) result.email = parsed.email;
        if (parsed.phone && !result.phone) result.phone = parsed.phone;
        if (parsed.company && !result.company) result.company = parsed.company;
        if (parsed.role && !result.role) result.role = parsed.role;
        if (parsed.linkedinUrl && !result.linkedinUrl) result.linkedinUrl = parsed.linkedinUrl;
        if (parsed.twitterHandle && !result.twitterHandle) result.twitterHandle = parsed.twitterHandle;
    } catch (error) {
        console.error("[CRM Enrichment] Email extraction LLM fallback failed:", error);
    }

    return result;
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Find and merge duplicate contacts for a user.
 * Duplicates are identified by matching email or similar name+company.
 * The contact with the higher relationship score is kept.
 */
export async function deduplicateContacts(
    userId: string
): Promise<{ merged: number; duplicates: Array<{ kept: string; merged: string }> }> {
    const contacts = await db
        .select()
        .from(crmContacts)
        .where(
            and(
                eq(crmContacts.userId, userId),
                isNull(crmContacts.mergedIntoId)
            )
        );

    const duplicates: Array<{ kept: string; merged: string }> = [];
    const processedIds = new Set<string>();

    for (let i = 0; i < contacts.length; i++) {
        const contactA = contacts[i];
        if (processedIds.has(contactA.id)) continue;

        for (let j = i + 1; j < contacts.length; j++) {
            const contactB = contacts[j];
            if (processedIds.has(contactB.id)) continue;

            const isDuplicate = checkDuplicate(contactA, contactB);
            if (!isDuplicate) continue;

            // Keep the one with the higher score, or the older one if equal
            const [keep, merge] =
                (contactA.relationshipScore || 0) >= (contactB.relationshipScore || 0)
                    ? [contactA, contactB]
                    : [contactB, contactA];

            // Mark the merged contact
            await db
                .update(crmContacts)
                .set({
                    mergedIntoId: keep.id,
                    updatedAt: new Date(),
                })
                .where(eq(crmContacts.id, merge.id));

            // Transfer interactions from merged to kept
            await db.execute(
                sql`UPDATE crm_interactions SET contact_id = ${keep.id} WHERE contact_id = ${merge.id}`
            );

            // Merge missing data from the merged contact into the kept one
            const mergeData: Record<string, unknown> = {};
            if (!keep.email && merge.email) mergeData.email = merge.email;
            if (!keep.phone && merge.phone) mergeData.phone = merge.phone;
            if (!keep.company && merge.company) mergeData.company = merge.company;
            if (!keep.role && merge.role) mergeData.role = merge.role;
            if (!keep.linkedinUrl && merge.linkedinUrl) mergeData.linkedinUrl = merge.linkedinUrl;
            if (!keep.twitterHandle && merge.twitterHandle) mergeData.twitterHandle = merge.twitterHandle;
            if (!keep.notes && merge.notes) mergeData.notes = merge.notes;

            // Merge tags
            const keepTags = (keep.tags as string[]) || [];
            const mergeTags = (merge.tags as string[]) || [];
            const combinedTags = [...new Set([...keepTags, ...mergeTags])];
            if (combinedTags.length > keepTags.length) {
                mergeData.tags = combinedTags;
            }

            if (Object.keys(mergeData).length > 0) {
                mergeData.updatedAt = new Date();
                await db
                    .update(crmContacts)
                    .set(mergeData)
                    .where(eq(crmContacts.id, keep.id));
            }

            processedIds.add(merge.id);
            duplicates.push({ kept: keep.id, merged: merge.id });
        }
    }

    return { merged: duplicates.length, duplicates };
}

/**
 * Check if two contacts are likely duplicates.
 * Match criteria:
 * - Same email (case-insensitive)
 * - Same name + same company (case-insensitive, fuzzy)
 */
function checkDuplicate(a: Contact, b: Contact): boolean {
    // Email match (strongest signal)
    if (
        a.email &&
        b.email &&
        a.email.toLowerCase().trim() === b.email.toLowerCase().trim()
    ) {
        return true;
    }

    // Name + Company match
    if (a.name && b.name && a.company && b.company) {
        const nameA = a.name.toLowerCase().trim();
        const nameB = b.name.toLowerCase().trim();
        const companyA = a.company.toLowerCase().trim();
        const companyB = b.company.toLowerCase().trim();

        if (nameA === nameB && companyA === companyB) {
            return true;
        }

        // Fuzzy name match: check if one name contains the other
        // Handles "John Smith" vs "J. Smith" or "John" vs "John Smith"
        if (
            companyA === companyB &&
            (nameA.includes(nameB) || nameB.includes(nameA))
        ) {
            return true;
        }
    }

    return false;
}
