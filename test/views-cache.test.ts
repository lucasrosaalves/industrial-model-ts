import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearInMemoryViewsCache,
  createInMemoryViewsCache,
  createSessionStorageViewsCache,
} from "../src/cache/views-cache";
import type { ViewDefinition } from "../src/cognite";
import { makeMemoryStorage } from "./fixtures/index.js";

function makeView(externalId: string): ViewDefinition {
  return { space: "sp", externalId, version: "v1", properties: {} };
}

describe("createInMemoryViewsCache", () => {
  it("stores and retrieves views", async () => {
    const cache = createInMemoryViewsCache();
    await cache.set("mem/store-retrieve", [makeView("ViewA")]);
    const cached = await cache.get("mem/store-retrieve");
    expect(cached?.map((view) => view.externalId)).toEqual(["ViewA"]);
  });

  it("is shared across separate createInMemoryViewsCache() calls", async () => {
    const writer = createInMemoryViewsCache();
    await writer.set("mem/shared", [makeView("ViewA")]);

    const reader = createInMemoryViewsCache();
    const cached = await reader.get("mem/shared");
    expect(cached?.map((view) => view.externalId)).toEqual(["ViewA"]);
  });

  it("expires entries older than the configured ttl", async () => {
    vi.useFakeTimers();
    const cache = createInMemoryViewsCache({ ttlMs: 1000 });
    await cache.set("mem/expired", [makeView("ViewA")]);
    vi.advanceTimersByTime(1001);
    await expect(cache.get("mem/expired")).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("keeps entries within the configured ttl", async () => {
    vi.useFakeTimers();
    const cache = createInMemoryViewsCache({ ttlMs: 1000 });
    await cache.set("mem/fresh", [makeView("ViewA")]);
    vi.advanceTimersByTime(999);
    await expect(cache.get("mem/fresh")).resolves.toBeDefined();
    vi.useRealTimers();
  });
});

describe("createSessionStorageViewsCache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to an in-memory cache when sessionStorage is unavailable (e.g. Node.js)", async () => {
    const cache = createSessionStorageViewsCache();
    await cache.set("fallback/no-session-storage", [makeView("ViewA")]);
    const cached = await cache.get("fallback/no-session-storage");
    expect(cached?.map((view) => view.externalId)).toEqual(["ViewA"]);
  });

  it("stores and retrieves views when sessionStorage is available", async () => {
    vi.stubGlobal("sessionStorage", makeMemoryStorage());
    const cache = createSessionStorageViewsCache();
    await cache.set("session/store-retrieve", [makeView("ViewA")]);
    const cached = await cache.get("session/store-retrieve");
    expect(cached?.map((view) => view.externalId)).toEqual(["ViewA"]);
  });

  it("expires entries older than the configured ttl", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("sessionStorage", makeMemoryStorage());
    const cache = createSessionStorageViewsCache({ ttlMs: 1000 });
    await cache.set("session/expired", [makeView("ViewA")]);
    vi.advanceTimersByTime(1001);
    await expect(cache.get("session/expired")).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("keeps entries within the configured ttl", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("sessionStorage", makeMemoryStorage());
    const cache = createSessionStorageViewsCache({ ttlMs: 1000 });
    await cache.set("session/fresh", [makeView("ViewA")]);
    vi.advanceTimersByTime(999);
    await expect(cache.get("session/fresh")).resolves.toBeDefined();
    vi.useRealTimers();
  });

  it("reads sessionStorage only once per key across repeated get() calls (e.g. new client instances)", async () => {
    const storage = makeMemoryStorage();
    vi.stubGlobal("sessionStorage", storage);

    const writer = createSessionStorageViewsCache();
    await writer.set("session/repeated-reads", [makeView("ViewA")]);
    clearInMemoryViewsCache(); // simulate a fresh process/instance that hasn't warmed its memory cache yet

    const getItemSpy = vi.spyOn(storage, "getItem");
    const first = createSessionStorageViewsCache();
    const second = createSessionStorageViewsCache();

    await first.get("session/repeated-reads");
    await second.get("session/repeated-reads");
    const cached = await second.get("session/repeated-reads");

    expect(cached?.map((view) => view.externalId)).toEqual(["ViewA"]);
    expect(getItemSpy).toHaveBeenCalledTimes(1);
  });
});
