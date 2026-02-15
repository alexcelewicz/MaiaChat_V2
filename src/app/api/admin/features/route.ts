import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { featureFlags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import { z } from "zod";

const createFeatureSchema = z.object({
    key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Key must be lowercase alphanumeric with underscores"),
    isEnabled: z.boolean().default(false),
    rules: z.record(z.string(), z.unknown()).optional(),
});

const updateFeatureSchema = z.object({
    isEnabled: z.boolean().optional(),
    rules: z.record(z.string(), z.unknown()).optional(),
});

// GET /api/admin/features - List all feature flags
export async function GET() {
    try {
        await requireAdmin();

        const flags = await db.query.featureFlags.findMany({
            orderBy: (featureFlags, { asc }) => [asc(featureFlags.key)],
        });

        return NextResponse.json({
            success: true,
            features: flags,
        });
    } catch (error) {
        console.error("List features error:", error);

        if (error instanceof Error && error.message.includes("Admin")) {
            return NextResponse.json(
                { error: "Forbidden" },
                { status: 403 }
            );
        }

        return NextResponse.json(
            { error: "Failed to list features" },
            { status: 500 }
        );
    }
}

// POST /api/admin/features - Create a feature flag
export async function POST(request: Request) {
    try {
        await requireAdmin();

        const body = await request.json();
        const validation = createFeatureSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: "Invalid request", details: validation.error.issues },
                { status: 400 }
            );
        }

        const { key, isEnabled, rules } = validation.data;

        // Check if key already exists
        const existing = await db.query.featureFlags.findFirst({
            where: eq(featureFlags.key, key),
        });

        if (existing) {
            return NextResponse.json(
                { error: "Feature flag key already exists" },
                { status: 400 }
            );
        }

        const [newFlag] = await db
            .insert(featureFlags)
            .values({
                key,
                isEnabled,
                rules: rules || {},
            })
            .returning();

        return NextResponse.json({
            success: true,
            feature: newFlag,
        });
    } catch (error) {
        console.error("Create feature error:", error);

        if (error instanceof Error && error.message.includes("Admin")) {
            return NextResponse.json(
                { error: "Forbidden" },
                { status: 403 }
            );
        }

        return NextResponse.json(
            { error: "Failed to create feature" },
            { status: 500 }
        );
    }
}

// PATCH /api/admin/features - Update a feature flag by key
export async function PATCH(request: Request) {
    try {
        await requireAdmin();

        const body = await request.json();
        const { key, ...updates } = body;

        if (!key) {
            return NextResponse.json(
                { error: "Feature key is required" },
                { status: 400 }
            );
        }

        const validation = updateFeatureSchema.safeParse(updates);

        if (!validation.success) {
            return NextResponse.json(
                { error: "Invalid request", details: validation.error.issues },
                { status: 400 }
            );
        }

        const existing = await db.query.featureFlags.findFirst({
            where: eq(featureFlags.key, key),
        });

        if (!existing) {
            return NextResponse.json(
                { error: "Feature flag not found" },
                { status: 404 }
            );
        }

        const updateData: Record<string, unknown> = {
            updatedAt: new Date(),
        };

        if (validation.data.isEnabled !== undefined) {
            updateData.isEnabled = validation.data.isEnabled;
        }
        if (validation.data.rules !== undefined) {
            updateData.rules = validation.data.rules;
        }

        const [updated] = await db
            .update(featureFlags)
            .set(updateData)
            .where(eq(featureFlags.key, key))
            .returning();

        return NextResponse.json({
            success: true,
            feature: updated,
        });
    } catch (error) {
        console.error("Update feature error:", error);

        if (error instanceof Error && error.message.includes("Admin")) {
            return NextResponse.json(
                { error: "Forbidden" },
                { status: 403 }
            );
        }

        return NextResponse.json(
            { error: "Failed to update feature" },
            { status: 500 }
        );
    }
}

// DELETE /api/admin/features - Delete a feature flag by key
export async function DELETE(request: Request) {
    try {
        await requireAdmin();

        const { searchParams } = new URL(request.url);
        const key = searchParams.get("key");

        if (!key) {
            return NextResponse.json(
                { error: "Feature key is required" },
                { status: 400 }
            );
        }

        const existing = await db.query.featureFlags.findFirst({
            where: eq(featureFlags.key, key),
        });

        if (!existing) {
            return NextResponse.json(
                { error: "Feature flag not found" },
                { status: 404 }
            );
        }

        await db.delete(featureFlags).where(eq(featureFlags.key, key));

        return NextResponse.json({
            success: true,
            message: "Feature flag deleted",
        });
    } catch (error) {
        console.error("Delete feature error:", error);

        if (error instanceof Error && error.message.includes("Admin")) {
            return NextResponse.json(
                { error: "Forbidden" },
                { status: 403 }
            );
        }

        return NextResponse.json(
            { error: "Failed to delete feature" },
            { status: 500 }
        );
    }
}
