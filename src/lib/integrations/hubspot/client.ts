/**
 * HubSpot CRM API Client
 *
 * Provides CRM capabilities via HubSpot REST API v3.
 * Uses the HubSpot OAuth credentials from oauth.ts.
 */

import { getValidHubSpotCredentials } from "./oauth";

const HUBSPOT_API_BASE = "https://api.hubapi.com";

// ============================================================================
// Types
// ============================================================================

export interface HubSpotContact {
    id: string;
    properties: Record<string, string | null>;
    createdAt: string;
    updatedAt: string;
    archived: boolean;
}

export interface HubSpotDeal {
    id: string;
    properties: Record<string, string | null>;
    createdAt: string;
    updatedAt: string;
    archived: boolean;
}

export interface HubSpotCompany {
    id: string;
    properties: Record<string, string | null>;
    createdAt: string;
    updatedAt: string;
    archived: boolean;
}

export interface HubSpotNote {
    id: string;
    properties: Record<string, string | null>;
    createdAt: string;
    updatedAt: string;
}

export interface HubSpotSearchResult<T> {
    total: number;
    results: T[];
    paging?: {
        next?: { after: string };
    };
}

export interface HubSpotListResult<T> {
    results: T[];
    paging?: {
        next?: { after: string };
    };
}

// ============================================================================
// Authenticated Fetch Helper
// ============================================================================

/**
 * Make an authenticated request to the HubSpot API
 */
async function hubspotFetch(
    userId: string,
    path: string,
    options?: RequestInit
): Promise<Response> {
    const credentials = await getValidHubSpotCredentials(userId);
    if (!credentials) {
        throw new Error(
            "HubSpot not connected. Please connect your HubSpot account in Settings > Integrations."
        );
    }

    const url = path.startsWith("http")
        ? path
        : `${HUBSPOT_API_BASE}${path}`;

    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
            ...options?.headers,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `HubSpot API error (${response.status}): ${errorText}`
        );
    }

    return response;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Search contacts by query string
 */
export async function searchContacts(
    userId: string,
    query: string
): Promise<HubSpotSearchResult<HubSpotContact>> {
    const response = await hubspotFetch(userId, "/crm/v3/objects/contacts/search", {
        method: "POST",
        body: JSON.stringify({
            query,
            limit: 20,
            properties: [
                "firstname", "lastname", "email", "phone",
                "company", "jobtitle", "lifecyclestage",
            ],
        }),
    });

    return await response.json();
}

/**
 * Get a single contact by ID
 */
export async function getContact(
    userId: string,
    contactId: string
): Promise<HubSpotContact> {
    const params = new URLSearchParams({
        properties: "firstname,lastname,email,phone,company,jobtitle,lifecyclestage,createdate,lastmodifieddate",
    });

    const response = await hubspotFetch(
        userId,
        `/crm/v3/objects/contacts/${encodeURIComponent(contactId)}?${params}`
    );

    return await response.json();
}

/**
 * Create a new contact
 */
export async function createContact(
    userId: string,
    data: { properties: Record<string, string> }
): Promise<HubSpotContact> {
    const response = await hubspotFetch(userId, "/crm/v3/objects/contacts", {
        method: "POST",
        body: JSON.stringify(data),
    });

    return await response.json();
}

/**
 * Update an existing contact
 */
export async function updateContact(
    userId: string,
    contactId: string,
    data: { properties: Record<string, string> }
): Promise<HubSpotContact> {
    const response = await hubspotFetch(
        userId,
        `/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`,
        {
            method: "PATCH",
            body: JSON.stringify(data),
        }
    );

    return await response.json();
}

/**
 * List deals
 */
export async function listDeals(
    userId: string
): Promise<HubSpotListResult<HubSpotDeal>> {
    const params = new URLSearchParams({
        limit: "20",
        properties: "dealname,amount,dealstage,pipeline,closedate,createdate",
    });

    const response = await hubspotFetch(userId, `/crm/v3/objects/deals?${params}`);
    return await response.json();
}

/**
 * Get a single deal by ID
 */
export async function getDeal(
    userId: string,
    dealId: string
): Promise<HubSpotDeal> {
    const params = new URLSearchParams({
        properties: "dealname,amount,dealstage,pipeline,closedate,createdate,hubspot_owner_id",
    });

    const response = await hubspotFetch(
        userId,
        `/crm/v3/objects/deals/${encodeURIComponent(dealId)}?${params}`
    );

    return await response.json();
}

/**
 * List companies
 */
export async function listCompanies(
    userId: string
): Promise<HubSpotListResult<HubSpotCompany>> {
    const params = new URLSearchParams({
        limit: "20",
        properties: "name,domain,industry,phone,city,state,country,numberofemployees",
    });

    const response = await hubspotFetch(userId, `/crm/v3/objects/companies?${params}`);
    return await response.json();
}

/**
 * Add a note associated with a CRM object
 */
export async function addNote(
    userId: string,
    objectType: string,
    objectId: string,
    note: string
): Promise<HubSpotNote> {
    // Create the note engagement
    const response = await hubspotFetch(userId, "/crm/v3/objects/notes", {
        method: "POST",
        body: JSON.stringify({
            properties: {
                hs_timestamp: new Date().toISOString(),
                hs_note_body: note,
            },
            associations: [
                {
                    to: { id: objectId },
                    types: [
                        {
                            associationCategory: "HUBSPOT_DEFINED",
                            associationTypeId: getAssociationTypeId(objectType),
                        },
                    ],
                },
            ],
        }),
    });

    return await response.json();
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the HubSpot association type ID for note -> object type
 */
function getAssociationTypeId(objectType: string): number {
    // Standard HubSpot association type IDs for notes
    switch (objectType.toLowerCase()) {
        case "contacts":
        case "contact":
            return 202; // note_to_contact
        case "deals":
        case "deal":
            return 214; // note_to_deal
        case "companies":
        case "company":
            return 190; // note_to_company
        default:
            return 202; // default to contact
    }
}
