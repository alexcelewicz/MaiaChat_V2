import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { z } from "zod";

const updateProfileSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    agentConfigs: z.array(z.any()).optional(),
    ragConfig: z.object({
        enabled: z.boolean(),
        documentIds: z.array(z.string().uuid()),
        topK: z.number().min(1).max(20),
    }).optional(),
    orchestrationConfig: z.object({
        mode: z.enum(["single", "sequential", "parallel", "hierarchical", "consensus", "auto"]),
        enableDebug: z.boolean(),
    }).optional(),
});

// GET /api/profiles/[id] - Get a single profile
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", RATE_LIMITS.api);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.api);
        }

        const { id } = await params;

        const profile = await db.query.profiles.findFirst({
            where: and(
                eq(profiles.id, id),
                eq(profiles.userId, userId)
            ),
        });

        if (!profile) {
            return NextResponse.json(
                { error: "Profile not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            profile,
        });
    } catch (error) {
        console.error("Get profile error:", error);
        return NextResponse.json(
            { error: "Failed to get profile", code: "GET_FAILED" },
            { status: 500 }
        );
    }
}

// PATCH /api/profiles/[id] - Update a profile
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", RATE_LIMITS.api);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.api);
        }

        const { id } = await params;

        // Verify ownership
        const existingProfile = await db.query.profiles.findFirst({
            where: and(
                eq(profiles.id, id),
                eq(profiles.userId, userId)
            ),
        });

        if (!existingProfile) {
            return NextResponse.json(
                { error: "Profile not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        const body = await request.json();
        const validation = updateProfileSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: "Invalid profile data", details: validation.error.issues },
                { status: 400 }
            );
        }

        const updateData: Record<string, unknown> = {
            updatedAt: new Date(),
        };

        if (validation.data.name !== undefined) {
            updateData.name = validation.data.name;
        }
        if (validation.data.agentConfigs !== undefined) {
            updateData.agentConfigs = validation.data.agentConfigs;
        }
        if (validation.data.ragConfig !== undefined) {
            updateData.ragConfig = validation.data.ragConfig;
        }
        if (validation.data.orchestrationConfig !== undefined) {
            updateData.orchestrationConfig = validation.data.orchestrationConfig;
        }

        const [updatedProfile] = await db
            .update(profiles)
            .set(updateData)
            .where(eq(profiles.id, id))
            .returning();

        return NextResponse.json({
            success: true,
            profile: updatedProfile,
        });
    } catch (error) {
        console.error("Update profile error:", error);
        return NextResponse.json(
            { error: "Failed to update profile", code: "UPDATE_FAILED" },
            { status: 500 }
        );
    }
}

// DELETE /api/profiles/[id] - Delete a profile
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", RATE_LIMITS.api);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.api);
        }

        const { id } = await params;

        // Verify ownership
        const existingProfile = await db.query.profiles.findFirst({
            where: and(
                eq(profiles.id, id),
                eq(profiles.userId, userId)
            ),
        });

        if (!existingProfile) {
            return NextResponse.json(
                { error: "Profile not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        await db.delete(profiles).where(eq(profiles.id, id));

        return NextResponse.json({
            success: true,
            message: "Profile deleted",
        });
    } catch (error) {
        console.error("Delete profile error:", error);
        return NextResponse.json(
            { error: "Failed to delete profile", code: "DELETE_FAILED" },
            { status: 500 }
        );
    }
}
