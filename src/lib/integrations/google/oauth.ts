/**
 * Google OAuth with PKCE
 *
 * Implements secure OAuth 2.0 authentication using PKCE (Proof Key for Code Exchange)
 * for Google services (Gmail, Calendar, etc.)
 *
 * Based on patterns from Clawdbot's google-gemini-cli-auth extension.
 */

import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { googleCredentials, verification } from "@/lib/db/schema";
import { and, eq, lt, like } from "drizzle-orm";

// ============================================================================
// Configuration
// ============================================================================

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo?alt=json";

// Default OAuth scopes for Gmail, Calendar, and Drive
const DEFAULT_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
];

// ============================================================================
// Types
// ============================================================================

export interface GoogleOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes?: string[];
}

export interface GoogleCredentials {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    email?: string;
    scope: string;
}

export interface PKCEChallenge {
    verifier: string;
    challenge: string;
    state: string;
}

export interface OAuthCallbackResult {
    success: boolean;
    credentials?: GoogleCredentials;
    error?: string;
}

// ============================================================================
// PKCE Generation
// ============================================================================

/**
 * Generate PKCE verifier and challenge for secure OAuth flow
 */
export function generatePKCE(): PKCEChallenge {
    // Generate random verifier (43-128 characters, URL-safe)
    const verifier = randomBytes(32).toString("base64url");

    // Generate challenge using SHA-256 hash of verifier
    const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");

    // Generate random state for CSRF protection
    const state = randomBytes(16).toString("hex");

    return { verifier, challenge, state };
}

// ============================================================================
// OAuth URL Building
// ============================================================================

/**
 * Get OAuth configuration from environment
 */
export function getOAuthConfig(): GoogleOAuthConfig {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error(
            "Missing Google OAuth credentials. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET."
        );
    }

    // Build redirect URI based on environment
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${baseUrl}/api/integrations/google/callback`;

    return {
        clientId,
        clientSecret,
        redirectUri,
        scopes: DEFAULT_SCOPES,
    };
}

/**
 * Build the Google OAuth authorization URL
 */
export function buildAuthUrl(pkce: PKCEChallenge, scopes?: string[]): string {
    const config = getOAuthConfig();
    const finalScopes = scopes || config.scopes || DEFAULT_SCOPES;

    const params = new URLSearchParams({
        client_id: config.clientId,
        response_type: "code",
        redirect_uri: config.redirectUri,
        scope: finalScopes.join(" "),
        code_challenge: pkce.challenge,
        code_challenge_method: "S256",
        state: pkce.state,
        access_type: "offline",
        prompt: "consent", // Force consent to always get refresh token
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// ============================================================================
// Token Exchange
// ============================================================================

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
    code: string,
    verifier: string
): Promise<GoogleCredentials> {
    const config = getOAuthConfig();

    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            code_verifier: verifier,
            grant_type: "authorization_code",
            redirect_uri: config.redirectUri,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();

    // Calculate expiration time
    const expiresAt = Date.now() + (data.expires_in * 1000);

    // Fetch user email
    const email = await fetchUserEmail(data.access_token);

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
        email,
        scope: data.scope,
    };
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresAt: number;
}> {
    const config = getOAuthConfig();

    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token refresh failed: ${error}`);
    }

    const data = await response.json();

    return {
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
    };
}

/**
 * Fetch user email from Google
 */
async function fetchUserEmail(accessToken: string): Promise<string | undefined> {
    try {
        const response = await fetch(GOOGLE_USERINFO_URL, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (response.ok) {
            const data = await response.json();
            return data.email;
        }
    } catch (error) {
        console.error("[Google OAuth] Failed to fetch user email:", error);
    }
    return undefined;
}

// ============================================================================
// Credential Storage
// ============================================================================

/**
 * Store Google credentials for a user
 */
export async function storeCredentials(
    userId: string,
    credentials: GoogleCredentials
): Promise<void> {
    const existing = await db
        .select()
        .from(googleCredentials)
        .where(eq(googleCredentials.userId, userId))
        .limit(1);

    const data = {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: new Date(credentials.expiresAt),
        email: credentials.email,
        scope: credentials.scope,
        updatedAt: new Date(),
    };

    if (existing.length > 0) {
        await db
            .update(googleCredentials)
            .set(data)
            .where(eq(googleCredentials.userId, userId));
    } else {
        await db.insert(googleCredentials).values({
            userId,
            ...data,
        });
    }
}

/**
 * Get stored credentials for a user
 */
export async function getStoredCredentials(userId: string): Promise<GoogleCredentials | null> {
    const [result] = await db
        .select()
        .from(googleCredentials)
        .where(eq(googleCredentials.userId, userId))
        .limit(1);

    if (!result) {
        return null;
    }

    return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt.getTime(),
        email: result.email || undefined,
        scope: result.scope,
    };
}

