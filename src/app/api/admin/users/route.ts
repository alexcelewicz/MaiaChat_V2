import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, conversations } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import { z } from "zod";

const querySchema = z.object({
    search: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
    offset: z.coerce.number().min(0).default(0),
});

// GET /api/admin/users - List all users
export async function GET(request: Request) {
    try {
        await requireAdmin();

        const { searchParams } = new URL(request.url);
        const queryResult = querySchema.safeParse({
            search: searchParams.get("search") || undefined,
            limit: searchParams.get("limit") || 50,
            offset: searchParams.get("offset") || 0,
        });

        if (!queryResult.success) {
            return NextResponse.json(
                { error: "Invalid query parameters" },
                { status: 400 }
            );
        }

        const { limit, offset } = queryResult.data;

        // Get users with conversation counts
        const allUsers = await db.query.users.findMany({
            orderBy: [desc(users.createdAt)],
            limit,
            offset,
        });

        // Get conversation counts for each user
        const usersWithStats = await Promise.all(
            allUsers.map(async (user) => {
                const convCountResult = await db
                    .select({ count: sql<number>`count(*)` })
                    .from(conversations)
                    .where(eq(conversations.userId, user.id));

                return {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    localAccessEnabled: Boolean(
                        (user.preferences as Record<string, unknown> | null)?.localAccess &&
                        typeof (user.preferences as Record<string, unknown>).localAccess === "object" &&
                        ((user.preferences as Record<string, unknown>).localAccess as Record<string, unknown>).enabled === true
                    ),
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt,
                    conversationCount: Number(convCountResult[0]?.count || 0),
                };
            })
        );

        // Get total count
        const totalResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(users);
        const total = Number(totalResult[0]?.count || 0);

        return NextResponse.json({
            success: true,
            users: usersWithStats,
            pagination: {
                total,
                limit,
                offset,
            },
        });
    } catch (error) {
        console.error("List users error:", error);
        
        if (error instanceof Error && error.message.includes("Admin")) {
            return NextResponse.json(
                { error: "Forbidden" },
                { status: 403 }
            );
        }

        return NextResponse.json(
            { error: "Failed to list users" },
            { status: 500 }
        );
    }
}
