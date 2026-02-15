/**
 * Gateway Token Service
 *
 * Generates and validates JWT-like tokens for gateway authentication.
 * Uses HMAC-SHA256 for signing.
 */

import { createHmac, randomBytes } from 'crypto';
import { redis } from '@/lib/redis';

// ============================================================================
// Configuration
// ============================================================================

const GATEWAY_TOKEN_PREFIX = 'gateway:token:';
const GATEWAY_TOKEN_EXPIRY_SECONDS = 60 * 60 * 4; // 4 hours

// Get secret from environment or generate one (in production, use env var)
const getGatewaySecret = (): string => {
    const secret = process.env.GATEWAY_TOKEN_SECRET;
    if (!secret) {
        console.warn('[Gateway] GATEWAY_TOKEN_SECRET not set, using fallback (not safe for production)');
        return 'gateway-development-secret-change-in-production';
    }
    return secret;
};

// ============================================================================
// Types
// ============================================================================

export interface GatewayTokenPayload {
    sub: string;         // User ID
    tid: string;         // Tenant ID (same as user ID for MaiaChat)
    jti: string;         // Token ID for revocation
    iat: number;         // Issued at timestamp
    exp: number;         // Expiration timestamp
    scopes: string[];    // Allowed scopes
    cid?: string;        // Conversation ID (optional)
    cha?: string;        // Channel type (optional)
    chi?: string;        // Channel ID (optional)
}

export interface GatewayTokenResult {
    token: string;
    expiresAt: number;
    tokenId: string;
}

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generate a gateway authentication token
 */
export async function generateGatewayToken(
    userId: string,
    options: {
        conversationId?: string;
        channelType?: string;
        channelId?: string;
        scopes?: string[];
        expiresInSeconds?: number;
    } = {}
): Promise<GatewayTokenResult> {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = options.expiresInSeconds || GATEWAY_TOKEN_EXPIRY_SECONDS;
    const tokenId = randomBytes(16).toString('hex');

    const payload: GatewayTokenPayload = {
        sub: userId,
        tid: userId, // Tenant ID is user ID in MaiaChat
        jti: tokenId,
        iat: now,
        exp: now + expiresIn,
        scopes: options.scopes || ['chat', 'channels', 'sessions'],
        cid: options.conversationId,
        cha: options.channelType,
        chi: options.channelId,
    };

    // Encode payload
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
    const signature = sign(`${header}.${payloadEncoded}`);
    const token = `${header}.${payloadEncoded}.${signature}`;

    // Store token ID in Redis for revocation checking
    await redis.set(
        `${GATEWAY_TOKEN_PREFIX}${tokenId}`,
        userId,
        'EX',
        expiresIn
    );

    return {
        token,
        expiresAt: (now + expiresIn) * 1000,
        tokenId,
    };
}

/**
 * Verify a gateway token
 */
export async function verifyGatewayToken(
    token: string
): Promise<{ valid: true; payload: GatewayTokenPayload } | { valid: false; error: string }> {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return { valid: false, error: 'Invalid token format' };
        }

        const [header, payloadEncoded, providedSignature] = parts;

        // Verify signature
        const expectedSignature = sign(`${header}.${payloadEncoded}`);
        if (providedSignature !== expectedSignature) {
            return { valid: false, error: 'Invalid signature' };
        }

        // Decode payload
        const payload = JSON.parse(base64UrlDecode(payloadEncoded)) as GatewayTokenPayload;

        // Check expiration
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
            return { valid: false, error: 'Token expired' };
        }

        // Check if revoked
        const stored = await redis.get(`${GATEWAY_TOKEN_PREFIX}${payload.jti}`);
        if (!stored) {
            return { valid: false, error: 'Token revoked or invalid' };
        }

        return { valid: true, payload };
    } catch (error) {
        return { valid: false, error: 'Token verification failed' };
    }
}

/**
 * Revoke a gateway token
 */
export async function revokeGatewayToken(tokenId: string): Promise<boolean> {
    const result = await redis.del(`${GATEWAY_TOKEN_PREFIX}${tokenId}`);
    return result > 0;
}

/**
 * Revoke all gateway tokens for a user
 */
export async function revokeAllGatewayTokens(userId: string): Promise<number> {
    // Scan for all tokens belonging to this user
    // Note: In production, consider using a Redis set to track user tokens
    let cursor = '0';
    let count = 0;

    do {
        const [nextCursor, keys] = await redis.scan(
            cursor,
            'MATCH',
            `${GATEWAY_TOKEN_PREFIX}*`,
            'COUNT',
            100
        );
        cursor = nextCursor;

        for (const key of keys) {
            const storedUserId = await redis.get(key);
            if (storedUserId === userId) {
                await redis.del(key);
                count++;
            }
        }
    } while (cursor !== '0');

    return count;
}

// ============================================================================
// Helpers
// ============================================================================

function base64UrlEncode(str: string): string {
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function base64UrlDecode(str: string): string {
    // Add padding if needed
    const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
    return Buffer.from(
        padded.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
    ).toString();
}

function sign(data: string): string {
    const hmac = createHmac('sha256', getGatewaySecret());
    hmac.update(data);
    return hmac.digest('base64url');
}
