import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { getUserApiKeys } from "@/lib/ai/get-user-keys";
import { db } from "@/lib/db";
import { geminiStores, geminiStoreDocuments } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import {
    createGeminiStore,
    listGeminiStores as listGeminiStoresApi,
} from "@/lib/ai/gemini-stores";
import { checkRateLimit, RATE_LIMITS, getRateLimitIdentifier, rateLimitExceededResponse } from "@/lib/rate-limit";

/**
 * GET /api/gemini/stores — List user's Gemini File Search Stores
 *
 * Syncs with the Gemini API to discover stores created outside MaiaChat
 * (e.g., from other apps using the same API key). New stores are
 * auto-imported into the local DB so they can be selected for retrieval.
 */
export async function GET(req: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get user's Google API key for syncing with Gemini API
        const apiKeys = await getUserApiKeys(userId);
        const googleKey = apiKeys.google;

        // If user has a Google API key, sync stores from the Gemini API
        if (googleKey) {
            try {
                await syncStoresFromGemini(userId, googleKey);
            } catch (err) {
                // Sync failure shouldn't block the response — just log it
                console.error("Gemini store sync failed (returning DB results):", err);
            }
        }

        // Return stores from DB (now includes any newly imported ones)
        const stores = await db
            .select({
                id: geminiStores.id,
                geminiStoreName: geminiStores.geminiStoreName,
                displayName: geminiStores.displayName,
                description: geminiStores.description,
                color: geminiStores.color,
                documentCount: geminiStores.documentCount,
                status: geminiStores.status,
                lastSyncAt: geminiStores.lastSyncAt,
                createdAt: geminiStores.createdAt,
                updatedAt: geminiStores.updatedAt,
            })
            .from(geminiStores)
            .where(eq(geminiStores.userId, userId))
            .orderBy(geminiStores.createdAt);

        return NextResponse.json({ stores });
    } catch (error) {
        console.error("GET /api/gemini/stores error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * Sync stores from the Gemini API into the local DB.
 * - Discovers stores created outside MaiaChat and imports them.
 * - Updates document counts for existing stores.
 */
async function syncStoresFromGemini(userId: string, apiKey: string) {
    // Fetch all stores from the Gemini API
    const apiResponse = await listGeminiStoresApi(apiKey);
    const apiStores = apiResponse.fileSearchStores || [];

    if (apiStores.length === 0) return;

    // Get existing store names from the local DB for this user
    const existingStores = await db
        .select({
            id: geminiStores.id,
            geminiStoreName: geminiStores.geminiStoreName,
        })
        .from(geminiStores)
        .where(eq(geminiStores.userId, userId));

    const existingNames = new Set(existingStores.map((s) => s.geminiStoreName));

    // Import stores that exist in Gemini but not in local DB
    const newStores = apiStores.filter((s) => !existingNames.has(s.name));

    if (newStores.length > 0) {
        const STORE_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6"];

        try {
            await db.insert(geminiStores).values(
                newStores.map((s, i) => ({
                    userId,
                    geminiStoreName: s.name,
                    displayName: s.displayName || s.name.replace("fileSearchStores/", ""),
                    description: "Imported from Gemini API",
                    color: STORE_COLORS[i % STORE_COLORS.length],
                    documentCount: parseInt(s.activeDocumentsCount || "0", 10),
                    status: "active",
                    lastSyncAt: new Date(),
                }))
            );
        } catch (insertError) {
            // Log but don't throw - allow existing stores to be returned
            console.error("Failed to insert synced stores (table may not exist):", insertError);
        }
    }

    // Update document counts for existing stores
    for (const apiStore of apiStores) {
        const existing = existingStores.find((s) => s.geminiStoreName === apiStore.name);
        if (existing) {
            const docCount = parseInt(apiStore.activeDocumentsCount || "0", 10);
            await db
                .update(geminiStores)
                .set({
                    documentCount: docCount,
                    lastSyncAt: new Date(),
                })
                .where(eq(geminiStores.id, existing.id));
        }
    }
}

/**
 * POST /api/gemini/stores — Create a new Gemini File Search Store
 * Body: { displayName: string, description?: string, color?: string }
 */
export async function POST(req: Request) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Rate limit
        const rateLimitId = getRateLimitIdentifier(req, userId);
        const rl = await checkRateLimit(rateLimitId, "gemini-stores-create", RATE_LIMITS.api);
        if (!rl.success) {
            return rateLimitExceededResponse(rl, RATE_LIMITS.api);
        }

        const body = await req.json();
        const { displayName, description, color } = body;

        if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
            return NextResponse.json({ error: "displayName is required" }, { status: 400 });
        }

        // Get user's Google API key
        const apiKeys = await getUserApiKeys(userId);
        const googleKey = apiKeys.google;
        if (!googleKey) {
            return NextResponse.json(
                { error: "No Google API key configured. Add one in Settings." },
                { status: 400 }
            );
        }

        // Create store in Gemini API
        const geminiStore = await createGeminiStore(displayName.trim(), googleKey);

        // Save to DB
        const [dbStore] = await db
            .insert(geminiStores)
            .values({
                userId,
                geminiStoreName: geminiStore.name,
                displayName: displayName.trim(),
                description: description || null,
                color: color || "#6366f1",
                status: "active",
            })
            .returning();

        return NextResponse.json({ store: dbStore }, { status: 201 });
    } catch (error) {
        console.error("POST /api/gemini/stores error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}
