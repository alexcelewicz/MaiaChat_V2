import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getDownloadUrl, getFileMetadata, listFiles } from "@/lib/storage/s3";

const mediaSettingsSchema = z.object({
    provider: z.enum(["auto", "openai", "gemini", "openrouter"]),
    quality: z.enum(["standard", "hd"]),
    size: z.enum(["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"]),
    style: z.enum(["natural", "vivid"]),
    saveHistory: z.boolean(),
});

type MediaSettings = z.infer<typeof mediaSettingsSchema>;

const DEFAULT_SETTINGS: MediaSettings = {
    provider: "auto",
    quality: "standard",
    size: "1024x1024",
    style: "natural",
    saveHistory: true,
};

function parseSettingsFromPreferences(preferences: Record<string, unknown>): MediaSettings {
    const media = (preferences.mediaGeneration as Record<string, unknown> | undefined) || {};
    const parsed = mediaSettingsSchema.safeParse(media);
    if (parsed.success) {
        return parsed.data;
    }
    return DEFAULT_SETTINGS;
}

export async function GET() {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [user] = await db
            .select({ preferences: users.preferences })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        const preferences = (user?.preferences as Record<string, unknown>) || {};
        const settings = parseSettingsFromPreferences(preferences);

        let history: Array<{
            key: string;
            url: string;
            sizeBytes: number;
            createdAt: string;
            provider: string | null;
            model: string | null;
            prompt: string | null;
            action: string;
        }> = [];
        let totalBytes = 0;
        let totalImages = 0;
        let mostUsedProvider: string | null = null;

        try {
            const files = await listFiles(`images/${userId}/`, 200);
            const sortedFiles = [...files].sort((a, b) => {
                const aTime = a.lastModified?.getTime() || 0;
                const bTime = b.lastModified?.getTime() || 0;
                return bTime - aTime;
            });

            const recentFiles = sortedFiles.slice(0, 24);
            history = await Promise.all(
                recentFiles.map(async (file) => {
                    const [url, metadata] = await Promise.all([
                        getDownloadUrl(file.key, 3600),
                        getFileMetadata(file.key),
                    ]);

                    return {
                        key: file.key,
                        url,
                        sizeBytes: file.size || 0,
                        createdAt: (file.lastModified || new Date()).toISOString(),
                        provider: metadata?.metadata?.provider || null,
                        model: metadata?.metadata?.model || null,
                        prompt: metadata?.metadata?.prompt || null,
                        action: metadata?.metadata?.action || "generate",
                    };
                })
            );

            const providerCounts: Record<string, number> = {};
            for (const item of history) {
                const provider = item.provider || "unknown";
                providerCounts[provider] = (providerCounts[provider] || 0) + 1;
            }
            mostUsedProvider = Object.entries(providerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
            totalBytes = sortedFiles.reduce((sum, file) => sum + (file.size || 0), 0);
            totalImages = sortedFiles.length;
        } catch (storageError) {
            console.warn("[Media Settings] History unavailable:", storageError);
        }

        return NextResponse.json({
            settings,
            history,
            usage: {
                totalImages,
                totalBytes,
                mostUsedProvider,
            },
        });
    } catch (error) {
        console.error("[Media Settings] GET error:", error);
        return NextResponse.json({ error: "Failed to load media settings" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const payload = await request.json();
        const parsed = mediaSettingsSchema.safeParse(payload);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid media settings", details: parsed.error.message },
                { status: 400 }
            );
        }

        const [user] = await db
            .select({ preferences: users.preferences })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        const currentPreferences = (user?.preferences as Record<string, unknown>) || {};
        const updatedPreferences = {
            ...currentPreferences,
            mediaGeneration: parsed.data,
        };

        await db
            .update(users)
            .set({
                preferences: updatedPreferences,
                updatedAt: new Date(),
            })
            .where(eq(users.id, userId));

        return NextResponse.json({
            success: true,
            settings: parsed.data,
        });
    } catch (error) {
        console.error("[Media Settings] PUT error:", error);
        return NextResponse.json({ error: "Failed to save media settings" }, { status: 500 });
    }
}
