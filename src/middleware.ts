import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * =============================================================================
 * DEV MODE AUTH BYPASS
 * =============================================================================
 * To test the UI without authentication, add this to .env.local:
 *   DEV_BYPASS_AUTH=true
 * 
 * This ONLY works when:
 *   1. NODE_ENV is "development"
 *   2. DEV_BYPASS_AUTH is explicitly set to "true"
 * 
 * To disable: Remove the DEV_BYPASS_AUTH line from .env.local
 * =============================================================================
 */
const isDevBypassEnabled = 
    process.env.NODE_ENV === "development" && 
    process.env.DEV_BYPASS_AUTH === "true";

const SKIP_VISIT_LOG_PATHS = new Set([
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
]);

function getClientIp(request: NextRequest): string | null {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        const first = forwardedFor.split(",")[0]?.trim();
        if (first) return first;
    }

    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp.trim();

    return (request as unknown as { ip?: string }).ip ?? null;
}

async function checkIpBlocked(request: NextRequest, ip: string | null): Promise<boolean> {
    if (!ip) return false;

    try {
        const checkUrl = new URL("/api/admin/ip-blocks/check", request.url);
        checkUrl.searchParams.set("ip", ip);

        const response = await fetch(checkUrl, {
            method: "GET",
            headers: {
                "x-forwarded-for": ip,
            },
        });

        if (!response.ok) {
            return false;
        }

        const data = await response.json();
        return Boolean(data?.blocked);
    } catch {
        return false;
    }
}

async function logPageVisit(request: NextRequest, ip: string | null): Promise<void> {
    if (request.method !== "GET") return;

    const { pathname, search } = request.nextUrl;
    if (SKIP_VISIT_LOG_PATHS.has(pathname)) return;

    try {
        const logUrl = new URL("/api/admin/visits", request.url);
        const geo = (request as unknown as { geo?: Record<string, string> }).geo || {};
        const userAgent = request.headers.get("user-agent") || "";
        const referer = request.headers.get("referer") || "";
        const isBot = /bot|crawler|spider|crawl/i.test(userAgent);

        await fetch(logUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-forwarded-for": ip || "",
                "cookie": request.headers.get("cookie") || "",
            },
            body: JSON.stringify({
                path: `${pathname}${search}`,
                method: request.method,
                ipAddress: ip,
                country: geo.country || request.headers.get("cf-ipcountry") || null,
                region: geo.region || null,
                city: geo.city || null,
                latitude: geo.latitude || null,
                longitude: geo.longitude || null,
                timezone: geo.timezone || null,
                userAgent,
                referer,
                isBot,
            }),
        });
    } catch {
        // Non-blocking
    }
}

export async function middleware(request: NextRequest) {
    // Better Auth cookie names depend on secure mode:
    // - Production (HTTPS): "__Secure-better-auth.session_token"
    // - Development (HTTP): "better-auth.session_token"
    const secureCookie = request.cookies.get("__Secure-better-auth.session_token")?.value;
    const regularCookie = request.cookies.get("better-auth.session_token")?.value;
    const session = secureCookie || regularCookie;

    const { pathname } = request.nextUrl;
    const clientIp = getClientIp(request);

    // DEV MODE: Skip auth checks entirely when bypass is enabled
    if (isDevBypassEnabled) {
        // Redirect auth pages to chat in dev bypass mode
        const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/register");
        if (isAuthRoute) {
            return NextResponse.redirect(new URL("/chat", request.url));
        }
        void logPageVisit(request, clientIp);
        return NextResponse.next();
    }

    if (await checkIpBlocked(request, clientIp)) {
        return new NextResponse("Access denied", { status: 403 });
    }

    // Define route types
    const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/register");

    // PUBLIC ROUTES - accessible without authentication
    // The chat interface is now public so users can try the app immediately
    // They will need to sign in to save conversations, manage API keys, etc.
    const isPublicRoute =
        pathname === "/" ||
        isAuthRoute ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/chat") ||           // Chat interface is public
        pathname.startsWith("/welcome") ||        // Landing page is public
        pathname.startsWith("/shared") ||         // Shared conversations are public
        pathname.startsWith("/api/health");       // Health check is public

    // PROTECTED ROUTES - require authentication
    // These routes handle user-specific data (settings, documents, agents, etc.)
    const isProtectedRoute =
        pathname.startsWith("/settings") ||
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/documents") ||
        pathname.startsWith("/agents") ||
        pathname.startsWith("/profiles") ||
        pathname.startsWith("/channels") ||
        pathname.startsWith("/inbox") ||
        pathname.startsWith("/scheduled-tasks") ||
        pathname.startsWith("/admin");

    // IP filtering (admin-configured)
    const blockedPromise = checkIpBlocked(request, clientIp);

    // Redirect to login only for protected routes when not authenticated
    if (!session && isProtectedRoute) {
        // Store the intended destination for post-login redirect
        const url = new URL("/login", request.url);
        url.searchParams.set("redirect", pathname);
        return NextResponse.redirect(url);
    }

    // NOTE: We do NOT redirect authenticated users from auth routes in middleware
    // because we can't validate if the session cookie is still valid without
    // hitting the database. If there's a stale cookie, users get stuck in a redirect loop.
    // Instead, auth pages handle this client-side via useUser hook.

    void logPageVisit(request, clientIp);
    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes, except api/auth which is public for session creation)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        "/((?!api|_next/static|_next/image|favicon.ico).*)",
    ],
};
