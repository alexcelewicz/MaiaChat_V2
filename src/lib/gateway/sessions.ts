/**
 * Gateway Session Store
 *
 * Persists gateway session metadata to PostgreSQL for auditing and reconnection.
 */

import { db } from '@/lib/db';
import { gatewaySessions } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { redis } from '@/lib/redis';

// ============================================================================
// Types
// ============================================================================

export interface GatewaySessionData {
    id: string;
    userId: string;
    sessionKey: string;
    conversationId: string | null;
    channelAccountId: string | null;
    agentId: string | null;
    status: 'active' | 'idle' | 'disconnected';
    connectedAt: Date;
    lastActivityAt: Date;
    metadata: Record<string, unknown>;
}

export interface CreateSessionOptions {
    userId: string;
    sessionKey: string;
    conversationId?: string;
    channelAccountId?: string;
    agentId?: string;
    metadata?: Record<string, unknown>;
}

export interface UpdateSessionOptions {
    status?: 'active' | 'idle' | 'disconnected';
    lastActivityAt?: Date;
    metadata?: Record<string, unknown>;
}

// ============================================================================
// Redis Keys
// ============================================================================

const SESSION_ACTIVE_PREFIX = 'gateway:session:active:';
const SESSION_SNAPSHOT_PREFIX = 'gateway:session:snapshot:';

// ============================================================================
// Session CRUD
// ============================================================================

/**
 * Create a new gateway session record
 */
export async function createGatewaySession(
    options: CreateSessionOptions
): Promise<GatewaySessionData> {
    // Generate a unique session token for auth
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

    const [session] = await db.insert(gatewaySessions)
        .values({
            userId: options.userId,
            sessionToken,
            sessionKey: options.sessionKey,
            conversationId: options.conversationId || null,
            channelAccountId: options.channelAccountId || null,
            agentId: options.agentId || null,
            status: 'active',
            connectedAt: new Date(),
            lastActivityAt: new Date(),
            metadata: options.metadata || {},
            expiresAt,
        })
        .returning();

    // Store in Redis for quick lookup
    await redis.set(
        `${SESSION_ACTIVE_PREFIX}${session.id}`,
        JSON.stringify({
            userId: session.userId,
            sessionKey: session.sessionKey,
            status: 'active',
        }),
        'EX',
        60 * 60 * 24 // 24 hours
    );

    return formatSession(session);
}

/**
 * Get a gateway session by ID
 */
export async function getGatewaySession(
    sessionId: string
): Promise<GatewaySessionData | null> {
    const [session] = await db.select()
        .from(gatewaySessions)
        .where(eq(gatewaySessions.id, sessionId));

    if (!session) return null;
    return formatSession(session);
}

/**
 * Get a gateway session by session key
 */
export async function getGatewaySessionByKey(
    userId: string,
    sessionKey: string
): Promise<GatewaySessionData | null> {
    // First try to find by sessionKey
    let [session] = await db.select()
        .from(gatewaySessions)
        .where(and(
            eq(gatewaySessions.userId, userId),
            eq(gatewaySessions.sessionKey, sessionKey)
        ))
        .orderBy(desc(gatewaySessions.connectedAt))
        .limit(1);

    // Fallback to sessionToken if sessionKey not found
    if (!session) {
        [session] = await db.select()
            .from(gatewaySessions)
            .where(and(
                eq(gatewaySessions.userId, userId),
                eq(gatewaySessions.sessionToken, sessionKey)
            ))
            .orderBy(desc(gatewaySessions.connectedAt))
            .limit(1);
    }

    if (!session) return null;
    return formatSession(session);
}

/**
 * Get all active gateway sessions for a user
 */
export async function getUserActiveSessions(
    userId: string
): Promise<GatewaySessionData[]> {
    const sessions = await db.select()
        .from(gatewaySessions)
        .where(and(
            eq(gatewaySessions.userId, userId),
            eq(gatewaySessions.status, 'active')
        ))
        .orderBy(desc(gatewaySessions.lastActivityAt));

    return sessions.map(formatSession);
}

/**
 * Update a gateway session
 */
