import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decryptApiKey } from "@/lib/crypto";
import type { ProviderId } from "./providers/types";

/**
 * Get all API keys for a user, decrypted
 */
export async function getUserApiKeys(
    userId: string
): Promise<Partial<Record<ProviderId, string>>> {
    try {
        const keys = await db.query.apiKeys.findMany({
            where: eq(apiKeys.userId, userId),
            columns: {
                provider: true,
                encryptedKey: true,
                isActive: true,
            },
        });

        const result: Partial<Record<ProviderId, string>> = {};

        for (const key of keys) {
            if (key.isActive && key.encryptedKey) {
                try {
                    const decrypted = decryptApiKey(key.encryptedKey);
                    result[key.provider as ProviderId] = decrypted;
                } catch (e) {
                    console.error(`Failed to decrypt key for ${key.provider}:`, e);
                }
            }
        }

        return result;
    } catch (error) {
        console.error("Failed to get user API keys:", error);
        return {};
    }
}

/**
 * Get a specific API key for a user
 */
export async function getUserApiKey(
    userId: string,
    provider: ProviderId
): Promise<string | null> {
    try {
        const key = await db.query.apiKeys.findFirst({
            where: (keys, { and, eq }) => and(
                eq(keys.userId, userId),
                eq(keys.provider, provider)
            ),
            columns: {
                encryptedKey: true,
                isActive: true,
            },
        });

        if (!key || !key.isActive || !key.encryptedKey) {
            return null;
        }

        return decryptApiKey(key.encryptedKey);
    } catch (error) {
        console.error(`Failed to get API key for ${provider}:`, error);
        return null;
    }
}
