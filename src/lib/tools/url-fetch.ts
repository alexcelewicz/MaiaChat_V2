import { z } from "zod";
import { lookup } from "dns/promises";
import type { Tool, ToolResult, ToolContext } from "./types";

const schema = z.object({
    url: z.string().url().describe("The URL to fetch"),
    extractText: z.boolean().default(true).describe("Whether to extract text content from HTML"),
    maxLength: z.number().min(100).max(50000).default(10000).describe("Maximum content length"),
});

type UrlFetchParams = z.infer<typeof schema>;

/** DNS rebinding services that attackers use to rotate between public and private IPs */
const BLOCKED_HOSTNAME_PATTERNS = [
    /\.nip\.io$/i,
    /\.sslip\.io$/i,
    /\.xip\.io$/i,
    /localtest\.me$/i,
    /lvh\.me$/i,
    /^localhost$/i,
];

/**
 * Check if an IP address is private, loopback, link-local, or reserved.
 * Blocks SSRF attacks targeting internal services, cloud metadata endpoints, etc.
 */
function isBlockedIp(ip: string): boolean {
    // IPv4-mapped IPv6 — handle both dotted (::ffff:127.0.0.1) and hex (::ffff:7f000001) forms
    const v4MappedDotted = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (v4MappedDotted) return isBlockedIp(v4MappedDotted[1]);

    const v4MappedHex = ip.match(/^::ffff:([0-9a-f]{1,8})$/i);
    if (v4MappedHex) {
        const num = parseInt(v4MappedHex[1], 16);
        const a = (num >>> 24) & 0xff;
        const b = (num >>> 16) & 0xff;
        return isBlockedIpv4(a, b);
    }

    // IPv6 loopback
    if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;

    // Decimal notation (single number like 2130706433 = 127.0.0.1)
    if (/^\d+$/.test(ip) && !ip.includes(".")) return true;

    const parts = ip.split(".").map(Number);
    if (parts.length === 4 && parts.every((p) => p >= 0 && p <= 255)) {
        return isBlockedIpv4(parts[0], parts[1]);
    }

    return false;
}

function isBlockedIpv4(a: number, b: number): boolean {
    if (a === 127) return true;      // Loopback: 127.0.0.0/8
    if (a === 10) return true;       // Private: 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;  // Private: 172.16.0.0/12
    if (a === 192 && b === 168) return true;  // Private: 192.168.0.0/16
    if (a === 169 && b === 254) return true;  // Link-local / cloud metadata
    if (a === 0) return true;        // Current network: 0.0.0.0/8
    return false;
}

/**
 * Check if a hostname or URL should be blocked before fetching.
 */
function isBlockedHostname(hostname: string): boolean {
    return BLOCKED_HOSTNAME_PATTERNS.some((p) => p.test(hostname));
}

async function execute(
    rawParams: Record<string, unknown>,
    context?: ToolContext
): Promise<ToolResult> {
    const startTime = Date.now();

    try {
        const params = schema.parse(rawParams) as UrlFetchParams;

        // SSRF protection: block private IPs, DNS rebinding services, and redirects
        const parsed = new URL(params.url);

        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return {
                success: false,
                error: "Only HTTP and HTTPS URLs are supported",
                metadata: { executionTime: Date.now() - startTime },
            };
        }

        if (isBlockedHostname(parsed.hostname)) {
            return {
                success: false,
                error: "Access to this hostname is blocked",
                metadata: { executionTime: Date.now() - startTime },
            };
        }

        try {
            const resolved = await lookup(parsed.hostname);
            if (isBlockedIp(resolved.address)) {
                return {
                    success: false,
                    error: "Access to private or internal network addresses is blocked",
                    metadata: { executionTime: Date.now() - startTime },
                };
            }
        } catch {
            // DNS resolution failed — let fetch handle it (will fail naturally)
        }

        const response = await fetch(params.url, {
            headers: {
                "User-Agent": "MAIAChat/1.0 (URL Fetch Tool)",
                Accept: "text/html,application/json,text/plain,*/*",
            },
            signal: AbortSignal.timeout(context?.maxDuration || 10000),
            redirect: "error", // Block redirects to prevent SSRF via 302 to private IPs
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get("content-type") || "";
        let content: string;

        if (contentType.includes("application/json")) {
            const json = await response.json();
            content = JSON.stringify(json, null, 2);
        } else {
            const text = await response.text();

            if (params.extractText && contentType.includes("text/html")) {
                content = extractTextFromHtml(text);
            } else {
                content = text;
            }
        }

        // Truncate if necessary
        if (content.length > params.maxLength) {
            content = content.slice(0, params.maxLength) + "\n\n[Content truncated...]";
        }

        return {
            success: true,
            data: {
                url: params.url,
                contentType,
                content,
                contentLength: content.length,
            },
            metadata: {
                executionTime: Date.now() - startTime,
                source: new URL(params.url).hostname,
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to fetch URL",
            metadata: {
                executionTime: Date.now() - startTime,
            },
        };
    }
}

function extractTextFromHtml(html: string): string {
    // Simple HTML to text conversion without external dependencies
    let text = html;

    // Remove scripts and styles
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

    // Convert block elements to newlines
    text = text.replace(/<\/?(p|div|h[1-6]|br|li|tr|td|th|article|section|header|footer)[^>]*>/gi, "\n");

    // Remove remaining tags
    text = text.replace(/<[^>]+>/g, "");

    // Decode HTML entities
    text = decodeHtmlEntities(text);

    // Clean up whitespace
    text = text
        .replace(/\t/g, " ")
        .replace(/[ ]+/g, " ")
        .replace(/\n[ ]+/g, "\n")
        .replace(/[ ]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return text;
}

function decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
        "&nbsp;": " ",
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&#39;": "'",
        "&apos;": "'",
        "&ndash;": "–",
        "&mdash;": "—",
        "&lsquo;": "'",
        "&rsquo;": "'",
        "&ldquo;": "\u201C",
        "&rdquo;": "\u201D",
        "&bull;": "•",
        "&hellip;": "…",
        "&copy;": "©",
        "&reg;": "®",
        "&trade;": "™",
    };

    let result = text;
    for (const [entity, char] of Object.entries(entities)) {
        result = result.replace(new RegExp(entity, "gi"), char);
    }

    // Handle numeric entities
    result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)));
    result = result.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    return result;
}

export const urlFetchTool: Tool = {
    id: "url_fetch",
    name: "URL Fetch",
    description: "Fetch and extract content from a URL",
    category: "search",
    icon: "Globe",
    schema,
    execute,
};
