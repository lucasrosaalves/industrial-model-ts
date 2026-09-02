import { describe, expect, it, vi } from "vitest";
import { createMemoryCacheAdapter } from "../../src/cache/adapters/memory-adapter";
import { createCacheResolver } from "../../src/cache/resolver";

describe("createCacheResolver", () => {
  it("shares a single in-flight load across concurrent resolve calls", async () => {
    const load = vi.fn().mockResolvedValue("value");
    const resolver = createCacheResolver<string>();

    const [a, b, c] = await Promise.all([
      resolver.resolve("key", load),
      resolver.resolve("key", load),
      resolver.resolve("key", load),
    ]);

    expect(load).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual(["value", "value", "value"]);
  });

  it("memoizes the resolved value indefinitely per instance when there is no adapter", async () => {
    const load = vi.fn().mockResolvedValue("value");
    const resolver = createCacheResolver<string>();

    await resolver.resolve("key", load);
    await resolver.resolve("key", load);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not share a memoized value between separate resolver instances without an adapter", async () => {
    const load = vi.fn().mockResolvedValue("value");

    await createCacheResolver<string>().resolve("key", load);
    await createCacheResolver<string>().resolve("key", load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("persists a loaded value through the adapter and reuses it across resolver instances", async () => {
    const adapter = createMemoryCacheAdapter();
    const load = vi.fn().mockResolvedValue({ hello: "world" });

    const first = createCacheResolver<{ hello: string }>({ adapter });
    await first.resolve("key", load);

    const second = createCacheResolver<{ hello: string }>({ adapter });
    const value = await second.resolve("key", load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(value).toEqual({ hello: "world" });
  });

  it("uses custom serialize/deserialize when persisting through the adapter", async () => {
    const adapter = createMemoryCacheAdapter();
    const resolver = createCacheResolver<Map<string, number>>({
      adapter,
      serialize: (value) => Array.from(value.entries()),
      deserialize: (json) => new Map(json as [string, number][]),
    });

    await resolver.resolve("key", async () => new Map([["a", 1]]));
    const second = createCacheResolver<Map<string, number>>({
      adapter,
      serialize: (value) => Array.from(value.entries()),
      deserialize: (json) => new Map(json as [string, number][]),
    });
    const value = await second.resolve("key", vi.fn());

    expect(value).toEqual(new Map([["a", 1]]));
  });

  it("stores each entry as a single JSON document, without double-encoding the value", async () => {
    const adapter = createMemoryCacheAdapter();
    const resolver = createCacheResolver<{ hello: string }>({ adapter });

    await resolver.resolve("key", async () => ({ hello: "world" }));
    const raw = await adapter.get("key");

    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toMatchObject({ value: { hello: "world" } });
  });

  it("re-fetches once the cached entry is older than ttlMs", async () => {
    vi.useFakeTimers();
    try {
      const adapter = createMemoryCacheAdapter();
      const load = vi.fn().mockResolvedValue("value");
      const resolver = createCacheResolver<string>({ adapter, ttlMs: 1000 });

      await resolver.resolve("key", load);
      vi.advanceTimersByTime(1001);
      await resolver.resolve("key", load);

      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reuses the cached entry while still within ttlMs", async () => {
    vi.useFakeTimers();
    try {
      const adapter = createMemoryCacheAdapter();
      const load = vi.fn().mockResolvedValue("value");
      const resolver = createCacheResolver<string>({ adapter, ttlMs: 1000 });

      await resolver.resolve("key", load);
      vi.advanceTimersByTime(500);
      await resolver.resolve("key", load);

      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears both the in-flight entry and the persisted entry on invalidate", async () => {
    const adapter = createMemoryCacheAdapter();
    const load = vi.fn().mockResolvedValue("value");
    const resolver = createCacheResolver<string>({ adapter });

    await resolver.resolve("key", load);
    await resolver.invalidate("key");
    await expect(adapter.get("key")).resolves.toBeNull();

    await resolver.resolve("key", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not poison future resolves when load rejects", async () => {
    const resolver = createCacheResolver<string>();
    const load = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("value");

    await expect(resolver.resolve("key", load)).rejects.toThrow("boom");
    await expect(resolver.resolve("key", load)).resolves.toBe("value");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not re-read or re-deserialize from the adapter once a value is resolved and fresh", async () => {
    const adapter = createMemoryCacheAdapter();
    const get = vi.spyOn(adapter, "get");
    const resolver = createCacheResolver<string>({ adapter });
    const load = vi.fn().mockResolvedValue("value");

    await resolver.resolve("key", load);
    await resolver.resolve("key", load);
    await resolver.resolve("key", load);

    expect(load).toHaveBeenCalledTimes(1);
    // The first call checks the adapter (nothing persisted yet); subsequent calls are
    // served entirely from the in-process resolved value, without touching it again.
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("still returns the loaded value when the adapter fails to persist it", async () => {
    const adapter = createMemoryCacheAdapter();
    vi.spyOn(adapter, "set").mockRejectedValue(new Error("quota exceeded"));
    const resolver = createCacheResolver<string>({ adapter });

    await expect(resolver.resolve("key", async () => "value")).resolves.toBe("value");
  });

  it("treats a corrupted persisted entry as a cache miss instead of rejecting", async () => {
    const adapter = createMemoryCacheAdapter();
    await adapter.set("key", "not valid json");
    const resolver = createCacheResolver<string>({ adapter });

    await expect(resolver.resolve("key", async () => "value")).resolves.toBe("value");
  });

  it("does not resurrect an entry invalidated while its load was still in flight", async () => {
    const adapter = createMemoryCacheAdapter();
    const resolver = createCacheResolver<string>({ adapter });

    let resolveLoad: (value: string) => void = () => {};
    const loadPromise = new Promise<string>((resolve) => {
      resolveLoad = resolve;
    });

    const resolvePromise = resolver.resolve("key", () => loadPromise);
    await resolver.invalidate("key");
    resolveLoad("stale-value");
    await resolvePromise;

    await expect(adapter.get("key")).resolves.toBeNull();
  });
});