/**
 * Get valid credentials, refreshing if needed
 */
export async function getValidCredentials(userId: string): Promise<GoogleCredentials | null> {
    const credentials = await getStoredCredentials(userId);

    if (!credentials) {
        return null;
    }

    // Check if token is expired (with 5 minute buffer)
    const isExpired = credentials.expiresAt < Date.now() + 5 * 60 * 1000;

    if (isExpired) {
        try {
            const refreshed = await refreshAccessToken(credentials.refreshToken);

            // Update stored credentials
            const updated: GoogleCredentials = {
                ...credentials,
                accessToken: refreshed.accessToken,
                expiresAt: refreshed.expiresAt,
            };

            await storeCredentials(userId, updated);

            return updated;
        } catch (error) {
            console.error("[Google OAuth] Failed to refresh token:", error);
            // Token refresh failed, user needs to re-authenticate
            return null;
        }
    }

    return credentials;
}

/**
 * Delete stored credentials for a user
 */
export async function deleteCredentials(userId: string): Promise<void> {
    await db
        .delete(googleCredentials)
        .where(eq(googleCredentials.userId, userId));
}

/**
 * Check if user has valid Google credentials
 */
export async function hasValidCredentials(userId: string): Promise<boolean> {
    const credentials = await getValidCredentials(userId);
    return credentials !== null;
}

// ============================================================================
// OAuth State Management
// ============================================================================

const OAUTH_FLOW_TIMEOUT = 10 * 60 * 1000;
const OAUTH_STATE_PREFIX = "google_oauth:";

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
 * Initiate OAuth flow for a user
 * Returns the authorization URL to redirect to
 */
export async function initiateOAuthFlow(userId: string, scopes?: string[]): Promise<{
    authUrl: string;
    state: string;
}> {
    await cleanupOldFlows();

    const pkce = generatePKCE();
    const authUrl = buildAuthUrl(pkce, scopes);

    // Store the flow for callback verification
    await db.insert(verification).values({
        id: pkce.state,
        identifier: `${OAUTH_STATE_PREFIX}${pkce.state}`,
        value: JSON.stringify({ verifier: pkce.verifier, userId }),
        expiresAt: new Date(Date.now() + OAUTH_FLOW_TIMEOUT),
    });

    return { authUrl, state: pkce.state };
}

/**
 * Complete OAuth flow after callback
 */
export async function completeOAuthFlow(
    code: string,
    state: string
): Promise<OAuthCallbackResult> {
    await cleanupOldFlows();

    const [flowRecord] = await db
        .select()
        .from(verification)
        .where(eq(verification.identifier, `${OAUTH_STATE_PREFIX}${state}`))
        .limit(1);

    if (!flowRecord) {
        return {
            success: false,
            error: "Invalid or expired OAuth state. Please try again.",
        };
    }

    let flow: { verifier: string; userId: string } | null = null;
    try {
        flow = JSON.parse(flowRecord.value) as { verifier: string; userId: string };
    } catch {
        return {
            success: false,
            error: "Invalid OAuth state payload. Please try again.",
        };
    }

    if (!flow?.verifier || !flow?.userId) {
        return {
            success: false,
            error: "Invalid OAuth state payload. Please try again.",
        };
    }

    // Remove the pending flow
    await db.delete(verification).where(eq(verification.id, flowRecord.id));

    try {
        // Exchange code for tokens
        const credentials = await exchangeCodeForTokens(code, flow.verifier);

        // Store credentials
        await storeCredentials(flow.userId, credentials);

        return {
            success: true,
            credentials,
        };
    } catch (error) {
        console.error("[Google OAuth] Failed to complete flow:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "OAuth flow failed",
        };
    }
}
