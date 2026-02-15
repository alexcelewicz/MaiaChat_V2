/**
 * HTTP Request Tool
 *
 * Generic HTTP request tool for making authenticated or unauthenticated
 * requests to external APIs. Supports domain allowlisting for security.
 */

import { z } from "zod";
import type { Tool, ToolId, ToolResult } from "./types";
import { getConfigSection } from "@/lib/config";

// ============================================================================
// Tool Schema
// ============================================================================

const httpRequestToolSchema = z.object({
    url: z.string().url(),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    auth: z.object({
        type: z.enum(["bearer", "basic", "api_key"]),
        token: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        headerName: z.string().optional(),
        apiKey: z.string().optional(),
    }).optional(),
    timeout: z.number().min(1000).max(120000).default(30000),
});

type HttpRequestToolInput = z.infer<typeof httpRequestToolSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const httpRequestTool: Tool = {
    id: "http_request" as ToolId,
    name: "HTTP Request",
    description: `Make HTTP requests to external APIs.

Parameters:
- url: The full URL to request (required)
- method: HTTP method - GET, POST, PUT, PATCH, DELETE (default: GET)
- headers: Optional object of request headers
- body: Optional request body (string or JSON object, auto-serialized for POST/PUT/PATCH)
- auth: Optional authentication config:
  - type "bearer": Uses auth.token as Bearer token
  - type "basic": Uses auth.username and auth.password
  - type "api_key": Uses auth.headerName (default "X-API-Key") with auth.apiKey value
- timeout: Request timeout in ms (default: 30000, max: 120000)

Security: Requests may be restricted to allowed domains configured by the admin.`,
    category: "utility",
    icon: "Globe",
    schema: httpRequestToolSchema,
    execute: async (params, context) => {
        return executeHttpRequest(params as HttpRequestToolInput, context);
    },
};

// ============================================================================
// Tool Execution
// ============================================================================

async function executeHttpRequest(
    input: HttpRequestToolInput,
    _context?: { userId?: string }
): Promise<ToolResult> {
    void _context;
    try {
        // Security: Check domain allowlist
        const allowlistCheck = await checkDomainAllowlist(input.url);
        if (!allowlistCheck.allowed) {
            return {
                success: false,
                error: allowlistCheck.reason,
            };
        }

        // Build headers
        const headers: Record<string, string> = {
            ...input.headers,
        };

        // Apply authentication
        if (input.auth) {
            switch (input.auth.type) {
                case "bearer":
                    if (!input.auth.token) {
                        return { success: false, error: "auth.token is required for bearer authentication" };
                    }
                    headers["Authorization"] = `Bearer ${input.auth.token}`;
                    break;

                case "basic": {
                    if (!input.auth.username || !input.auth.password) {
                        return { success: false, error: "auth.username and auth.password are required for basic authentication" };
                    }
                    const encoded = Buffer.from(`${input.auth.username}:${input.auth.password}`).toString("base64");
                    headers["Authorization"] = `Basic ${encoded}`;
                    break;
                }

                case "api_key":
                    if (!input.auth.apiKey) {
                        return { success: false, error: "auth.apiKey is required for api_key authentication" };
                    }
                    headers[input.auth.headerName || "X-API-Key"] = input.auth.apiKey;
                    break;
            }
        }

        // Build request body
        let requestBody: string | undefined;
        if (input.body !== undefined && ["POST", "PUT", "PATCH"].includes(input.method)) {
            if (typeof input.body === "string") {
                requestBody = input.body;
            } else {
                requestBody = JSON.stringify(input.body);
                if (!headers["Content-Type"]) {
                    headers["Content-Type"] = "application/json";
                }
            }
        }

        // Execute request with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), input.timeout);

        const response = await fetch(input.url, {
            method: input.method,
            headers,
            body: requestBody,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Parse response
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });

        const contentType = response.headers.get("content-type") || "";
        let responseBody: unknown;

        if (contentType.includes("application/json")) {
            responseBody = await response.json();
        } else {
            const text = await response.text();
            // Truncate very large responses
            responseBody = text.length > 50000 ? text.substring(0, 50000) + "... (truncated)" : text;
        }

        return {
            success: response.ok,
            data: {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                body: responseBody,
            },
            error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
        };
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            return {
                success: false,
                error: `Request timed out after ${input.timeout}ms`,
            };
        }

        console.error("[HTTP Request Tool] Error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "HTTP request failed",
        };
    }
}

// ============================================================================
// Security
// ============================================================================

/**
 * Check if the URL's hostname is in the configured allowed domains list.
 */
async function checkDomainAllowlist(url: string): Promise<{
    allowed: boolean;
    reason?: string;
}> {
    try {
        const integrationsConfig = await getConfigSection("integrations");
        const httpRequestConfig = integrationsConfig?.httpRequest;

        if (!httpRequestConfig?.enabled) {
            return {
                allowed: false,
                reason: "HTTP Request tool is disabled. Ask an admin to enable integrations.httpRequest.enabled.",
            };
        }

        const allowedDomains = Array.isArray(httpRequestConfig.allowedDomains)
            ? httpRequestConfig.allowedDomains
                .map((domain) => domain.trim().toLowerCase())
                .filter(Boolean)
            : [];

        const allowAll = allowedDomains.includes("*");
        if (!allowAll && allowedDomains.length === 0) {
            return {
                allowed: false,
                reason: "HTTP Request allowlist is empty. Configure integrations.httpRequest.allowedDomains or use '*' explicitly to allow all domains.",
            };
        }

        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();

        // Check if hostname matches any allowed domain (exact or subdomain match)
        const isAllowed = allowAll || allowedDomains.some((domain: string) => {
            return hostname === domain || hostname.endsWith(`.${domain}`);
        });

        if (!isAllowed) {
            return {
                allowed: false,
                reason: `Domain "${hostname}" is not in integrations.httpRequest.allowedDomains.`,
            };
        }

        return { allowed: true };
    } catch (error) {
        console.error("[HTTP Request Tool] Failed to validate allowlist:", error);
        return {
            allowed: false,
            reason: "HTTP Request allowlist could not be validated due to a configuration error.",
        };
    }
}

export default httpRequestTool;
