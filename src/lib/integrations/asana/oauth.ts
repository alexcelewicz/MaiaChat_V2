/**
 * Asana OAuth 2.0
 *
 * Implements OAuth 2.0 authentication for Asana integration.
 * Follows the same pattern as Google OAuth in ../google/oauth.ts.
 */

import { db } from "@/lib/db";
import { asanaCredentials, verification } from "@/lib/db/schema";
import { and, eq, like, lt } from "drizzle-orm";
import { randomBytes } from "crypto";

// ============================================================================
// Configuration
// ============================================================================

const ASANA_AUTH_URL = "https://app.asana.com/-/oauth_authorize";
const ASANA_TOKEN_URL = "https://app.asana.com/-/oauth_token";
const OAUTH_FLOW_TIMEOUT = 10 * 60 * 1000;
const OAUTH_STATE_PREFIX = "asana_oauth:";

// ============================================================================
// Types
// ============================================================================

export interface AsanaOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export interface AsanaCredentials {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    workspaceId?: string;
    scope: string;
}

export interface AsanaOAuthCallbackResult {
    success: boolean;
    userId?: string;
    credentials?: AsanaCredentials;
    error?: string;
}

// ============================================================================
// OAuth Configuration
// ============================================================================

/**
 * Get Asana OAuth configuration from environment variables
 */
export function getAsanaOAuthConfig(): AsanaOAuthConfig {
    const clientId = process.env.ASANA_CLIENT_ID;
    const clientSecret = process.env.ASANA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error(
            "Missing Asana OAuth credentials. Set ASANA_CLIENT_ID and ASANA_CLIENT_SECRET."
        );
    }

    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${baseUrl}/api/integrations/asana/callback`;

    return {
        clientId,
        clientSecret,
        redirectUri,
    };
}

// ============================================================================
// OAuth URL Building
// ============================================================================

/**
 * Build the Asana OAuth authorization URL
 */
export function buildAsanaAuthUrl(state: string): string {
    const config = getAsanaOAuthConfig();

    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        state,
    });

    return `${ASANA_AUTH_URL}?${params.toString()}`;
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
 * Initiate Asana OAuth flow with server-side state tracking.
 */
export async function initiateAsanaOAuthFlow(userId: string): Promise<{
    authUrl: string;
    state: string;
}> {
    await cleanupOldFlows();

    const state = randomBytes(24).toString("hex");
    const authUrl = buildAsanaAuthUrl(state);

    await db.insert(verification).values({
        id: state,
        identifier: `${OAUTH_STATE_PREFIX}${state}`,
        value: JSON.stringify({ userId }),
        expiresAt: new Date(Date.now() + OAUTH_FLOW_TIMEOUT),
    });

    return { authUrl, state };
}

/**
 * Complete Asana OAuth flow after callback.
 */
export async function completeAsanaOAuthFlow(
    code: string,
    state: string
): Promise<AsanaOAuthCallbackResult> {
    await cleanupOldFlows();

    const [flowRecord] = await db
        .select()
        .from(verification)
        .where(eq(verification.identifier, `${OAUTH_STATE_PREFIX}${state}`))
        .limit(1);

    if (!flowRecord) {
        return {
            success: false,
            error: "Invalid or expired OAuth state. Please reconnect Asana.",
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
        const credentials = await exchangeAsanaCode(code);
        await storeAsanaCredentials(flow.userId, credentials);

        return {
            success: true,
            userId: flow.userId,
            credentials,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Asana OAuth callback failed",
        };
    }
}

// ============================================================================
// Token Exchange
// ============================================================================

/**
 * Exchange authorization code for tokens
 */
export async function exchangeAsanaCode(code: string): Promise<AsanaCredentials> {
    const config = getAsanaOAuthConfig();

    const response = await fetch(ASANA_TOKEN_URL, {
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
        throw new Error(`Asana token exchange failed: ${error}`);
    }

    const data = await response.json();

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
        scope: data.token_type || "bearer",
    };
}

/**
 * Refresh an expired Asana access token
 */
export async function refreshAsanaToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}> {
    const config = getAsanaOAuthConfig();

    const response = await fetch(ASANA_TOKEN_URL, {
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
        throw new Error(`Asana token refresh failed: ${error}`);
    }

    const data = await response.json();

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: Date.now() + (data.expires_in * 1000),
    };
}

// ============================================================================
// Credential Storage
// ============================================================================

/**
 * Store Asana credentials for a user
 */
export async function storeAsanaCredentials(
    userId: string,
    credentials: AsanaCredentials
): Promise<void> {
    const existing = await db
        .select()
        .from(asanaCredentials)
        .where(eq(asanaCredentials.userId, userId))
        .limit(1);

    const data = {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: new Date(credentials.expiresAt),
        workspaceId: credentials.workspaceId,
        scope: credentials.scope,
        updatedAt: new Date(),
    };

    if (existing.length > 0) {
        await db
            .update(asanaCredentials)
            .set(data)
            .where(eq(asanaCredentials.userId, userId));
    } else {
        await db.insert(asanaCredentials).values({
            userId,
            ...data,
        });
    }
}

/**
 * Get stored Asana credentials for a user
 */
async function getStoredAsanaCredentials(userId: string): Promise<AsanaCredentials | null> {
    const [result] = await db
        .select()
        .from(asanaCredentials)
        .where(eq(asanaCredentials.userId, userId))
        .limit(1);

    if (!result) {
        return null;
    }

    return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt.getTime(),
        workspaceId: result.workspaceId || undefined,
        scope: result.scope,
    };
}

/**
 * Get valid Asana credentials, refreshing if needed
 */
export async function getValidAsanaCredentials(userId: string): Promise<AsanaCredentials | null> {
    const credentials = await getStoredAsanaCredentials(userId);

    if (!credentials) {
        return null;
    }

    // Check if token is expired (with 5 minute buffer)
    const isExpired = credentials.expiresAt < Date.now() + 5 * 60 * 1000;

    if (isExpired) {
        try {
            const refreshed = await refreshAsanaToken(credentials.refreshToken);

            const updated: AsanaCredentials = {
                ...credentials,
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken,
                expiresAt: refreshed.expiresAt,
            };

            await storeAsanaCredentials(userId, updated);

            return updated;
        } catch (error) {
            console.error("[Asana OAuth] Failed to refresh token:", error);
            return null;
        }
    }

    return credentials;
}

/**
 * Delete stored Asana credentials for a user
 */
export async function deleteAsanaCredentials(userId: string): Promise<void> {
    await db
        .delete(asanaCredentials)
        .where(eq(asanaCredentials.userId, userId));
}

/**
 * Check if user has valid Asana credentials
 */
export async function hasValidAsanaCredentials(userId: string): Promise<boolean> {
    const credentials = await getValidAsanaCredentials(userId);
    return credentials !== null;
}
