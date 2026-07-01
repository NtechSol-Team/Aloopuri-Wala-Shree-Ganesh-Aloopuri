import NodeCache from 'node-cache';
import { env } from './env';
import { logger } from './logger';

/**
 * In-process cache for dashboard KPIs and expensive aggregates.
 *
 * Cache keys are tagged so writes can invalidate whole groups cheaply. A key is
 * registered under one or more tags; invalidating a tag deletes every key bound
 * to it. Example tags: `dashboard`, `outlet:<id>`, `bills`, `payments`.
 */
class TaggedCache {
  private readonly cache: NodeCache;
  private readonly tagIndex = new Map<string, Set<string>>();

  constructor(ttlSeconds: number) {
    this.cache = new NodeCache({ stdTTL: ttlSeconds, checkperiod: ttlSeconds, useClones: false });
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  set<T>(key: string, value: T, tags: string[] = [], ttlSeconds?: number): T {
    if (ttlSeconds !== undefined) this.cache.set(key, value, ttlSeconds);
    else this.cache.set(key, value);
    for (const tag of tags) {
      const set = this.tagIndex.get(tag) ?? new Set<string>();
      set.add(key);
      this.tagIndex.set(tag, set);
    }
    return value;
  }

  /** Get from cache or compute, store, and return. */
  async getOrSet<T>(
    key: string,
    tags: string[],
    producer: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await producer();
    this.set(key, value, tags, ttlSeconds);
    return value;
  }

  /** Invalidate every key registered under any of the given tags. */
  invalidateTags(...tags: string[]): void {
    let removed = 0;
    for (const tag of tags) {
      const keys = this.tagIndex.get(tag);
      if (!keys) continue;
      for (const key of keys) {
        this.cache.del(key);
        removed += 1;
      }
      this.tagIndex.delete(tag);
    }
    if (removed > 0) logger.debug({ tags, removed }, 'cache invalidated');
  }

  flushAll(): void {
    this.cache.flushAll();
    this.tagIndex.clear();
  }
}

export const cache = new TaggedCache(env.KPI_CACHE_TTL_SECONDS);

// Stable cache-tag constants — never use raw strings at call sites.
export const CacheTag = {
  DASHBOARD: 'dashboard',
  BILLS: 'bills',
  PAYMENTS: 'payments',
  ORDERS: 'orders',
  INVENTORY: 'inventory',
  PRODUCTION: 'production',
  EXPENSES: 'expenses',
  POS: 'pos',
  ANALYTICS: 'analytics',
  outlet: (outletId: string) => `outlet:${outletId}`,
} as const;
