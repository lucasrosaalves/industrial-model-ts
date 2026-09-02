---
"industrial-model": minor
---

Add a `CachePort` interface and `createCacheResolver` for memoizing data model schema loads beyond a client instance's lifetime. `IndustrialModelClient` accepts new `cache` and `cacheTtlMs` options; `createMemoryCacheAdapter` and `createWebStorageCacheAdapter` (for `localStorage`/`sessionStorage`) are shipped as built-in adapters, and any other store (a file, IndexedDB, a KV service) can implement the same three-method interface.
