import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, setUserAsAdmin, removeAdminRole } from "@/lib/auth/admin";
import { z } from "zod";

const updateSchema = z.object({
    action: z.enum([
        "promote",
        "demote",
        "suspend",
        "activate",
        "grant_local_access",
        "revoke_local_access",
    ]),
});

function withLocalAccessPreference(preferences: unknown, enabled: boolean): Record<string, unknown> {
    const nextPrefs: Record<string, unknown> =
        preferences && typeof preferences === "object"
            ? { ...(preferences as Record<string, unknown>) }
            : {};
    const currentLocal =
        nextPrefs.localAccess && typeof nextPrefs.localAccess === "object"
            ? { ...(nextPrefs.localAccess as Record<string, unknown>) }
            : {};
    nextPrefs.localAccess = {
        ...currentLocal,
        enabled,
        updatedAt: new Date().toISOString(),
    };
    return nextPrefs;
}

// PATCH /api/admin/users/[id] - Update user
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const adminId = await requireAdmin();
        const { id } = await params;

        const body = await request.json();
        const validation = updateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: "Invalid request", details: validation.error.issues },
                { status: 400 }
            );
        }

        const { action } = validation.data;

        // Prevent self-modification of admin status
        if (id === adminId && (action === "promote" || action === "demote")) {
            return NextResponse.json(
                { error: "Cannot modify your own admin status" },
                { status: 400 }
            );
        }

        // Verify user exists
        const user = await db.query.users.findFirst({
            where: eq(users.id, id),
        });

        if (!user) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 }
            );
        }

        switch (action) {
            case "promote":
                await setUserAsAdmin(id);
                break;
            case "demote":
                await removeAdminRole(id);
                break;
            case "suspend":
                // Implement suspension logic if needed
                break;
            case "activate":
                // Implement activation logic if needed
                break;
            case "grant_local_access":
                await db
                    .update(users)
                    .set({
                        preferences: withLocalAccessPreference(user.preferences, true),
                        updatedAt: new Date(),
                    })
                    .where(eq(users.id, id));
                break;
            case "revoke_local_access":
                await db
                    .update(users)
                    .set({
                        preferences: withLocalAccessPreference(user.preferences, false),
                        updatedAt: new Date(),
                    })
                    .where(eq(users.id, id));
                break;
        }

        const actionMessage: Record<typeof action, string> = {
            promote: "User promoted successfully",
            demote: "User demoted successfully",
            suspend: "User suspended successfully",
            activate: "User activated successfully",
            grant_local_access: "Local access granted",
            revoke_local_access: "Local access revoked",
        };

        return NextResponse.json({
            success: true,
            message: actionMessage[action],
        });
    } catch (error) {
        console.error("Update user error:", error);

        if (error instanceof Error && error.message.includes("Admin")) {
            return NextResponse.json(
                { error: "Forbidden" },
                { status: 403 }
            );
        }

        return NextResponse.json(
            { error: "Failed to update user" },
            { status: 500 }
        );
    }
}

// GET /api/admin/users/[id] - Get user details
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireAdmin();
        const { id } = await params;

        const user = await db.query.users.findFirst({
            where: eq(users.id, id),
        });

        if (!user) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                preferences: user.preferences,
                localAccessEnabled: Boolean(
                    (user.preferences as Record<string, unknown> | null)?.localAccess &&
                    typeof (user.preferences as Record<string, unknown>).localAccess === "object" &&
                    ((user.preferences as Record<string, unknown>).localAccess as Record<string, unknown>).enabled === true
                ),
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            },
        });
    } catch (error) {
        console.error("Get user error:", error);

        if (error instanceof Error && error.message.includes("Admin")) {
            return NextResponse.json(
                { error: "Forbidden" },
                { status: 403 }
            );
        }

        return NextResponse.json(
            { error: "Failed to get user" },
            { status: 500 }
        );
    }
}
