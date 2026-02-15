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

const profileSchema = z.object({
    name: z.string().min(1).max(100),
    agentConfigs: z.array(z.any()).default([]),
    ragConfig: z.object({
        enabled: z.boolean().default(false),
        documentIds: z.array(z.string().uuid()).default([]),
        topK: z.number().min(1).max(20).default(5),
    }).default({ enabled: false, documentIds: [], topK: 5 }),
    orchestrationConfig: z.object({
        mode: z.enum(["single", "sequential", "parallel", "hierarchical", "consensus", "auto"]).default("single"),
        enableDebug: z.boolean().default(false),
    }).default({ mode: "single", enableDebug: false }),
});

// GET /api/profiles - List user's profiles
export async function GET(request: Request) {
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

        const userProfiles = await db.query.profiles.findMany({
            where: eq(profiles.userId, userId),
            orderBy: (profiles, { desc }) => [desc(profiles.updatedAt)],
        });

        return NextResponse.json({
            success: true,
            profiles: userProfiles,
        });
    } catch (error) {
        console.error("List profiles error:", error);
        return NextResponse.json(
            { error: "Failed to list profiles", code: "LIST_FAILED" },
            { status: 500 }
        );
    }
}

// POST /api/profiles - Create a new profile
export async function POST(request: Request) {
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

        const body = await request.json();
        const validation = profileSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: "Invalid profile data", details: validation.error.issues },
                { status: 400 }
            );
        }

        const [newProfile] = await db
            .insert(profiles)
            .values({
                userId,
                name: validation.data.name,
                agentConfigs: validation.data.agentConfigs,
                ragConfig: validation.data.ragConfig,
                orchestrationConfig: validation.data.orchestrationConfig,
            })
            .returning();

        return NextResponse.json({
            success: true,
            profile: newProfile,
        });
    } catch (error) {
        console.error("Create profile error:", error);
        return NextResponse.json(
            { error: "Failed to create profile", code: "CREATE_FAILED" },
            { status: 500 }
        );
    }
}
