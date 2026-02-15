/**
 * HubSpot OAuth 2.0
 *
 * Implements OAuth 2.0 authentication for HubSpot CRM integration.
 * Follows the same pattern as Google OAuth in ../google/oauth.ts.
 */

import { db } from "@/lib/db";
import { hubspotCredentials, verification } from "@/lib/db/schema";
import { and, eq, like, lt } from "drizzle-orm";
import { randomBytes } from "crypto";

// ============================================================================
// Configuration
// ============================================================================

const HUBSPOT_AUTH_URL = "https://app.hubspot.com/oauth/authorize";
const HUBSPOT_TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";
const OAUTH_FLOW_TIMEOUT = 10 * 60 * 1000;
const OAUTH_STATE_PREFIX = "hubspot_oauth:";

const DEFAULT_SCOPES = [
    "crm.objects.contacts.read",
    "crm.objects.contacts.write",
    "crm.objects.deals.read",
    "crm.objects.companies.read",
];

// ============================================================================
// Types
// ============================================================================

export interface HubSpotOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
}

export interface HubSpotCredentials {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    portalId?: string;
    scope: string;
}

export interface HubSpotOAuthCallbackResult {
    success: boolean;
    userId?: string;
    credentials?: HubSpotCredentials;
    error?: string;
}

// ============================================================================
// OAuth Configuration
// ============================================================================

/**
 * Get HubSpot OAuth configuration from environment variables
 */
export function getHubSpotOAuthConfig(): HubSpotOAuthConfig {
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error(
            "Missing HubSpot OAuth credentials. Set HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET."
        );
    }

    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${baseUrl}/api/integrations/hubspot/callback`;

    return {
        clientId,
        clientSecret,
        redirectUri,
        scopes: DEFAULT_SCOPES,
    };
}

// ============================================================================
// OAuth URL Building
// ============================================================================

/**
 * Build the HubSpot OAuth authorization URL
 */
export function buildHubSpotAuthUrl(state: string): string {
    const config = getHubSpotOAuthConfig();

    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes.join(" "),
        state,
    });

    return `${HUBSPOT_AUTH_URL}?${params.toString()}`;
}

// ============================================================================
// OAuth State Management
// ============================================================================

async function cleanupOldFlows(): Promise<void> {
    const now = new Date();
    await db.delete(verification).where(
        and(
            like(verification.identifier, `${OAUTH_STATE_PREFIX}%`),
            lt(verification.expiresAt, now)
        )
    );
}

/**
 * Initiate HubSpot OAuth flow with server-side state tracking.
 */
export async function initiateHubSpotOAuthFlow(userId: string): Promise<{
    authUrl: string;
    state: string;
}> {
    await cleanupOldFlows();

    const state = randomBytes(24).toString("hex");
    const authUrl = buildHubSpotAuthUrl(state);

    await db.insert(verification).values({
        id: state,
        identifier: `${OAUTH_STATE_PREFIX}${state}`,
        value: JSON.stringify({ userId }),
        expiresAt: new Date(Date.now() + OAUTH_FLOW_TIMEOUT),
    });

    return { authUrl, state };
}

/**
 * Complete HubSpot OAuth flow after callback.
 */
export async function completeHubSpotOAuthFlow(
    code: string,
    state: string
): Promise<HubSpotOAuthCallbackResult> {
    await cleanupOldFlows();

    const [flowRecord] = await db
        .select()
        .from(verification)
        .where(eq(verification.identifier, `${OAUTH_STATE_PREFIX}${state}`))
        .limit(1);

    if (!flowRecord) {
        return {
            success: false,
            error: "Invalid or expired OAuth state. Please reconnect HubSpot.",
        };
    }

    // Consume state token immediately to prevent replay attacks
    await db.delete(verification).where(eq(verification.id, flowRecord.id));

    let flow: { userId: string } | null = null;
    try {
        flow = JSON.parse(flowRecord.value) as { userId: string };
    } catch {
        return {
            success: false,
            error: "Invalid OAuth state payload.",
        };
    }

    if (!flow?.userId) {
        return {
            success: false,
            error: "Invalid OAuth state payload.",
        };
    }

    try {
        const credentials = await exchangeHubSpotCode(code);
        await storeHubSpotCredentials(flow.userId, credentials);

        return {
            success: true,
            userId: flow.userId,
            credentials,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "HubSpot OAuth callback failed",
        };
    }
}

// ============================================================================
// Token Exchange
// ============================================================================

/**
 * Exchange authorization code for tokens
 */
export async function exchangeHubSpotCode(code: string): Promise<HubSpotCredentials> {
    const config = getHubSpotOAuthConfig();

    const response = await fetch(HUBSPOT_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
            code,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HubSpot token exchange failed: ${error}`);
    }

    const data = await response.json();

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
        portalId: data.hub_id?.toString(),
        scope: data.scope || config.scopes.join(" "),
    };
}

