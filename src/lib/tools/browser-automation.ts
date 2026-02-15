/**
 * Browser Automation Tool
 *
 * Provides browser automation capabilities via Playwright.
 * Supports: navigate, screenshot, click, type, evaluate, get_text,
 *           get_links, fill_form, wait_for
 *
 * Uses a singleton browser instance pattern to avoid launching multiple browsers.
 * Blocks navigation to internal/private network addresses for safety.
 */

import { z } from "zod";
import type { Tool, ToolId, ToolResult } from "./types";

// ============================================================================
// Tool Schema
// ============================================================================

const browserAutomationToolSchema = z.object({
    action: z.enum([
        "navigate",
        "screenshot",
        "click",
        "type",
        "evaluate",
        "get_text",
        "get_links",
        "fill_form",
        "wait_for",
    ]),

    // Navigation
    url: z.string().optional(),

    // Element interaction
    selector: z.string().optional(),

    // Text input
    text: z.string().optional(),

    // JavaScript evaluation
    script: z.string().optional(),

    // Timing
    timeout: z.number().min(100).max(60000).optional(),
});

type BrowserAutomationToolInput = z.infer<typeof browserAutomationToolSchema>;

// ============================================================================
// Singleton Browser Instance
// ============================================================================

let browserInstance: any = null;
let browserLaunchPromise: Promise<any> | null = null;
const userContexts = new Map<string, any>();

async function getBrowser() {
    if (browserInstance && browserInstance.isConnected()) {
        return browserInstance;
    }
    // Use a launch promise to prevent concurrent browser launches (race condition)
    if (!browserLaunchPromise) {
        browserLaunchPromise = (async () => {
            const { chromium } = await import("playwright");
            browserInstance = await chromium.launch({
                headless: true,
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                ],
            });
            userContexts.clear();
            return browserInstance;
        })().finally(() => {
            browserLaunchPromise = null;
        });
    }
    return browserLaunchPromise;
}

/**
 * Get a per-user browser context to prevent cross-user session leakage.
 * Each user gets an isolated context with separate cookies/storage.
 */
async function getPage(userId: string) {
    const browser = await getBrowser();
    let ctx = userContexts.get(userId);
    if (!ctx || ctx.pages().length === 0) {
        ctx = await browser.newContext();
        userContexts.set(userId, ctx);
    }
    const pages = ctx.pages();
    if (pages.length > 0) return pages[0];
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    return page;
}

// ============================================================================
// Safety: Block Internal Network Access
// ============================================================================

const BLOCKED_HOST_PATTERNS = [
    /^127\.\d+\.\d+\.\d+$/,
    /^localhost$/i,
    /^10\.\d+\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
    /^0\.0\.0\.0$/,
    /^\[?::1\]?$/,
    /^169\.254\.\d+\.\d+$/, // Link-local
    /\.local$/i, // mDNS
    /^.*\.nip\.io$/i, // DNS rebinding services
    /^.*\.sslip\.io$/i,
    /^localtest\.me$/i,
];

function isBlockedUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        // Only allow http and https protocols - blocks file://, data://, etc.
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return true;
        }
        const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
        return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
    } catch {
        return true; // Block malformed URLs
    }
}

// ============================================================================
// Tool Definition
// ============================================================================

export const browserAutomationTool: Tool = {
    id: "browser_automation" as ToolId,
    name: "Browser Automation",
    description: `Automate browser interactions using Playwright.

Actions:
- navigate: Navigate to a URL (requires url)
- screenshot: Take a screenshot of the current page (returns base64)
- click: Click an element by CSS selector (requires selector)
- type: Type text into an element (requires selector, text)
- evaluate: Execute JavaScript in the page context (requires script)
- get_text: Get text content of an element or the full page (optional selector)
- get_links: Get all links on the current page
- fill_form: Fill a form field (requires selector, text)
- wait_for: Wait for an element to appear (requires selector, optional timeout)

Requires command execution to be enabled in admin settings.
Navigation to internal networks (localhost, 127.0.0.1, 10.x, 192.168.x) is blocked for security.`,
    category: "system",
    icon: "Globe",
    schema: browserAutomationToolSchema,
    requiresLocalAccess: true,
    execute: async (params, context) => {
        if (!context?.commandExecutionEnabled) {
            return {
                success: false,
                error: "Browser automation requires command execution to be enabled. Please enable it in admin settings.",
            };
        }
        return executeBrowserTool(params as BrowserAutomationToolInput, context?.userId || "anonymous");
    },
};

// ============================================================================
// Tool Execution
// ============================================================================

