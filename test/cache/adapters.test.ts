import { describe, expect, it } from "vitest";
import { createMemoryCacheAdapter } from "../../src/cache/adapters/memory-adapter";
import { createWebStorageCacheAdapter } from "../../src/cache/adapters/web-storage-adapter";

function createFakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe("createMemoryCacheAdapter", () => {
  it("returns null for a missing key", async () => {
    const adapter = createMemoryCacheAdapter();
    await expect(adapter.get("missing")).resolves.toBeNull();
  });

  it("round-trips a stored value", async () => {
    const adapter = createMemoryCacheAdapter();
    await adapter.set("key", "value");
    await expect(adapter.get("key")).resolves.toBe("value");
  });

  it("removes a value on delete", async () => {
    const adapter = createMemoryCacheAdapter();
    await adapter.set("key", "value");
    await adapter.delete("key");
    await expect(adapter.get("key")).resolves.toBeNull();
  });
});

describe("createWebStorageCacheAdapter", () => {
  it("round-trips a stored value through the given storage", async () => {
    const storage = createFakeStorage();
    const adapter = createWebStorageCacheAdapter(storage);

    await adapter.set("key", "value");
    expect(storage.getItem("key")).toBe("value");
    await expect(adapter.get("key")).resolves.toBe("value");
  });

  it("returns null for a missing key", async () => {
    const adapter = createWebStorageCacheAdapter(createFakeStorage());
    await expect(adapter.get("missing")).resolves.toBeNull();
  });

  it("removes a value on delete", async () => {
    const storage = createFakeStorage();
    const adapter = createWebStorageCacheAdapter(storage);

    await adapter.set("key", "value");
    await adapter.delete("key");
    expect(storage.getItem("key")).toBeNull();
  });
});