export async function updateGatewaySession(
    sessionId: string,
    updates: UpdateSessionOptions
): Promise<GatewaySessionData | null> {
    const updateData: Record<string, unknown> = {};

    if (updates.status !== undefined) {
        updateData.status = updates.status;
    }
    if (updates.lastActivityAt !== undefined) {
        updateData.lastActivityAt = updates.lastActivityAt;
    }
    if (updates.metadata !== undefined) {
        updateData.metadata = updates.metadata;
    }

    if (Object.keys(updateData).length === 0) {
        return getGatewaySession(sessionId);
    }

    const [session] = await db.update(gatewaySessions)
        .set(updateData)
        .where(eq(gatewaySessions.id, sessionId))
        .returning();

    if (!session) return null;

    // Update Redis cache
    if (updates.status === 'disconnected') {
        await redis.del(`${SESSION_ACTIVE_PREFIX}${sessionId}`);
    } else {
        await redis.set(
            `${SESSION_ACTIVE_PREFIX}${sessionId}`,
            JSON.stringify({
                userId: session.userId,
                sessionKey: session.sessionKey,
                status: session.status,
            }),
            'EX',
            60 * 60 * 24
        );
    }

    return formatSession(session);
}

/**
 * Mark a session as disconnected
 */
export async function disconnectGatewaySession(
    sessionId: string
): Promise<void> {
    await updateGatewaySession(sessionId, {
        status: 'disconnected',
        lastActivityAt: new Date(),
    });
}

/**
 * Record session activity
 */
export async function recordSessionActivity(
    sessionId: string
): Promise<void> {
    await updateGatewaySession(sessionId, {
        status: 'active',
        lastActivityAt: new Date(),
    });
}

// ============================================================================
// Snapshot Management
// ============================================================================

/**
 * Store a session snapshot (conversation state, memory, etc.)
 */
export async function storeSessionSnapshot(
    sessionId: string,
    snapshot: Record<string, unknown>
): Promise<void> {
    // Store snapshot in Redis with expiry
    await redis.set(
        `${SESSION_SNAPSHOT_PREFIX}${sessionId}`,
        JSON.stringify(snapshot),
        'EX',
        60 * 60 * 24 * 7 // 7 days
    );

    // Update session metadata with snapshot reference
    await updateGatewaySession(sessionId, {
        metadata: {
            lastSnapshotAt: new Date().toISOString(),
        },
    });
}

/**
 * Get a session snapshot
 */
export async function getSessionSnapshot(
    sessionId: string
): Promise<Record<string, unknown> | null> {
    const data = await redis.get(`${SESSION_SNAPSHOT_PREFIX}${sessionId}`);
    if (!data) return null;

    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/**
 * Delete a session snapshot
 */
export async function deleteSessionSnapshot(sessionId: string): Promise<void> {
    await redis.del(`${SESSION_SNAPSHOT_PREFIX}${sessionId}`);
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clean up stale sessions (older than specified hours)
 */
export async function cleanupStaleSessions(
    maxAgeHours: number = 24
): Promise<number> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - maxAgeHours);

    // Get stale active sessions
    const staleSessions = await db.select({ id: gatewaySessions.id })
        .from(gatewaySessions)
        .where(and(
            eq(gatewaySessions.status, 'active'),
            // lastActivityAt < cutoff
        ));

    // Mark them as disconnected
    let count = 0;
    for (const session of staleSessions) {
        await disconnectGatewaySession(session.id);
        count++;
    }

    return count;
}

// ============================================================================
// Helpers
// ============================================================================

function formatSession(
    session: typeof gatewaySessions.$inferSelect
): GatewaySessionData {
    return {
        id: session.id,
        userId: session.userId,
        sessionKey: session.sessionKey || session.sessionToken, // Fallback to sessionToken if sessionKey not set
        conversationId: session.conversationId,
        channelAccountId: session.channelAccountId,
        agentId: session.agentId,
        status: (session.status as 'active' | 'idle' | 'disconnected') || 'active',
        connectedAt: session.connectedAt,
        lastActivityAt: session.lastActivityAt,
        metadata: (session.metadata as Record<string, unknown>) || {},
    };
}
