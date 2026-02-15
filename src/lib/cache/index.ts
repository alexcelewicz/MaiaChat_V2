import { redis } from "@/lib/redis";

/**
 * Cache utilities using Redis
 */

const DEFAULT_TTL = 3600; // 1 hour in seconds

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

/**
 * Get a value from cache
 */
export async function getFromCache<T>(
  key: string,
  options: CacheOptions = {}
): Promise<T | null> {
  const { prefix = "cache" } = options;
  const fullKey = `${prefix}:${key}`;

  try {
    const value = await redis.get(fullKey);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    console.error("Cache get error:", error);
    return null;
  }
}

/**
 * Set a value in cache
 */
export async function setInCache<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): Promise<void> {
  const { ttl = DEFAULT_TTL, prefix = "cache" } = options;
  const fullKey = `${prefix}:${key}`;

  try {
    await redis.setex(fullKey, ttl, JSON.stringify(value));
  } catch (error) {
    console.error("Cache set error:", error);
  }
}

/**
 * Delete a value from cache
 */
export async function deleteFromCache(
  key: string,
  options: CacheOptions = {}
): Promise<void> {
  const { prefix = "cache" } = options;
  const fullKey = `${prefix}:${key}`;

  try {
    await redis.del(fullKey);
  } catch (error) {
    console.error("Cache delete error:", error);
  }
}

/**
 * Delete multiple keys matching a pattern
 */
export async function deleteByPattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error("Cache delete pattern error:", error);
  }
}

/**
 * Get or set cache with automatic fetch
 */
export async function getOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const cached = await getFromCache<T>(key, options);
  if (cached !== null) {
    return cached;
  }

  const value = await fetcher();
  await setInCache(key, value, options);
  return value;
}

/**
 * Cache decorator for functions
 */
export function withCache<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  keyGenerator: (...args: Parameters<T>) => string,
  options: CacheOptions = {}
): T {
  return (async (...args: Parameters<T>) => {
    const key = keyGenerator(...args);
    return getOrSet(key, () => fn(...args) as Promise<unknown>, options);
  }) as T;
}

// ============================================
// Specific Cache Keys
// ============================================

/**
 * User-specific cache keys
 */
export const userCache = {
  profile: (userId: string) => `user:${userId}:profile`,
  settings: (userId: string) => `user:${userId}:settings`,
  apiKeys: (userId: string) => `user:${userId}:apikeys`,
  conversations: (userId: string) => `user:${userId}:conversations`,
};

/**
 * Model/Provider cache keys
 */
export const providerCache = {
  models: "providers:models",
  health: (provider: string) => `providers:${provider}:health`,
  status: "providers:status",
};

/**
 * Document cache keys
 */
export const documentCache = {
  list: (userId: string) => `docs:${userId}:list`,
  metadata: (docId: string) => `docs:${docId}:metadata`,
  embeddings: (docId: string) => `docs:${docId}:embeddings`,
};

/**
 * Session cache keys
 */
export const sessionCache = {
  user: (sessionId: string) => `session:${sessionId}`,
  token: (userId: string) => `tokens:${userId}`,
};

// ============================================
// Cache Invalidation Helpers
// ============================================

/**
 * Invalidate all caches for a user
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  await deleteByPattern(`user:${userId}:*`);
  await deleteByPattern(`docs:${userId}:*`);
}

/**
 * Invalidate conversation caches
 */
export async function invalidateConversationCache(userId: string): Promise<void> {
  await deleteFromCache(userCache.conversations(userId));
}

/**
 * Invalidate document caches
 */
export async function invalidateDocumentCache(
  userId: string,
  docId?: string
): Promise<void> {
  await deleteFromCache(documentCache.list(userId));
  if (docId) {
    await deleteFromCache(documentCache.metadata(docId));
    await deleteFromCache(documentCache.embeddings(docId));
  }
}

/**
 * Invalidate provider caches
 */
export async function invalidateProviderCache(): Promise<void> {
  await deleteFromCache(providerCache.models);
  await deleteFromCache(providerCache.status);
}
