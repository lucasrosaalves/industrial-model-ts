import type { ViewDefinition } from "../cognite";

export interface ViewsCache {
  get(key: string): Promise<ViewDefinition[] | undefined>;
  set(key: string, views: ViewDefinition[]): Promise<void>;
}

export type ViewsCacheOptions = {
  /** Cache time-to-live in milliseconds. Defaults to 1 hour. */
  ttlMs?: number;
};

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = "industrial-model:views:";

type StoredEntry = {
  timestamp: number;
  views: ViewDefinition[];
};

function isExpired(entry: StoredEntry, ttlMs: number): boolean {
  return Date.now() - entry.timestamp > ttlMs;
}

/**
 * Cache shared by every `createInMemoryViewsCache()` call in the process, so
 * separate `ViewMapper`/`IndustrialModelClient` instances still share results
 * instead of each starting with an empty cache.
 */
const sharedMemoryStore = new Map<string, StoredEntry>();

/** Test-only escape hatch to reset the process-wide in-memory cache between tests. */
export function clearInMemoryViewsCache(): void {
  sharedMemoryStore.clear();
}

/** In-process cache. Works in any JS runtime; entries don't survive a process restart. */
export function createInMemoryViewsCache(options: ViewsCacheOptions = {}): ViewsCache {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  return {
    async get(key) {
      const entry = sharedMemoryStore.get(key);
      if (!entry) return undefined;

      if (isExpired(entry, ttlMs)) {
        sharedMemoryStore.delete(key);
        return undefined;
      }

      return entry.views;
    },

    async set(key, views) {
      sharedMemoryStore.set(key, { timestamp: Date.now(), views });
    },
  };
}

/**
 * Caches views in the browser's sessionStorage, so the cache survives reloads
 * and navigation within the same tab, but clears when the tab closes. Falls
 * back to an in-process memory cache (`createInMemoryViewsCache`) in any
 * environment where `sessionStorage` isn't available — Node.js, SSR, etc. —
 * so it's safe to use as a default in any runtime.
 *
 * Reads are served from the shared in-process memory cache whenever possible,
 * so repeated `get()` calls — e.g. across `ViewMapper`/`IndustrialModelClient`
 * instances created per request — skip re-parsing JSON and rebuilding the
 * views `Map` from sessionStorage every time. sessionStorage is only touched
 * to seed that memory cache (once per key, per process) and to persist writes.
 */
export function createSessionStorageViewsCache(options: ViewsCacheOptions = {}): ViewsCache {
  const memoryCache = createInMemoryViewsCache(options);
  if (typeof sessionStorage === "undefined") return memoryCache;

  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  return {
    async get(key) {
      const inMemory = await memoryCache.get(key);
      if (inMemory) return inMemory;

      const raw = sessionStorage.getItem(STORAGE_KEY_PREFIX + key);
      if (!raw) return undefined;

      let entry: StoredEntry;
      try {
        entry = JSON.parse(raw) as StoredEntry;
      } catch {
        return undefined;
      }

      if (isExpired(entry, ttlMs)) {
        sessionStorage.removeItem(STORAGE_KEY_PREFIX + key);
        return undefined;
      }

      await memoryCache.set(key, entry.views);
      return entry.views;
    },

    async set(key, views) {
      await memoryCache.set(key, views);
      try {
        const entry: StoredEntry = { timestamp: Date.now(), views };
        sessionStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(entry));
      } catch {
        // Storage unavailable/full (e.g. private browsing, quota exceeded) — skip persisting.
      }
    },
  };
}
