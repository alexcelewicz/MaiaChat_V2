/**
 * Centralized Logger for MaiaChat
 *
 * This logger ensures:
 * - No sensitive information is logged to browser console in production
 * - Server-side logs can be captured for debugging
 * - Development mode has full logging
 * - Production mode only logs errors to server
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
    level: LogLevel;
    message: string;
    data?: unknown;
    timestamp: string;
    context?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

// Minimum log level based on environment
const MIN_LOG_LEVEL: LogLevel = process.env.NODE_ENV === "production" ? "error" : "debug";

// Whether to log to console (browser-side)
const isServer = typeof window === "undefined";
const shouldLogToConsole = process.env.NODE_ENV !== "production" || isServer;

/**
 * Sanitize data to remove sensitive information before logging
 */
function sanitizeData(data: unknown): unknown {
    if (data === null || data === undefined) return data;

    if (typeof data === "string") {
        // Mask API keys
        if (data.match(/sk-[a-zA-Z0-9]{20,}/)) {
            return data.replace(/sk-[a-zA-Z0-9]+/g, "sk-***REDACTED***");
        }
        // Mask authorization headers
        if (data.toLowerCase().includes("bearer ")) {
            return data.replace(/bearer\s+[^\s]+/gi, "Bearer ***REDACTED***");
        }
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(sanitizeData);
    }

    if (typeof data === "object") {
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
            // Skip sensitive keys entirely
            const lowerKey = key.toLowerCase();
            if (
                lowerKey.includes("password") ||
                lowerKey.includes("secret") ||
                lowerKey.includes("apikey") ||
                lowerKey.includes("api_key") ||
                lowerKey.includes("token") ||
                lowerKey.includes("authorization") ||
                lowerKey.includes("encryptedkey")
            ) {
                sanitized[key] = "***REDACTED***";
            } else {
                sanitized[key] = sanitizeData(value);
            }
        }
        return sanitized;
    }

    return data;
}

/**
 * Format log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
    const prefix = entry.context ? `[${entry.context}]` : "";
    const dataStr = entry.data !== undefined ? ` ${JSON.stringify(sanitizeData(entry.data))}` : "";
    return `${entry.timestamp} [${entry.level.toUpperCase()}]${prefix} ${entry.message}${dataStr}`;
}

/**
 * Log a message at the specified level
 */
function log(level: LogLevel, message: string, data?: unknown, context?: string): void {
    // Check if we should log at this level
    if (LOG_LEVELS[level] < LOG_LEVELS[MIN_LOG_LEVEL]) {
        return;
    }

    const entry: LogEntry = {
        level,
        message,
        data,
        timestamp: new Date().toISOString(),
        context,
    };

    // Only log to console if appropriate
    if (shouldLogToConsole) {
        const formatted = formatLogEntry(entry);

        switch (level) {
            case "debug":
                // eslint-disable-next-line no-console
                console.debug(formatted);
                break;
            case "info":
                // eslint-disable-next-line no-console
                console.info(formatted);
                break;
            case "warn":
                // eslint-disable-next-line no-console
                console.warn(formatted);
                break;
            case "error":
                // eslint-disable-next-line no-console
                console.error(formatted);
                break;
        }
    }

    // In production on server, you could send logs to a service
    // TODO: Integrate with a log aggregation service (e.g., Sentry, LogRocket, etc.)
}

/**
 * Create a logger with a specific context (e.g., component or module name)
 */
export function createLogger(context: string) {
    return {
        debug: (message: string, data?: unknown) => log("debug", message, data, context),
        info: (message: string, data?: unknown) => log("info", message, data, context),
        warn: (message: string, data?: unknown) => log("warn", message, data, context),
        error: (message: string, data?: unknown) => log("error", message, data, context),
    };
}

/**
 * Default logger (no context)
 */
export const logger = {
    debug: (message: string, data?: unknown) => log("debug", message, data),
    info: (message: string, data?: unknown) => log("info", message, data),
    warn: (message: string, data?: unknown) => log("warn", message, data),
    error: (message: string, data?: unknown) => log("error", message, data),
};

/**
 * Safe error logging - extracts useful info from Error objects
 */
export function logError(error: unknown, context?: string): void {
    if (error instanceof Error) {
        log("error", error.message, {
            name: error.name,
            stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
        }, context);
    } else {
        log("error", "Unknown error", { error }, context);
    }
}

export default logger;
