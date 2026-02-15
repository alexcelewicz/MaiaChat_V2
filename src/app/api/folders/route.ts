import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { folders } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { createFolderSchema, updateFolderSchema, parseRequestBody } from "@/types/api";

// GET /api/folders - List all folders for current user
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

        const userFolders = await db.query.folders.findMany({
            where: eq(folders.userId, userId),
            orderBy: (folders, { asc }) => [asc(folders.name)],
        });

        return NextResponse.json({
            success: true,
            folders: userFolders,
        });
    } catch (error) {
        console.error("Fetch folders error:", error);
        // Return empty array instead of error for better UX
        return NextResponse.json({
            success: true,
            folders: [],
        });
    }
}

// POST /api/folders - Create a new folder
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

        const { data, error } = await parseRequestBody(request, createFolderSchema);
        if (error) {
            return NextResponse.json(error, { status: 400 });
        }

        const [newFolder] = await db
            .insert(folders)
            .values({
                userId,
                name: data.name,
                color: data.color || "#6366f1",
            })
            .returning();

        return NextResponse.json({
            success: true,
            folder: newFolder,
        }, { status: 201 });
    } catch (error) {
        console.error("Create folder error:", error);
        return NextResponse.json(
            { error: "Failed to create folder", code: "CREATE_FAILED" },
            { status: 500 }
        );
    }
}

// PATCH /api/folders?id=xxx - Update a folder
export async function PATCH(request: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const folderId = searchParams.get("id");
        
        if (!folderId) {
            return NextResponse.json(
                { error: "Folder ID required", code: "MISSING_ID" },
                { status: 400 }
            );
        }

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", RATE_LIMITS.api);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.api);
        }

        // Verify ownership
        const existing = await db.query.folders.findFirst({
            where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
            columns: { id: true },
        });

        if (!existing) {
            return NextResponse.json(
                { error: "Folder not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        const { data, error } = await parseRequestBody(request, updateFolderSchema);
        if (error) {
            return NextResponse.json(error, { status: 400 });
        }

        const updateData: Record<string, unknown> = {
            updatedAt: new Date(),
        };

        if (data.name !== undefined) updateData.name = data.name;
        if (data.color !== undefined) updateData.color = data.color;

        const [updated] = await db
            .update(folders)
            .set(updateData)
            .where(eq(folders.id, folderId))
            .returning();

        return NextResponse.json({
            success: true,
            folder: updated,
        });
    } catch (error) {
        console.error("Update folder error:", error);
        return NextResponse.json(
            { error: "Failed to update folder", code: "UPDATE_FAILED" },
            { status: 500 }
        );
    }
}

// DELETE /api/folders?id=xxx - Delete a folder
export async function DELETE(request: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const folderId = searchParams.get("id");
        
        if (!folderId) {
            return NextResponse.json(
                { error: "Folder ID required", code: "MISSING_ID" },
                { status: 400 }
            );
        }

        const rateLimitId = getRateLimitIdentifier(request, userId);
        const rateLimitResult = await checkRateLimit(rateLimitId, "api", RATE_LIMITS.api);

        if (!rateLimitResult.success) {
            return rateLimitExceededResponse(rateLimitResult, RATE_LIMITS.api);
        }

        // Verify ownership
        const existing = await db.query.folders.findFirst({
            where: and(eq(folders.id, folderId), eq(folders.userId, userId)),
            columns: { id: true },
        });

        if (!existing) {
            return NextResponse.json(
                { error: "Folder not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        await db.delete(folders).where(eq(folders.id, folderId));

        return NextResponse.json({
            success: true,
            deleted: folderId,
        });
    } catch (error) {
        console.error("Delete folder error:", error);
        return NextResponse.json(
            { error: "Failed to delete folder", code: "DELETE_FAILED" },
            { status: 500 }
        );
    }
}
