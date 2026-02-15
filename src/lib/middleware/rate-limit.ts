import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { redis } from "@/lib/redis";
import { getSessionUserId } from "@/lib/auth/session";

// Simple sliding window rate limit
// Limit: 60 requests per minute by default
const WINDOW_DURATION = 60;
const MAX_REQUESTS = 60;

export function withRateLimit<TArgs extends unknown[]>(
    handler: (request: NextRequest, ...args: TArgs) => Promise<Response> | Response
) {
    return async function (request: NextRequest, ...args: TArgs) {
        const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";
        const userId = await getSessionUserId();
        const key = `ratelimit:${userId || ip}`;

        try {
            const requests = await redis.incr(key);
            if (requests === 1) {
                await redis.expire(key, WINDOW_DURATION);
            }

            if (requests > MAX_REQUESTS) {
                return NextResponse.json(
                    { error: "Too many requests" },
                    { status: 429 }
                );
            }

            return handler(request, ...args);
        } catch (error) {
            console.error("Rate limit error:", error);
            // Fail open
            return handler(request, ...args);
        }
    }
}
