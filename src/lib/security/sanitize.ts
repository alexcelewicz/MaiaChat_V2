/**
 * Input sanitization utilities
 */

/**
 * Escape HTML entities to prevent XSS
 */
export function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;",
    "`": "&#x60;",
    "=": "&#x3D;",
  };

  return text.replace(/[&<>"'`=/]/g, (char) => htmlEntities[char] || char);
}

/**
 * Remove HTML tags from text
 */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

/**
 * Sanitize string for safe display
 * - Removes HTML tags
 * - Escapes special characters
 * - Trims whitespace
 */
export function sanitizeString(text: string): string {
  if (typeof text !== "string") {
    return "";
  }
  return escapeHtml(stripHtml(text.trim()));
}

/**
 * Sanitize user input for database storage
 * - Removes null bytes
 * - Trims whitespace
 * - Limits length
 */
export function sanitizeInput(
  text: string,
  maxLength: number = 10000
): string {
  if (typeof text !== "string") {
    return "";
  }
  
  return text
    .replace(/\0/g, "") // Remove null bytes
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize filename for safe storage
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== "string") {
    return "unnamed";
  }

  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_") // Replace unsafe chars
    .replace(/_{2,}/g, "_") // Collapse multiple underscores
    .replace(/^[.-]/, "_") // Don't start with dot or dash
    .slice(0, 255); // Max filename length
}

/**
 * Sanitize URL - ensure it's a valid HTTP(S) URL
 */
export function sanitizeUrl(url: string): string | null {
  if (typeof url !== "string") {
    return null;
  }

  try {
    const parsed = new URL(url);
    
    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    // Don't allow javascript: or data: URIs that might have been URL-encoded
    const decoded = decodeURIComponent(url.toLowerCase());
    if (decoded.includes("javascript:") || decoded.includes("data:")) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email: string): string | null {
  if (typeof email !== "string") {
    return null;
  }

  const trimmed = email.trim().toLowerCase();
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  maxDepth: number = 10
): T {
  if (maxDepth <= 0) {
    return {} as T;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Sanitize key
    const sanitizedKey = sanitizeString(key);

    if (typeof value === "string") {
      result[sanitizedKey] = sanitizeInput(value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[sanitizedKey] = value;
    } else if (Array.isArray(value)) {
      result[sanitizedKey] = value.map((item) => {
        if (typeof item === "string") {
          return sanitizeInput(item);
        } else if (typeof item === "object" && item !== null) {
          return sanitizeObject(item as Record<string, unknown>, maxDepth - 1);
        }
        return item;
      });
    } else if (typeof value === "object" && value !== null) {
      result[sanitizedKey] = sanitizeObject(
        value as Record<string, unknown>,
        maxDepth - 1
      );
    }
    // Ignore undefined, null, functions, symbols, etc.
  }

  return result as T;
}

/**
 * Validate and sanitize JSON string
 */
export function sanitizeJson(jsonString: string): unknown | null {
  try {
    const parsed = JSON.parse(jsonString);
    
    if (typeof parsed === "object" && parsed !== null) {
      return sanitizeObject(parsed);
    }
    
    if (typeof parsed === "string") {
      return sanitizeInput(parsed);
    }
    
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Check if string contains potential SQL injection patterns
 */
export function hasSqlInjectionPatterns(text: string): boolean {
  if (typeof text !== "string") return false;

  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/i,
    /(--)/, // SQL comment
    /(;)/, // Statement terminator
    /(\bOR\b.*=.*)/i, // OR injection
    /(\bAND\b.*=.*)/i, // AND injection
    /(\/\*.*\*\/)/, // Block comment
  ];

  return sqlPatterns.some((pattern) => pattern.test(text));
}

/**
 * Check if string contains potential XSS patterns
 */
export function hasXssPatterns(text: string): boolean {
  if (typeof text !== "string") return false;

  const xssPatterns = [
    /<script[^>]*>/i,
    /javascript:/i,
    /on\w+\s*=/i, // onclick, onload, etc.
    /data:/i,
    /<iframe[^>]*>/i,
    /<object[^>]*>/i,
    /<embed[^>]*>/i,
    /<link[^>]*>/i,
    /<style[^>]*>/i,
  ];

  return xssPatterns.some((pattern) => pattern.test(text));
}
