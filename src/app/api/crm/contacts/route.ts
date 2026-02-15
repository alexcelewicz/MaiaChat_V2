import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import {
    searchContacts,
    listContacts,
    createContact,
    type CreateContactInput,
} from "@/lib/crm";
import { deduplicateContacts } from "@/lib/crm/enrichment";
import { db } from "@/lib/db";
import { crmContacts } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

type BulkContactPayload = Record<string, unknown>;

function toStringOrUndefined(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function parseTags(raw: unknown): string[] | undefined {
    if (Array.isArray(raw)) {
        const tags = raw
            .map((v) => toStringOrUndefined(v))
            .filter((v): v is string => Boolean(v));
        return tags.length > 0 ? tags : undefined;
    }

    if (typeof raw === "string") {
        const tags = raw
            .split(/[,;|]/g)
            .map((v) => v.trim())
            .filter(Boolean);
        return tags.length > 0 ? tags : undefined;
    }

    return undefined;
}

function normalizeContactInput(raw: BulkContactPayload): CreateContactInput | null {
    const fullName = toStringOrUndefined(raw.name) || toStringOrUndefined(raw.full_name);
    const firstName = toStringOrUndefined(raw.first_name);
    const lastName = toStringOrUndefined(raw.last_name);
    const email = toStringOrUndefined(raw.email) || toStringOrUndefined(raw.email_address);

    const computedName =
        fullName ||
        [firstName, lastName].filter(Boolean).join(" ").trim() ||
        email;

    if (!computedName) {
        return null;
    }

    return {
        name: computedName,
        email,
        phone: toStringOrUndefined(raw.phone),
        company: toStringOrUndefined(raw.company),
        role: toStringOrUndefined(raw.role),
        relationship: toStringOrUndefined(raw.relationship),
        importance: toStringOrUndefined(raw.importance),
        tags: parseTags(raw.tags),
        notes: toStringOrUndefined(raw.notes),
        linkedinUrl: toStringOrUndefined(raw.linkedinUrl) || toStringOrUndefined(raw.linkedin_url),
        twitterHandle: toStringOrUndefined(raw.twitterHandle) || toStringOrUndefined(raw.twitter_handle),
    };
}

async function getExistingContactEmailSet(userId: string): Promise<Set<string>> {
    const rows = await db
        .select({ email: crmContacts.email })
        .from(crmContacts)
        .where(
            and(
                eq(crmContacts.userId, userId),
                isNull(crmContacts.mergedIntoId),
                sql`${crmContacts.email} IS NOT NULL`
            )
        );

    return new Set(
        rows
            .map((r) => r.email?.toLowerCase())
            .filter((email): email is string => Boolean(email))
    );
}

// GET /api/crm/contacts - List or search contacts
export async function GET(request: NextRequest) {
    try {
        const userId = await getSessionUserId();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);

        const q = searchParams.get("q") || undefined;
        const limit = parseInt(searchParams.get("limit") || "50", 10);
        const offset = parseInt(searchParams.get("offset") || "0", 10);

        // Use search if query param provided, otherwise list
        const result = q
            ? await searchContacts(userId, q)
            : await listContacts(userId, { limit, offset });

        // Normalize result to always be an array
        const contacts = Array.isArray(result) ? result : (result as { contacts: unknown[] }).contacts || [];
        const total = Array.isArray(result)
            ? contacts.length
            : (result as { total?: number }).total ?? contacts.length;

        return NextResponse.json({
            success: true,
            contacts,
            total,
        });
    } catch (error) {
        console.error("[CRM] List contacts error:", error);
        return NextResponse.json(
            { error: "Failed to list contacts", code: "LIST_FAILED" },
            { status: 500 }
        );
    }
}

// POST /api/crm/contacts - Create a new contact
export async function POST(request: NextRequest) {
    try {
        const userId = await getSessionUserId();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const body = (await request.json()) as
            | CreateContactInput
            | { bulk?: boolean; contacts?: BulkContactPayload[] };

        if (body && typeof body === "object" && "bulk" in body && body.bulk === true) {
            const contactsPayload = Array.isArray(body.contacts) ? body.contacts : [];

            if (contactsPayload.length === 0) {
                return NextResponse.json(
                    { error: "contacts array is required for bulk import", code: "VALIDATION_ERROR" },
                    { status: 400 }
                );
            }

            if (contactsPayload.length > 1000) {
                return NextResponse.json(
                    { error: "Bulk import limited to 1000 contacts per request", code: "VALIDATION_ERROR" },
                    { status: 400 }
                );
            }

            const existingEmails = await getExistingContactEmailSet(userId);
            let imported = 0;
            let skippedInvalid = 0;
            let skippedDuplicate = 0;
            const errors: string[] = [];

            for (const payload of contactsPayload) {
                const normalized = normalizeContactInput(payload);
                if (!normalized) {
                    skippedInvalid++;
                    continue;
                }

                const emailKey = normalized.email?.toLowerCase();
                if (emailKey && existingEmails.has(emailKey)) {
                    skippedDuplicate++;
                    continue;
                }

                try {
                    await createContact(userId, normalized);
                    imported++;
                    if (emailKey) {
                        existingEmails.add(emailKey);
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : "Unknown error";
                    errors.push(`Failed to import "${normalized.name}": ${message}`);
                }
            }

            // Post-import deduplication
            let contactsMerged = 0;
            try {
                const dedupeResult = await deduplicateContacts(userId);
                contactsMerged = dedupeResult.merged;
            } catch (e) {
                console.error("[CRM] Post-import deduplication error (non-fatal):", e);
            }

            return NextResponse.json(
                {
                    success: true,
                    imported,
                    skippedInvalid,
                    skippedDuplicate,
                    contactsMerged,
                    errors,
                },
                { status: 201 }
            );
        }

        const single = body as CreateContactInput;

        if (!single.name) {
            return NextResponse.json(
                { error: "Name is required", code: "VALIDATION_ERROR" },
                { status: 400 }
            );
        }

        const contact = await createContact(userId, single);

        return NextResponse.json(
            { success: true, contact },
            { status: 201 }
        );
    } catch (error) {
        console.error("[CRM] Create contact error:", error);
        return NextResponse.json(
            { error: "Failed to create contact", code: "CREATE_FAILED" },
            { status: 500 }
        );
    }
}
