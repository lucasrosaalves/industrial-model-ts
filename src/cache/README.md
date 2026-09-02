# Cache

`ViewMapper` (used internally by `IndustrialModelClient`) loads a data model's view definitions from CDF once and memoizes them for as long as the mapper instance is alive. That memoization is lost on every page reload in a browser and on every process restart in Node — this module lets you back it with a real store instead, without hard-coding the library to any one environment.

## Table of contents

- [Quick start](#quick-start)
- [The `CachePort` interface](#the-cacheport-interface)
- [Built-in adapters](#built-in-adapters)
- [TTL](#ttl)
- [Writing your own adapter (Node example)](#writing-your-own-adapter-node-example)
- [API reference](#api-reference)

## Quick start

Pass a `CachePort` (and optionally a `cacheTtlMs`) to `IndustrialModelClient`:

```ts
import { CogniteClient } from "@cognite/sdk";
import { IndustrialModelClient, createWebStorageCacheAdapter } from "industrial-model";

const client = new CogniteClient({ /* ... */ });

const model = new IndustrialModelClient(
  client,
  { space: "cdf_cdm", externalId: "CogniteCore", version: "v1" },
  {
    cache: createWebStorageCacheAdapter(window.localStorage),
    cacheTtlMs: 24 * 60 * 60 * 1000, // 1 day
  },
);
```

The first query loads the schema from CDF and persists it through the adapter. Every subsequent `IndustrialModelClient` for the same data model — including ones created after a page reload — reads it back from `localStorage` instead of calling CDF again, until `cacheTtlMs` elapses.

## The `CachePort` interface

```ts
export interface CachePort {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

That's the entire contract: an async string key-value store. Everything else — JSON encoding of the cached schema, TTL expiry, and de-duplicating concurrent loads — is handled above this interface by `createCacheResolver`, so an adapter only ever has to move raw strings in and out of whatever it's backed by.

## Built-in adapters

- `createMemoryCacheAdapter()` — a plain `Map`. Works in any environment. Useful for tests, or for explicitly sharing one cache across several `IndustrialModelClient`/`ViewMapper` instances within the same process.
- `createWebStorageCacheAdapter(storage)` — wraps a `Storage` object, so pass `window.localStorage` to persist across page reloads or `window.sessionStorage` to scope it to the current tab.

Neither adapter is shipped with any environment-specific import baked in — `createWebStorageCacheAdapter` only touches the `Storage` object it's given — so both are safe to import from Node or a browser bundle alike.

## TTL

`cacheTtlMs` (on `IndustrialModelClientOptions`, or `ttlMs` on `createCacheResolver`'s options) is optional. Omit it and a cached schema is reused indefinitely until you call `invalidate` or delete the underlying key yourself. Set it to treat an entry older than that many milliseconds as a miss, triggering a fresh load from CDF (and a fresh write to the cache).

## Writing your own adapter (Node example)

Any store that can persist a string by key works. Here's a minimal file-backed `CachePort` using `node:fs/promises`:

```ts
import { readFile, writeFile } from "node:fs/promises";
import type { CachePort } from "industrial-model";

async function readEntries(path: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return {};
  }
}

export function createFileCacheAdapter(path: string): CachePort {
  return {
    async get(key) {
      const entries = await readEntries(path);
      return entries[key] ?? null;
    },
    async set(key, value) {
      const entries = await readEntries(path);
      entries[key] = value;
      await writeFile(path, JSON.stringify(entries));
    },
    async delete(key) {
      const entries = await readEntries(path);
      delete entries[key];
      await writeFile(path, JSON.stringify(entries));
    },
  };
}
```

This isn't shipped in the package so the core library stays free of Node-only APIs and safe to bundle for browsers — but the interface is only three methods, so any backing store (IndexedDB, a KV service, a database row) is just as easy to wire up.

## API reference

### `createCacheResolver<T>(options?)`

| Option | Type | Description |
| --- | --- | --- |
| `adapter` | `CachePort` | Optional. Persists resolved values through this store. Defaults to a private in-memory store, so a resolver with no adapter still memoizes per instance. |
| `ttlMs` | `number` | Optional. Milliseconds after which a persisted entry is treated as stale. |
| `serialize` | `(value: T) => unknown` | Optional. Converts a resolved value into a JSON-safe representation before it's written into the cache envelope. Defaults to the value itself. |
| `deserialize` | `(json: unknown) => T` | Optional. Converts that representation back into the resolved value. Defaults to a straight cast. |

Returns `{ resolve(key, load), invalidate(key) }`. `resolve` de-duplicates concurrent calls for the same key, reuses an already-resolved (and still fresh) in-process value without touching the adapter again, otherwise reads a fresh cached value from the adapter if one exists, and otherwise calls `load()` and persists the result. A failure to persist (e.g. a full `localStorage`) or a corrupted persisted entry never fails `resolve()` — both are treated as a cache miss and the freshly loaded value is still returned. `invalidate` clears both the in-flight/in-process state and the persisted entry for a key, and is race-safe against a load already in flight for that key.

### `createMemoryCacheAdapter()`

Returns a `CachePort` backed by a `Map`. No parameters.

### `createWebStorageCacheAdapter(storage)`

| Parameter | Type | Description |
| --- | --- | --- |
| `storage` | `Storage` | `window.localStorage`, `window.sessionStorage`, or any object with the same shape. |

Returns a `CachePort` that reads and writes through `storage.getItem`/`setItem`/`removeItem`.
