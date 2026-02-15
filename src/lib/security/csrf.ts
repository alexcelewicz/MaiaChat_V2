import { cookies } from "next/headers";
import { redis } from "@/lib/redis";
import { randomBytes, createHash } from "crypto";

const CSRF_TOKEN_LENGTH = 32;
const CSRF_TOKEN_EXPIRY = 60 * 60; // 1 hour in seconds
const CSRF_COOKIE_NAME = "csrf_token";

/**
 * Generate a new CSRF token
 */
export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * Hash a token for storage
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate and store CSRF token for a session
 */
export async function createCsrfToken(sessionId: string): Promise<string> {
  const token = generateCsrfToken();
  const hashedToken = hashToken(token);
  
  // Store hashed token in Redis with session binding
  const key = `csrf:${sessionId}:${hashedToken}`;
  await redis.setex(key, CSRF_TOKEN_EXPIRY, "valid");
  
  return token;
}

/**
 * Validate a CSRF token
 */
export async function validateCsrfToken(
  sessionId: string,
  token: string
): Promise<boolean> {
  if (!token || !sessionId) {
    return false;
  }

  const hashedToken = hashToken(token);
  const key = `csrf:${sessionId}:${hashedToken}`;
  
  try {
    const result = await redis.get(key);
    
    if (result === "valid") {
      // Token is valid, optionally delete for single-use (stricter security)
      // await redis.del(key);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error("CSRF validation error:", error);
    return false;
  }
}

/**
 * Set CSRF cookie
 */
export async function setCsrfCookie(sessionId: string): Promise<string> {
  const token = await createCsrfToken(sessionId);
  
  const cookieStore = await cookies();
  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by JS to include in requests
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: CSRF_TOKEN_EXPIRY,
  });
  
  return token;
}

/**
 * Get CSRF token from cookie
 */
export async function getCsrfFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CSRF_COOKIE_NAME)?.value || null;
}

/**
 * CSRF validation middleware helper
 */
export async function verifyCsrf(
  request: Request,
  sessionId: string
): Promise<{ valid: boolean; error?: string }> {
  // Skip CSRF for GET, HEAD, OPTIONS requests
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return { valid: true };
  }

  // Get token from header or body
  const headerToken = request.headers.get("X-CSRF-Token");
  
  let bodyToken: string | null = null;
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = await request.clone().json();
      bodyToken = body._csrf || body.csrfToken;
    } catch {
      // Body parsing failed, continue with header token
    }
  }

  const token = headerToken || bodyToken;

  if (!token) {
    return { valid: false, error: "CSRF token missing" };
  }

  const isValid = await validateCsrfToken(sessionId, token);
  
  if (!isValid) {
    return { valid: false, error: "Invalid CSRF token" };
  }

  return { valid: true };
}

/**
 * Clean up expired CSRF tokens for a session
 */
export async function cleanupCsrfTokens(sessionId: string): Promise<void> {
  try {
    const pattern = `csrf:${sessionId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error("CSRF cleanup error:", error);
  }
}

/**
 * React hook helper to get CSRF token on client
 */
export function getCsrfTokenFromDocument(): string | null {
  if (typeof document === "undefined") return null;
  
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === CSRF_COOKIE_NAME) {
      return value;
    }
  }
  return null;
}
