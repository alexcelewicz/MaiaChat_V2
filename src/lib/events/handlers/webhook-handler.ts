/**
 * Webhook Handler
 *
 * Validates and processes incoming webhook events.
 * Supports HMAC signature validation for security.
 */

import { createHmac, randomBytes, timingSafeEqual as cryptoTimingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { eventTriggers } from "@/lib/db/schema";
import type { EventTriggerSourceConfig } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { fireTrigger, type TriggerEvent, type TriggerResult } from "../trigger-service";

// ============================================================================
// Types
// ============================================================================

export interface WebhookRequest {
    path: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
    ip?: string;
}

export interface WebhookResponse {
    success: boolean;
    status: number;
    message: string;
    results?: TriggerResult[];
}

// ============================================================================
// Webhook Handler
// ============================================================================

/**
 * Handle incoming webhook request
 *
 * This function validates signatures and fires ONLY the triggers that passed
 * validation, preventing the bypass where fireMatchingTriggers() would
 * independently query and fire all path-matched triggers.
 */
export async function handleWebhook(request: WebhookRequest): Promise<WebhookResponse> {
    const { path, method, headers, body, ip } = request;

    console.log(`[WebhookHandler] Received ${method} ${path}`);

    try {
        // Find triggers matching this webhook path
        const triggers = await db
            .select()
            .from(eventTriggers)
            .where(and(eq(eventTriggers.sourceType, "webhook"), eq(eventTriggers.isEnabled, true)));

        // Filter by path
        const matchingTriggers = triggers.filter((trigger) => {
            const sourceConfig = trigger.sourceConfig as EventTriggerSourceConfig | null;
            if (!sourceConfig?.webhookPath) return false;

            // Match exact path or path ending
            return path === sourceConfig.webhookPath || path.endsWith(sourceConfig.webhookPath);
        });

        if (matchingTriggers.length === 0) {
            return {
                success: false,
                status: 404,
                message: "No matching webhook triggers found",
            };
        }

        // Validate signatures for triggers that require it
        const validatedTriggers = [];
        for (const trigger of matchingTriggers) {
            const sourceConfig = trigger.sourceConfig as EventTriggerSourceConfig | null;

            if (sourceConfig?.webhookSecret) {
                const isValid = validateSignature(
                    body,
                    headers,
                    sourceConfig.webhookSecret
                );

                if (!isValid) {
                    console.log(`[WebhookHandler] Invalid signature for trigger ${trigger.id}`);
                    continue;
                }
            }

            validatedTriggers.push(trigger);
        }

        if (validatedTriggers.length === 0) {
            return {
                success: false,
                status: 401,
                message: "Invalid webhook signature",
            };
        }

        // Build trigger event
        const triggerEvent: TriggerEvent = {
            sourceType: "webhook",
            payload: typeof body === "object" ? (body as Record<string, unknown>) : { data: body },
            metadata: {
                path,
                method,
                headers,
                ip,
            },
        };

        // Fire ONLY the validated triggers directly by ID (not fireMatchingTriggers
        // which would do an independent DB query and bypass signature validation)
        const results: TriggerResult[] = [];
        for (const trigger of validatedTriggers) {
            const result = await fireTrigger(trigger.id, triggerEvent);
            results.push(result);
        }

        const successCount = results.filter((r) => r.success).length;
        const failCount = results.filter((r) => !r.success).length;

        return {
            success: successCount > 0,
            status: 200,
            message: `Processed ${results.length} trigger(s): ${successCount} succeeded, ${failCount} failed`,
            results,
        };
    } catch (error) {
        console.error("[WebhookHandler] Error processing webhook:", error);
        return {
            success: false,
            status: 500,
            message: error instanceof Error ? error.message : "Internal server error",
        };
    }
}

/**
 * Validate webhook signature
 *
 * Supports common signature formats:
 * - X-Hub-Signature-256 (GitHub)
 * - X-Signature (generic)
 * - X-Webhook-Signature
 */
function validateSignature(
    body: unknown,
    headers: Record<string, string>,
    secret: string
): boolean {
    // Normalize headers to lowercase
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        normalizedHeaders[key.toLowerCase()] = value;
    }

    // Try different signature header formats
    const signatureHeaders = [
        "x-hub-signature-256",
        "x-signature-256",
        "x-signature",
        "x-webhook-signature",
    ];

    let signature: string | null = null;
    let algorithm = "sha256";

    for (const header of signatureHeaders) {
        if (normalizedHeaders[header]) {
            signature = normalizedHeaders[header];
            // Detect algorithm from signature prefix
            if (signature.startsWith("sha256=")) {
                algorithm = "sha256";
                signature = signature.slice(7);
            } else if (signature.startsWith("sha1=")) {
                algorithm = "sha1";
                signature = signature.slice(5);
            }
            break;
        }
    }

    if (!signature) {
        // No signature header found
        return false;
    }

    // Compute expected signature
    const bodyString = typeof body === "string" ? body : JSON.stringify(body);
    const hmac = createHmac(algorithm, secret);
    hmac.update(bodyString);
    const expectedSignature = hmac.digest("hex");

    // Use Node.js native constant-time comparison
    try {
        return cryptoTimingSafeEqual(
            Buffer.from(signature, "utf8"),
            Buffer.from(expectedSignature, "utf8")
        );
    } catch {
        // Buffers of different length throw -- signatures don't match
        return false;
    }
}

/**
 * Generate a webhook path for a trigger
 * Returns just the unique path segment, not the full API path
 */
export function generateWebhookPath(triggerId: string): string {
    return `/${triggerId}`;
}

/**
 * Generate a cryptographically secure webhook secret
 */
export function generateWebhookSecret(): string {
    return randomBytes(32).toString("hex");
}

/**
 * Get webhook URL for a trigger
 */
export function getWebhookUrl(baseUrl: string, triggerId: string): string {
    return `${baseUrl}/api/webhooks/${triggerId}`;
}
