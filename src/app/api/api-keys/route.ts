import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUserId } from "@/lib/auth/session";
import { encryptApiKey, getKeyHint, decryptApiKey } from "@/lib/crypto";
import {
    checkRateLimit,
    RATE_LIMITS,
    getRateLimitIdentifier,
    rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { z } from "zod";
import type { ProviderId } from "@/lib/ai/providers/types";

const VALID_PROVIDERS: ProviderId[] = ["openai", "anthropic", "google", "xai", "openrouter", "deepgram"];

const createApiKeySchema = z.object({
    provider: z.enum(VALID_PROVIDERS as [ProviderId, ...ProviderId[]]),
    apiKey: z.string().min(10).max(500),
});

// GET /api/api-keys - List user's API keys (masked)
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

        const keys = await db.query.apiKeys.findMany({
            where: eq(apiKeys.userId, userId),
            columns: {
                id: true,
                provider: true,
                isActive: true,
                lastUsedAt: true,
                createdAt: true,
                // Note: encryptedKey is NOT included for security
            },
        });

        // Add key hints by decrypting and masking
        const keysWithHints = await Promise.all(
            keys.map(async (key) => {
                // Get the full record to access encrypted key
                const fullKey = await db.query.apiKeys.findFirst({
                    where: eq(apiKeys.id, key.id),
                });
                
                let hint = "****";
                if (fullKey?.encryptedKey) {
                    try {
                        const decrypted = decryptApiKey(fullKey.encryptedKey);
                        hint = getKeyHint(decrypted);
                    } catch {
                        hint = "****";
                    }
                }

                return {
                    ...key,
                    keyHint: hint,
                };
            })
        );

        return NextResponse.json({
            success: true,
            apiKeys: keysWithHints,
        });
    } catch (error) {
        console.error("List API keys error:", error);
        // Return empty array instead of error for better UX
        // This handles cases where user doesn't exist (dev bypass) or database issues
        return NextResponse.json({
            success: true,
            apiKeys: [],
        });
    }
}

// POST /api/api-keys - Add or update an API key
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
        const parseResult = createApiKeySchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json(
                {
                    error: "Validation failed",
                    code: "VALIDATION_ERROR",
                    details: parseResult.error.flatten().fieldErrors,
                },
                { status: 400 }
            );
        }

        const { provider, apiKey } = parseResult.data;

        // Encrypt the API key
        let encryptedKey: string;
        try {
            encryptedKey = encryptApiKey(apiKey);
        } catch (encryptError) {
            console.error("Encryption error:", encryptError);
            if (encryptError instanceof Error) {
                return NextResponse.json(
                    { 
                        error: "Failed to encrypt API key", 
                        code: "ENCRYPTION_ERROR",
                        details: encryptError.message 
                    },
                    { status: 500 }
                );
            }
            throw encryptError;
        }

        // Check if key already exists for this provider
        const existingKey = await db.query.apiKeys.findFirst({
            where: and(
                eq(apiKeys.userId, userId),
                eq(apiKeys.provider, provider)
            ),
        });

        if (existingKey) {
            // Update existing key
            try {
                await db
                    .update(apiKeys)
                    .set({
                        encryptedKey,
                        isActive: true,
                    })
                    .where(eq(apiKeys.id, existingKey.id));

                return NextResponse.json({
                    success: true,
                    message: "API key updated",
                    keyHint: getKeyHint(apiKey),
                });
            } catch (dbError) {
                console.error("Database update error:", dbError);
                throw new Error(`Failed to update API key: ${dbError instanceof Error ? dbError.message : "Unknown error"}`);
            }
        } else {
            // Create new key
            try {
                const [newKey] = await db
                    .insert(apiKeys)
                    .values({
                        userId,
                        provider,
                        encryptedKey,
                        isActive: true,
                    })
                    .returning({
                        id: apiKeys.id,
                        provider: apiKeys.provider,
                        createdAt: apiKeys.createdAt,
                    });

                if (!newKey) {
                    throw new Error("Failed to create API key - no record returned");
                }

                return NextResponse.json(
                    {
                        success: true,
                        message: "API key added",
                        apiKey: {
                            ...newKey,
                            keyHint: getKeyHint(apiKey),
                        },
                    },
                    { status: 201 }
                );
            } catch (dbError) {
                console.error("Database insert error:", dbError);
                throw new Error(`Failed to insert API key: ${dbError instanceof Error ? dbError.message : "Unknown error"}`);
            }
        }
    } catch (error) {
        console.error("Create API key error:", error);
        
        // Log full error details for debugging
        if (error instanceof Error) {
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
            
            if (error.message.includes("ENCRYPTION")) {
                return NextResponse.json(
                    { error: "Server encryption not configured", code: "ENCRYPTION_ERROR", details: error.message },
                    { status: 500 }
                );
            }
            
            // Check for database errors
            if (error.message.includes("database") || error.message.includes("connection") || error.message.includes("relation")) {
                return NextResponse.json(
                    { error: "Database error", code: "DATABASE_ERROR", details: error.message },
                    { status: 500 }
                );
            }
        }

        return NextResponse.json(
            { 
                error: "Failed to save API key", 
                code: "SAVE_FAILED",
                details: error instanceof Error ? error.message : "Unknown error"
            },
            { status: 500 }
        );
    }
}

// DELETE /api/api-keys - Delete an API key
export async function DELETE(request: Request) {
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

        const { searchParams } = new URL(request.url);
        const provider = searchParams.get("provider");

        if (!provider || !VALID_PROVIDERS.includes(provider as ProviderId)) {
            return NextResponse.json(
                { error: "Invalid provider", code: "INVALID_PROVIDER" },
                { status: 400 }
            );
        }

        // Delete the key
        const result = await db
            .delete(apiKeys)
            .where(
                and(
                    eq(apiKeys.userId, userId),
                    eq(apiKeys.provider, provider)
                )
            )
            .returning({ id: apiKeys.id });

        if (result.length === 0) {
            return NextResponse.json(
                { error: "API key not found", code: "NOT_FOUND" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "API key deleted",
        });
    } catch (error) {
        console.error("Delete API key error:", error);
        return NextResponse.json(
            { error: "Failed to delete API key", code: "DELETE_FAILED" },
            { status: 500 }
        );
    }
}
