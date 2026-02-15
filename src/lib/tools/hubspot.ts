/**
 * HubSpot CRM Tool
 *
 * Provides HubSpot CRM capabilities to AI agents.
 * Supports: search_contacts, get_contact, create_contact, update_contact,
 *           list_deals, get_deal, list_companies, add_note
 */

import { z } from "zod";
import type { Tool, ToolId, ToolResult } from "./types";
import {
    searchContacts,
    getContact,
    createContact,
    updateContact,
    listDeals,
    getDeal,
    listCompanies,
    addNote,
} from "@/lib/integrations/hubspot/client";
import { hasValidHubSpotCredentials } from "@/lib/integrations/hubspot/oauth";

// ============================================================================
// Tool Schema
// ============================================================================

const hubspotToolSchema = z.object({
    action: z.enum([
        "search_contacts",
        "get_contact",
        "create_contact",
        "update_contact",
        "list_deals",
        "get_deal",
        "list_companies",
        "add_note",
    ]),

    // Search / query
    query: z.string().optional(),

    // Object identification
    contactId: z.string().optional(),
    dealId: z.string().optional(),

    // Contact create/update properties
    properties: z.record(z.string(), z.string()).optional(),

    // Note fields
    objectType: z.string().optional(),
    objectId: z.string().optional(),
    note: z.string().optional(),
});

type HubSpotToolInput = z.infer<typeof hubspotToolSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const hubspotTool: Tool = {
    id: "hubspot" as ToolId,
    name: "HubSpot CRM",
    description: `Manage HubSpot CRM contacts, deals, and companies.

Actions:
- search_contacts: Search contacts by query string
- get_contact: Get a specific contact by contactId
- create_contact: Create a new contact with properties (e.g., { "firstname": "John", "lastname": "Doe", "email": "john@example.com" })
- update_contact: Update an existing contact's properties
- list_deals: List recent deals from HubSpot
- get_deal: Get a specific deal by dealId
- list_companies: List companies from HubSpot
- add_note: Add a note to a contact, deal, or company (requires objectType, objectId, note)

Requires HubSpot account to be connected in settings.`,
    category: "integration",
    icon: "Building2",
    schema: hubspotToolSchema,
    execute: async (params, context) => {
        if (!context?.userId) {
            return { success: false, error: "User context required for HubSpot actions" };
        }
        return executeHubSpotTool(params as HubSpotToolInput, { userId: context.userId });
    },
};

// ============================================================================
// Tool Execution
// ============================================================================

async function executeHubSpotTool(
    input: HubSpotToolInput,
    context: { userId: string }
): Promise<ToolResult> {
    const { action } = input;
    const { userId } = context;

    // Verify HubSpot credentials
    const connected = await hasValidHubSpotCredentials(userId);
    if (!connected) {
        return {
            success: false,
            error: "HubSpot not connected. Please connect your HubSpot account in Settings > Integrations.",
        };
    }

    try {
        switch (action) {
            case "search_contacts":
                return await handleSearchContacts(userId, input);

            case "get_contact":
                return await handleGetContact(userId, input);

            case "create_contact":
                return await handleCreateContact(userId, input);

            case "update_contact":
                return await handleUpdateContact(userId, input);

            case "list_deals":
                return await handleListDeals(userId);

            case "get_deal":
                return await handleGetDeal(userId, input);

            case "list_companies":
                return await handleListCompanies(userId);

            case "add_note":
                return await handleAddNote(userId, input);

            default:
                return {
                    success: false,
                    error: `Unknown action: ${action}`,
                };
        }
    } catch (error) {
        console.error("[HubSpot Tool] Error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "HubSpot operation failed",
        };
    }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleSearchContacts(
    userId: string,
    input: HubSpotToolInput
): Promise<ToolResult> {
    if (!input.query) {
        return { success: false, error: "query is required for search_contacts action" };
    }

    const result = await searchContacts(userId, input.query);

    return {
        success: true,
        data: {
            total: result.total,
            count: result.results.length,
            contacts: result.results,
        },
    };
}

async function handleGetContact(
    userId: string,
    input: HubSpotToolInput
): Promise<ToolResult> {
    if (!input.contactId) {
        return { success: false, error: "contactId is required for get_contact action" };
    }

    const contact = await getContact(userId, input.contactId);

    return {
        success: true,
        data: contact,
    };
}

async function handleCreateContact(
    userId: string,
    input: HubSpotToolInput
): Promise<ToolResult> {
    if (!input.properties || Object.keys(input.properties).length === 0) {
        return {
            success: false,
            error: "properties object is required for create_contact action (e.g., { firstname, lastname, email })",
        };
    }

    const contact = await createContact(userId, { properties: input.properties });

    return {
        success: true,
        data: {
            ...contact,
            message: "Contact created successfully",
        },
    };
}

async function handleUpdateContact(
    userId: string,
    input: HubSpotToolInput
): Promise<ToolResult> {
    if (!input.contactId) {
        return { success: false, error: "contactId is required for update_contact action" };
    }
    if (!input.properties || Object.keys(input.properties).length === 0) {
        return { success: false, error: "properties object is required for update_contact action" };
    }

    const contact = await updateContact(userId, input.contactId, { properties: input.properties });

    return {
        success: true,
        data: {
            ...contact,
            message: "Contact updated successfully",
        },
    };
}

async function handleListDeals(userId: string): Promise<ToolResult> {
    const result = await listDeals(userId);

    return {
        success: true,
        data: {
            count: result.results.length,
            deals: result.results,
        },
    };
}

async function handleGetDeal(
    userId: string,
    input: HubSpotToolInput
): Promise<ToolResult> {
    if (!input.dealId) {
        return { success: false, error: "dealId is required for get_deal action" };
    }

    const deal = await getDeal(userId, input.dealId);

    return {
        success: true,
        data: deal,
    };
}

async function handleListCompanies(userId: string): Promise<ToolResult> {
    const result = await listCompanies(userId);

    return {
        success: true,
        data: {
            count: result.results.length,
            companies: result.results,
        },
    };
}

async function handleAddNote(
    userId: string,
    input: HubSpotToolInput
): Promise<ToolResult> {
    if (!input.objectType) {
        return { success: false, error: "objectType is required for add_note action (e.g., 'contact', 'deal', 'company')" };
    }
    if (!input.objectId) {
        return { success: false, error: "objectId is required for add_note action" };
    }
    if (!input.note) {
        return { success: false, error: "note text is required for add_note action" };
    }

    const result = await addNote(userId, input.objectType, input.objectId, input.note);

    return {
        success: true,
        data: {
            ...result,
            message: "Note added successfully",
        },
    };
}

export default hubspotTool;
