import { redis } from "@/lib/redis";
import { randomBytes } from "crypto";

export interface RateLimitConfig {
    /** Maximum number of requests allowed in the window */
    limit: number;
    /** Time window in seconds */
    windowSeconds: number;
}

export interface RateLimitResult {
    success: boolean;
    remaining: number;
    reset: number; // Unix timestamp when the limit resets
}

// Predefined rate limit configurations
export const RATE_LIMITS = {
    // Auth endpoints: 10 requests per minute
    auth: { limit: 10, windowSeconds: 60 },
    // Chat endpoint: 30 requests per minute
    chat: { limit: 30, windowSeconds: 60 },
    // General API: 100 requests per minute
    api: { limit: 100, windowSeconds: 60 },
    // Strict: 5 requests per minute (for sensitive operations)
    strict: { limit: 5, windowSeconds: 60 },
} as const;

/**
 * Check and update rate limit for a given key
 * Uses sliding window algorithm with Redis
 */
export async function checkRateLimit(
    identifier: string,
    endpoint: string,
    config: RateLimitConfig
): Promise<RateLimitResult> {
    const key = `ratelimit:${endpoint}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowSeconds * 1000;

    // Use Redis transaction for atomic operations
    const pipeline = redis.pipeline();

    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart);

    // Count current entries in window
    pipeline.zcard(key);

    // Add current request
    pipeline.zadd(key, now, `${now}-${randomBytes(4).toString("hex")}`);

    // Set expiry on the key
    pipeline.expire(key, config.windowSeconds);

    const results = await pipeline.exec();

    if (!results) {
        // Redis error - fail open (allow request)
        return { success: true, remaining: config.limit, reset: now + config.windowSeconds * 1000 };
    }

    // Get count from pipeline results (index 1 is zcard result)
    const currentCount = (results[1]?.[1] as number) || 0;
    const remaining = Math.max(0, config.limit - currentCount - 1);
    const reset = now + config.windowSeconds * 1000;

    return {
        success: currentCount < config.limit,
        remaining,
        reset,
    };
}

/**
 * Create rate limit headers for response
 */
export function rateLimitHeaders(result: RateLimitResult, config: RateLimitConfig): Headers {
    const headers = new Headers();
    headers.set("X-RateLimit-Limit", config.limit.toString());
    headers.set("X-RateLimit-Remaining", result.remaining.toString());
    headers.set("X-RateLimit-Reset", Math.ceil(result.reset / 1000).toString());
    return headers;
}

/**
 * Get identifier for rate limiting (IP or user ID)
 */
export function getRateLimitIdentifier(request: Request, userId?: string | null): string {
    // Prefer user ID if authenticated
    if (userId) {
        return `user:${userId}`;
    }

    // Fall back to IP address
    const forwarded = request.headers.get("x-forwarded-for");
    const firstIp = forwarded?.split(",")[0]?.trim();
    const ip = firstIp || "unknown";
    return `ip:${ip}`;
}

/**
 * Rate limit response helper
 */
export function rateLimitExceededResponse(result: RateLimitResult, config: RateLimitConfig): Response {
    const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);

    return new Response(
        JSON.stringify({
            error: "Too many requests",
            code: "RATE_LIMIT_EXCEEDED",
            retryAfter,
        }),
        {
            status: 429,
            headers: {
                "Content-Type": "application/json",
                "Retry-After": retryAfter.toString(),
                ...Object.fromEntries(rateLimitHeaders(result, config)),
            },
        }
    );
}
