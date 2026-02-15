import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import { db } from "@/lib/db";
import { geminiStores, geminiStoreDocuments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { deleteGeminiStore, getGeminiStore } from "@/lib/ai/gemini-stores";

type RouteContext = { params: Promise<{ storeId: string }> };

/**
 * GET /api/gemini/stores/[storeId] — Get store details + documents
 */
export async function GET(req: Request, context: RouteContext) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { storeId } = await context.params;

        const store = await db.query.geminiStores.findFirst({
            where: and(
                eq(geminiStores.id, storeId),
                eq(geminiStores.userId, userId)
            ),
            with: {
                storeDocuments: {
                    with: {
                        document: true,
                    },
                },
            },
        });

        if (!store) {
            return NextResponse.json({ error: "Store not found" }, { status: 404 });
        }

        return NextResponse.json({ store });
    } catch (error) {
        console.error("GET /api/gemini/stores/[storeId] error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * PATCH /api/gemini/stores/[storeId] — Update local metadata
 * Body: { displayName?, description?, color? }
 */
export async function PATCH(req: Request, context: RouteContext) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { storeId } = await context.params;
        const body = await req.json();
        const { displayName, description, color } = body;

        // Verify ownership
        const store = await db.query.geminiStores.findFirst({
            where: and(
                eq(geminiStores.id, storeId),
                eq(geminiStores.userId, userId)
            ),
        });

        if (!store) {
            return NextResponse.json({ error: "Store not found" }, { status: 404 });
        }

        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (displayName !== undefined) updates.displayName = displayName;
        if (description !== undefined) updates.description = description;
        if (color !== undefined) updates.color = color;

        const [updated] = await db
            .update(geminiStores)
            .set(updates)
            .where(eq(geminiStores.id, storeId))
            .returning();

        return NextResponse.json({ store: updated });
    } catch (error) {
        console.error("PATCH /api/gemini/stores/[storeId] error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * DELETE /api/gemini/stores/[storeId] — Delete store from Gemini + DB
 */
export async function DELETE(req: Request, context: RouteContext) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { storeId } = await context.params;

        // Verify ownership
        const store = await db.query.geminiStores.findFirst({
            where: and(
                eq(geminiStores.id, storeId),
                eq(geminiStores.userId, userId)
            ),
        });

        if (!store) {
            return NextResponse.json({ error: "Store not found" }, { status: 404 });
        }

        // Delete from Gemini API
        const apiKeys = await getUserApiKeys(userId);
        const googleKey = apiKeys.google;
        if (googleKey) {
            try {
                await deleteGeminiStore(store.geminiStoreName, googleKey);
            } catch (err) {
                console.error("Gemini API delete failed (continuing DB cleanup):", err);
            }
        }

        // Cascade: delete junction records, then the store
        await db.delete(geminiStoreDocuments).where(eq(geminiStoreDocuments.storeId, storeId));
        await db.delete(geminiStores).where(eq(geminiStores.id, storeId));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("DELETE /api/gemini/stores/[storeId] error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
