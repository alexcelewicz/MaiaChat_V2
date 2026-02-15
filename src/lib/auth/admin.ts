import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser, getSessionUserId } from "./session";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

function isAdminEmail(email: string): boolean {
    const normalized = email.trim().toLowerCase();
    return ADMIN_EMAILS.includes(normalized);
}

/**
 * Check if the current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
    const currentUser = await getCurrentUser();
    if (!currentUser) return false;

    if (ADMIN_EMAILS.length > 0 && isAdminEmail(currentUser.email)) {
        return true;
    }

    return currentUser.role === "admin";
}

/**
 * Check if a specific user is an admin
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { role: true },
    });

    return user?.role === "admin";
}

/**
 * Get admin user or throw
 */
export async function requireAdmin(): Promise<string> {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error("Unauthorized");
    }

    if (ADMIN_EMAILS.length > 0 && isAdminEmail(currentUser.email)) {
        return currentUser.id;
    }

    if (currentUser.role !== "admin") {
        throw new Error("Forbidden: Admin access required");
    }

    return currentUser.id;
}

/**
 * Set user as admin (should be called from secure context)
 */
export async function setUserAsAdmin(userId: string): Promise<void> {
    await db
        .update(users)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(users.id, userId));
}

/**
 * Remove admin role from user
 */
export async function removeAdminRole(userId: string): Promise<void> {
    await db
        .update(users)
        .set({ role: "user", updatedAt: new Date() })
        .where(eq(users.id, userId));
}
