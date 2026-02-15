/**
 * Workspace Quota Enforcement
 *
 * Provides per-user disk quota checking for hosted mode workspaces.
 * Used by file-system and shell-exec tools to prevent disk abuse.
 */

import * as fs from "fs/promises";
import * as path from "path";

// ============================================================================
// Directory Size Calculation
// ============================================================================

/**
 * Recursively calculate the total size of a directory in bytes.
 */
export async function calculateDirSize(dirPath: string): Promise<number> {
    let total = 0;

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            try {
                if (entry.isDirectory()) {
                    total += await calculateDirSize(fullPath);
                } else if (entry.isFile()) {
                    const stat = await fs.stat(fullPath);
                    total += stat.size;
                }
                // Skip symlinks — they don't count toward quota
            } catch {
                // Skip entries we can't stat (race conditions, permission errors)
            }
        }
    } catch {
        // Directory doesn't exist or can't be read — size is 0
    }

    return total;
}

// ============================================================================
// Usage Cache (60s TTL)
// ============================================================================

interface CacheEntry {
    bytes: number;
    expiresAt: number;
}

const usageCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Get the current workspace usage for a user, with caching.
 */
export async function getUserWorkspaceUsage(workspaceDir: string, userId: string): Promise<number> {
    const cached = usageCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.bytes;
    }

    const userDir = path.join(workspaceDir, userId);
    const bytes = await calculateDirSize(userDir);

    usageCache.set(userId, {
        bytes,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return bytes;
}

/**
 * Invalidate the usage cache for a user (call after writes).
 */
export function invalidateUsageCache(userId: string): void {
    usageCache.delete(userId);
}

// ============================================================================
// Quota Check
// ============================================================================

/**
 * Check if a write operation would exceed the user's quota.
 * Returns an error message string if quota would be exceeded, or null if OK.
 */
export async function checkQuota(
    workspaceDir: string,
    userId: string,
    quotaMb: number,
    additionalBytes: number = 0
): Promise<string | null> {
    const quotaBytes = quotaMb * 1024 * 1024;
    const currentUsage = await getUserWorkspaceUsage(workspaceDir, userId);
    const projectedUsage = currentUsage + additionalBytes;

    if (projectedUsage > quotaBytes) {
        const usedMb = (currentUsage / (1024 * 1024)).toFixed(1);
        const addMb = (additionalBytes / (1024 * 1024)).toFixed(1);
        return `Workspace quota exceeded: using ${usedMb} MB of ${quotaMb} MB. ` +
            `This write would add ${addMb} MB. ` +
            `Delete some files or ask an admin to increase your quota.`;
    }

    return null;
}

// ============================================================================
// Workspace Directory Management
// ============================================================================

/**
 * Ensure a user's workspace directory exists, creating it if necessary.
 */
export async function ensureWorkspaceDir(workspaceDir: string, userId?: string): Promise<string> {
    const dir = userId ? path.join(workspaceDir, userId) : workspaceDir;

    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }

    return dir;
}