/**
 * Refresh an expired HubSpot access token
 */
export async function refreshHubSpotToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}> {
    const config = getHubSpotOAuthConfig();

    const response = await fetch(HUBSPOT_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: config.clientId,
            client_secret: config.clientSecret,
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HubSpot token refresh failed: ${error}`);
    }

    const data = await response.json();

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
    };
}

// ============================================================================
// Credential Storage
// ============================================================================

/**
 * Store HubSpot credentials for a user
 */
export async function storeHubSpotCredentials(
    userId: string,
    credentials: HubSpotCredentials
): Promise<void> {
    const existing = await db
        .select()
        .from(hubspotCredentials)
        .where(eq(hubspotCredentials.userId, userId))
        .limit(1);

    const data = {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: new Date(credentials.expiresAt),
        portalId: credentials.portalId,
        scope: credentials.scope,
        updatedAt: new Date(),
    };

    if (existing.length > 0) {
        await db
            .update(hubspotCredentials)
            .set(data)
            .where(eq(hubspotCredentials.userId, userId));
    } else {
        await db.insert(hubspotCredentials).values({
            userId,
            ...data,
        });
    }
}

/**
 * Get stored HubSpot credentials for a user
 */
async function getStoredHubSpotCredentials(userId: string): Promise<HubSpotCredentials | null> {
    const [result] = await db
        .select()
        .from(hubspotCredentials)
        .where(eq(hubspotCredentials.userId, userId))
        .limit(1);

    if (!result) {
        return null;
    }

    return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt.getTime(),
        portalId: result.portalId || undefined,
        scope: result.scope,
    };
}

/**
 * Get valid HubSpot credentials, refreshing if needed
 */
export async function getValidHubSpotCredentials(userId: string): Promise<HubSpotCredentials | null> {
    const credentials = await getStoredHubSpotCredentials(userId);

    if (!credentials) {
        return null;
    }

    // Check if token is expired (with 5 minute buffer)
    const isExpired = credentials.expiresAt < Date.now() + 5 * 60 * 1000;

    if (isExpired) {
        try {
            const refreshed = await refreshHubSpotToken(credentials.refreshToken);

            const updated: HubSpotCredentials = {
                ...credentials,
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken,
                expiresAt: refreshed.expiresAt,
            };

            await storeHubSpotCredentials(userId, updated);

            return updated;
        } catch (error) {
            console.error("[HubSpot OAuth] Failed to refresh token:", error);
            return null;
        }
    }

    return credentials;
}

/**
 * Delete stored HubSpot credentials for a user
 */
export async function deleteHubSpotCredentials(userId: string): Promise<void> {
    await db
        .delete(hubspotCredentials)
        .where(eq(hubspotCredentials.userId, userId));
}

/**
 * Check if user has valid HubSpot credentials
 */
export async function hasValidHubSpotCredentials(userId: string): Promise<boolean> {
    const credentials = await getValidHubSpotCredentials(userId);
    return credentials !== null;
}
