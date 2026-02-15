import { headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

/**
 * =============================================================================
 * DEV MODE AUTH BYPASS
 * =============================================================================
 * When DEV_BYPASS_AUTH=true is set in .env.local (development only),
 * this mock user is returned instead of requiring authentication.
 *
 * To disable: Remove the DEV_BYPASS_AUTH line from .env.local
 * =============================================================================
 */
const isDevBypassEnabled =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_BYPASS_AUTH === "true";

const DEV_MOCK_USER: SessionUser = {
    id: "00000000-0000-0000-0000-000000000001",
    email: "dev@localhost.test",
    role: "user",
    preferences: { name: "Dev User" },
};

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

function isAdminEmail(email: string): boolean {
    const normalized = email.trim().toLowerCase();
    return ADMIN_EMAILS.includes(normalized);
}

function getDevMockUser(): SessionUser {
    if (isAdminEmail(DEV_MOCK_USER.email)) {
        return { ...DEV_MOCK_USER, role: "admin" };
    }
    return DEV_MOCK_USER;
}

export interface SessionUser {
    id: string;
    email: string;
    role: string;
    preferences: Record<string, unknown>;
}

export interface AuthResult {
    success: true;
    user: SessionUser;
}

export interface AuthError {
    success: false;
    error: string;
    status: number;
}

/**
 * Get current user from Better Auth session
 * Returns mock user in dev bypass mode
 * Wrapped with React.cache for request deduplication
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
    // DEV MODE: Return mock user when bypass is enabled
    if (isDevBypassEnabled) {
        const devUser = getDevMockUser();
        const existing = await db.query.users.findFirst({
            where: eq(users.id, devUser.id),
        });

        if (!existing) {
            const [created] = await db
                .insert(users)
                .values({
                    id: devUser.id,
                    email: devUser.email,
                    name: (devUser.preferences.name as string) || "Dev User",
                    role: devUser.role,
                    preferences: devUser.preferences,
                })
                .returning();

            return {
                id: created.id,
                email: created.email,
                role: created.role,
                preferences: created.preferences as Record<string, unknown>,
            };
        }

        if (devUser.role === "admin" && existing.role !== "admin") {
            await db
                .update(users)
                .set({ role: "admin", updatedAt: new Date() })
                .where(eq(users.id, existing.id));
        }

        return {
            id: existing.id,
            email: existing.email,
            role: devUser.role === "admin" ? "admin" : existing.role,
            preferences: existing.preferences as Record<string, unknown>,
        };
    }

    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user) {
            return null;
        }

        const betterAuthUser = session.user;

        // Look up the full user record for preferences and role
        const dbUser = await db.query.users.findFirst({
            where: eq(users.id, betterAuthUser.id),
        });

        if (!dbUser) {
            return null;
        }

        // Auto-promote admins based on email
        if (isAdminEmail(dbUser.email) && dbUser.role !== "admin") {
            const [updatedUser] = await db
                .update(users)
                .set({ role: "admin", updatedAt: new Date() })
                .where(eq(users.id, dbUser.id))
                .returning();
            return {
                id: updatedUser.id,
                email: updatedUser.email,
                role: updatedUser.role,
                preferences: updatedUser.preferences as Record<string, unknown>,
            };
        }

        return {
            id: dbUser.id,
            email: dbUser.email,
            role: dbUser.role,
            preferences: dbUser.preferences as Record<string, unknown>,
        };
    } catch {
        return null;
    }
});

/**
 * Get user ID from session (lightweight check)
 * Returns mock user ID in dev bypass mode
 * Wrapped with React.cache for request deduplication
 */
export const getSessionUserId = cache(async (): Promise<string | null> => {
    // DEV MODE: Return mock user ID when bypass is enabled
    if (isDevBypassEnabled) {
        const user = await getCurrentUser();
        return user?.id ?? DEV_MOCK_USER.id;
    }

    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        return session?.user?.id ?? null;
    } catch {
        return null;
    }
});

/**
 * Helper to match NextAuth-like session structure used in API routes
 */
export async function getServerSession() {
    const user = await getCurrentUser();
    if (!user) return null;
    return { user };
}
