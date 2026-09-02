import type { CachePort } from "../types";

export function createWebStorageCacheAdapter(storage: Storage): CachePort {
  return {
    async get(key) {
      return storage.getItem(key);
    },
    async set(key, value) {
      storage.setItem(key, value);
    },
    async delete(key) {
      storage.removeItem(key);
    },
  };
}