async function executeBrowserTool(
    input: BrowserAutomationToolInput,
    userId: string
): Promise<ToolResult> {
    const { action } = input;

    try {
        switch (action) {
            case "navigate":
                return await handleNavigate(input, userId);

            case "screenshot":
                return await handleScreenshot(userId);

            case "click":
                return await handleClick(input, userId);

            case "type":
                return await handleType(input, userId);

            case "evaluate":
                return await handleEvaluate(input, userId);

            case "get_text":
                return await handleGetText(input, userId);

            case "get_links":
                return await handleGetLinks(userId);

            case "fill_form":
                return await handleFillForm(input, userId);

            case "wait_for":
                return await handleWaitFor(input, userId);

            default:
                return {
                    success: false,
                    error: `Unknown action: ${action}`,
                };
        }
    } catch (error) {
        console.error("[Browser Automation Tool] Error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Browser automation operation failed",
        };
    }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleNavigate(input: BrowserAutomationToolInput, userId: string): Promise<ToolResult> {
    if (!input.url) {
        return { success: false, error: "url is required for navigate action" };
    }

    if (isBlockedUrl(input.url)) {
        return {
            success: false,
            error: "Navigation to internal network addresses is blocked for security reasons.",
        };
    }

    const page = await getPage(userId);
    const timeout = input.timeout || 30000;

    // Intercept and block requests to internal URLs (prevents SSRF via redirect)
    await page.route("**/*", (route: any) => {
        const url = route.request().url();
        if (isBlockedUrl(url)) {
            console.warn(`[Browser] Blocked request to internal URL: ${url}`);
            route.abort("blockedbyclient");
        } else {
            route.continue();
        }
    });

    let response;
    try {
        response = await page.goto(input.url, {
            waitUntil: "domcontentloaded",
            timeout,
        });
    } finally {
        // Remove the route handler after navigation to avoid accumulation
        await page.unroute("**/*");
    }

    // Check final URL after redirects
    const finalUrl = page.url();
    if (isBlockedUrl(finalUrl)) {
        await page.goto("about:blank");
        return {
            success: false,
            error: "Navigation was redirected to a blocked internal address.",
        };
    }

    return {
        success: true,
        data: {
            url: finalUrl,
            title: await page.title(),
            status: response?.status(),
            message: `Navigated to ${finalUrl}`,
        },
    };
}

async function handleScreenshot(userId: string): Promise<ToolResult> {
    const page = await getPage(userId);

    const buffer = await page.screenshot({
        type: "png",
        fullPage: false,
    });

    const base64 = buffer.toString("base64");

    return {
        success: true,
        data: {
            url: page.url(),
            title: await page.title(),
            screenshot: base64,
            format: "png",
            encoding: "base64",
        },
    };
}

async function handleClick(input: BrowserAutomationToolInput, userId: string): Promise<ToolResult> {
    if (!input.selector) {
        return { success: false, error: "selector is required for click action" };
    }

    const page = await getPage(userId);
    const timeout = input.timeout || 5000;

    await page.click(input.selector, { timeout });

    return {
        success: true,
        data: {
            selector: input.selector,
            url: page.url(),
            message: `Clicked element: ${input.selector}`,
        },
    };
}

async function handleType(input: BrowserAutomationToolInput, userId: string): Promise<ToolResult> {
    if (!input.selector || !input.text) {
        return { success: false, error: "selector and text are required for type action" };
    }

    const page = await getPage(userId);
    const timeout = input.timeout || 5000;

    await page.click(input.selector, { timeout });
    await page.keyboard.type(input.text);

    return {
        success: true,
        data: {
            selector: input.selector,
            textLength: input.text.length,
            message: `Typed ${input.text.length} characters into ${input.selector}`,
        },
    };
}

async function handleEvaluate(input: BrowserAutomationToolInput, userId: string): Promise<ToolResult> {
    if (!input.script) {
        return { success: false, error: "script is required for evaluate action" };
    }

    const page = await getPage(userId);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await page.evaluate(input.script);

    return {
        success: true,
        data: {
            result,
            url: page.url(),
        },
    };
}

async function handleGetText(input: BrowserAutomationToolInput, userId: string): Promise<ToolResult> {
    const page = await getPage(userId);

    let text: string;

    if (input.selector) {
        const element = await page.$(input.selector);
        if (!element) {
            return { success: false, error: `Element not found: ${input.selector}` };
        }
        text = (await element.textContent()) || "";
    } else {
        text = await page.innerText("body");
    }

    // Truncate very long text to prevent excessive response sizes
    const maxLength = 10000;
    const truncated = text.length > maxLength;
    if (truncated) {
        text = text.substring(0, maxLength);
    }

    return {
        success: true,
        data: {
            text,
            length: text.length,
            truncated,
            selector: input.selector || "body",
            url: page.url(),
        },
    };
}

async function handleGetLinks(userId: string): Promise<ToolResult> {
    const page = await getPage(userId);

    const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll("a[href]"));
        return anchors.map((a) => ({
            text: a.textContent?.trim() || "",
            href: (a as HTMLAnchorElement).href,
        })).filter((link) => link.href && link.href !== "");
    });

    return {
        success: true,
        data: {
            count: links.length,
            links: links.slice(0, 200), // Cap at 200 links
            url: page.url(),
        },
    };
}

async function handleFillForm(input: BrowserAutomationToolInput, userId: string): Promise<ToolResult> {
    if (!input.selector || !input.text) {
        return { success: false, error: "selector and text are required for fill_form action" };
    }

    const page = await getPage(userId);
    const timeout = input.timeout || 5000;

    await page.fill(input.selector, input.text, { timeout });

    return {
        success: true,
        data: {
            selector: input.selector,
            value: input.text,
            message: `Filled form field ${input.selector}`,
        },
    };
}

async function handleWaitFor(input: BrowserAutomationToolInput, userId: string): Promise<ToolResult> {
    if (!input.selector) {
        return { success: false, error: "selector is required for wait_for action" };
    }

    const page = await getPage(userId);
    const timeout = input.timeout || 30000;

    await page.waitForSelector(input.selector, {
        state: "visible",
        timeout,
    });

    return {
        success: true,
        data: {
            selector: input.selector,
            url: page.url(),
            message: `Element appeared: ${input.selector}`,
        },
    };
}

export default browserAutomationTool;
