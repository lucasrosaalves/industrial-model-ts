import { createMemoryCacheAdapter } from "./adapters/memory-adapter";
import type { CacheResolver, CacheResolverOptions } from "./types";

type CacheEnvelope = {
  storedAt: number;
  value: unknown;
};

type ResolvedEntry<T> = {
  value: T;
  storedAt: number;
};

export function createCacheResolver<T>(options: CacheResolverOptions<T> = {}): CacheResolver<T> {
  const {
    // Defaults to a private in-memory adapter so a resolver with no persistent adapter still
    // memoizes indefinitely per instance, matching the previous single-promise cache it replaces.
    adapter = createMemoryCacheAdapter(),
    ttlMs,
    serialize = defaultSerialize,
    deserialize = defaultDeserialize,
  } = options;

  // `pending` de-duplicates concurrent resolve() calls for a key. `resolved` is a
  // process-local, already-deserialized copy of the last value resolved by *this* resolver,
  // so repeat calls (e.g. ViewMapper re-reading its own schema many times) never re-hit the
  // adapter or re-run deserialize() once a value is already known and still fresh.
  const pending = new Map<string, Promise<T>>();
  const resolved = new Map<string, ResolvedEntry<T>>();
  // Bumped by invalidate() so a load already in flight when invalidate() runs does not
  // resurrect the invalidated entry once it settles.
  const generations = new Map<string, number>();

  function isFresh(storedAt: number): boolean {
    return ttlMs == null || Date.now() - storedAt <= ttlMs;
  }

  function currentGeneration(key: string): number {
    return generations.get(key) ?? 0;
  }

  async function readFromAdapter(key: string): Promise<ResolvedEntry<T> | null> {
    let raw: string | null;
    try {
      raw = await adapter.get(key);
    } catch {
      return null;
    }
    if (raw == null) return null;

    try {
      const envelope = JSON.parse(raw) as CacheEnvelope;
      if (!isFresh(envelope.storedAt)) return null;
      return { value: deserialize(envelope.value), storedAt: envelope.storedAt };
    } catch {
      // A corrupted, foreign, or incompatible persisted entry is treated as a cache miss
      // rather than failing the resolve() call.
      return null;
    }
  }

  async function writeToAdapter(key: string, entry: ResolvedEntry<T>): Promise<void> {
    try {
      const envelope: CacheEnvelope = { storedAt: entry.storedAt, value: serialize(entry.value) };
      await adapter.set(key, JSON.stringify(envelope));
    } catch {
      // Best-effort persistence: a write failure (quota exceeded, storage disabled, ...)
      // must not fail an otherwise successful load.
    }
  }

  return {
    resolve(key, load) {
      const inFlight = pending.get(key);
      if (inFlight) return inFlight;

      const fresh = resolved.get(key);
      if (fresh && isFresh(fresh.storedAt)) {
        return Promise.resolve(fresh.value);
      }

      const generation = currentGeneration(key);
      const promise = (async () => {
        const fromAdapter = await readFromAdapter(key);
        if (fromAdapter) {
          resolved.set(key, fromAdapter);
          return fromAdapter.value;
        }

        const value = await load();
        const entry: ResolvedEntry<T> = { value, storedAt: Date.now() };
        // Skip persisting a value made stale by an invalidate() that ran while load() was in flight.
        if (currentGeneration(key) === generation) {
          resolved.set(key, entry);
          await writeToAdapter(key, entry);
        }
        return value;
      })();

      pending.set(key, promise);
      // Rejections are surfaced to the caller through `promise` itself; this chain only
      // clears bookkeeping and must not produce a second, unhandled rejection.
      promise
        .finally(() => {
          if (pending.get(key) === promise) pending.delete(key);
        })
        .catch(() => {});

      return promise;
    },

    async invalidate(key) {
      generations.set(key, currentGeneration(key) + 1);
      pending.delete(key);
      resolved.delete(key);
      try {
        await adapter.delete(key);
      } catch {
        // Best-effort: the in-process caches above are already cleared regardless.
      }
    },
  };
}

function defaultSerialize<T>(value: T): unknown {
  return value;
}

function defaultDeserialize<T>(json: unknown): T {
  return json as T;
}
