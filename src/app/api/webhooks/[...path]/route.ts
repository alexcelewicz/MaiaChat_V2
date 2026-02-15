/**
 * Dynamic Webhook Receiver
 *
 * Handles incoming webhook events at /api/webhooks/[triggerId]
 * or /api/webhooks/[custom-path]
 */

import { NextRequest, NextResponse } from "next/server";
import { handleWebhook, type WebhookRequest } from "@/lib/events";
import { getAdminSettings } from "@/lib/admin/settings";

interface RouteParams {
    params: Promise<{ path: string[] }>;
}

// ============================================================================
// Handle all HTTP methods
// ============================================================================

async function handleRequest(request: NextRequest, { params }: RouteParams) {
    try {
        // Check if webhooks are enabled
        const settings = await getAdminSettings();
        if (!settings.eventTriggersEnabled) {
            return NextResponse.json(
                { error: "Webhooks are disabled" },
                { status: 403 }
            );
        }

        const { path } = await params;
        const webhookPath = "/" + path.join("/");

        // Parse headers
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            headers[key] = value;
        });

        // Parse body
        let body: unknown;
        const contentType = request.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
            try {
                body = await request.json();
            } catch {
                body = {};
            }
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
            const formData = await request.formData();
            body = Object.fromEntries(formData);
        } else if (contentType.includes("text/")) {
            body = await request.text();
        } else {
            // Try to parse as JSON, fall back to empty object
            try {
                body = await request.json();
            } catch {
                body = {};
            }
        }

        // Get client IP
        const ip =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            request.headers.get("x-real-ip") ||
            "unknown";

        // Build webhook request
        const webhookRequest: WebhookRequest = {
            path: webhookPath,
            method: request.method,
            headers,
            body,
            ip,
        };

        // Handle the webhook
        const response = await handleWebhook(webhookRequest);

        return NextResponse.json(
            {
                success: response.success,
                message: response.message,
                results: response.results?.map((r) => ({
                    status: r.status,
                    durationMs: r.durationMs,
                })),
            },
            { status: response.status }
        );
    } catch (error) {
        console.error("[Webhook] Error processing webhook:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// Export handlers for all methods
export async function GET(request: NextRequest, context: RouteParams) {
    return handleRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteParams) {
    return handleRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteParams) {
    return handleRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteParams) {
    return handleRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteParams) {
    return handleRequest(request, context);
}
