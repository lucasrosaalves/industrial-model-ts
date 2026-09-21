import { describe, expect, it } from "vitest";
import {
  buildBucketGrid,
  expandSeriesOnGrid,
  formulaUsesRollingAverage,
  parseGranularity,
  sharedAggregateGranularity,
} from "../../src/calculator/grid";
import type { TimeSeriesParameter } from "../../src/calculator/models";

function tsParam(
  alias: string,
  options: { aggregateType?: "sum"; granularity?: string } = {},
): TimeSeriesParameter {
  return {
    type: "single_timeseries",
    alias,
    timeSeries: { space: "s", externalId: alias.toLowerCase() },
    ...options,
  };
}

function atUtc(iso: string): Date {
  return new Date(iso);
}

describe("parseGranularity", () => {
  it("accepts short and long units", () => {
    expect(parseGranularity("1m")).toEqual({ quantity: 1, unit: "m" });
    expect(parseGranularity("15m")).toEqual({ quantity: 15, unit: "m" });
    expect(parseGranularity("1mo")).toEqual({ quantity: 1, unit: "mo" });
    expect(parseGranularity("2hours")).toEqual({ quantity: 2, unit: "h" });
    expect(parseGranularity("1day")).toEqual({ quantity: 1, unit: "d" });
  });

  it("rejects unknown granularities", () => {
    expect(parseGranularity("1q")).toBeUndefined();
    expect(parseGranularity("")).toBeUndefined();
  });
});

describe("sharedAggregateGranularity", () => {
  it("requires a uniform aggregate", () => {
    const shared = tsParam("A", { aggregateType: "sum", granularity: "1m" });
    const other = tsParam("B", { aggregateType: "sum", granularity: "5m" });
    const raw = tsParam("C");
    expect(sharedAggregateGranularity([shared])).toBe("1m");
    expect(sharedAggregateGranularity([shared, other])).toBeUndefined();
    expect(sharedAggregateGranularity([shared, raw])).toBeUndefined();
  });
});

describe("formulaUsesRollingAverage", () => {
  it("detects nested calls", () => {
    expect(formulaUsesRollingAverage("rolling_average({A}, 3) - {B}")).toBe(true);
    expect(formulaUsesRollingAverage("{A} + {B}")).toBe(false);
  });

  it.each(["{A}", "rolling_average({A}, 3)"])("matches presence in %s", (formula) => {
    expect(formulaUsesRollingAverage(formula)).toBe(formula.includes("rolling_average"));
  });
});

describe("buildBucketGrid", () => {
  it("fills a minute grid from start to end", () => {
    const start = atUtc("2024-01-01T07:10:00.000Z");
    const end = new Date(start.getTime() + 4 * 60_000);
    const grid = buildBucketGrid(start, end, "1m", undefined, [
      new Date(start.getTime() + 2 * 60_000),
    ]);
    expect(grid).toEqual(
      Array.from({ length: 4 }, (_, offset) => new Date(start.getTime() + offset * 60_000)),
    );
  });

  it("keeps an overlapping bucket before start", () => {
    const start = atUtc("2024-01-01T07:10:30.000Z");
    const end = new Date(start.getTime() + 3 * 60_000);
    const bucket = atUtc("2024-01-01T07:10:00.000Z");
    const grid = buildBucketGrid(start, end, "1m", undefined, [
      new Date(bucket.getTime() + 60_000),
    ]);
    expect(grid).toEqual(
      Array.from({ length: 4 }, (_, offset) => new Date(bucket.getTime() + offset * 60_000)),
    );
  });

  it("drops a bucket that ends at start", () => {
    const start = atUtc("2024-01-01T07:10:00.000Z");
    const end = new Date(start.getTime() + 2 * 60_000);
    const earlier = new Date(start.getTime() - 60_000);
    const grid = buildBucketGrid(start, end, "1m", undefined, [earlier, start]);
    expect(grid).toEqual([start, new Date(start.getTime() + 60_000)]);
  });

  it("follows DST in a local daily timezone", () => {
    const start = atUtc("2024-03-09T05:00:00.000Z"); // 00:00 EST
    const end = atUtc("2024-03-12T04:00:00.000Z"); // 00:00 EDT on the 12th
    const grid = buildBucketGrid(start, end, "1d", "America/New_York", [start]);
    expect(grid).toEqual([
      atUtc("2024-03-09T05:00:00.000Z"),
      atUtc("2024-03-10T05:00:00.000Z"),
      atUtc("2024-03-11T04:00:00.000Z"),
    ]);
  });

  it("keeps a local day that overlaps start", () => {
    const start = atUtc("2024-03-09T17:00:00.000Z"); // 12:00 EST
    const end = atUtc("2024-03-12T04:00:00.000Z"); // 00:00 EDT on the 12th
    const midnight = atUtc("2024-03-09T05:00:00.000Z"); // 00:00 EST
    const grid = buildBucketGrid(start, end, "1d", "America/New_York", [midnight]);
    expect(grid).toEqual([
      atUtc("2024-03-09T05:00:00.000Z"),
      atUtc("2024-03-10T05:00:00.000Z"),
      atUtc("2024-03-11T04:00:00.000Z"),
    ]);
  });
});

describe("expandSeriesOnGrid", () => {
  it("inserts NaN for missing buckets", () => {
    const start = atUtc("2024-01-01T00:00:00.000Z");
    const grid = [start, new Date(start.getTime() + 60_000), new Date(start.getTime() + 120_000)];
    const filled = expandSeriesOnGrid(
      [
        { timestamp: start, value: 10 },
        { timestamp: grid[2] as Date, value: 30 },
      ],
      grid,
    );
    expect(filled[0]).toEqual({ timestamp: start, value: 10 });
    expect(filled[1]?.timestamp).toEqual(grid[1]);
    expect(filled[1]?.value).toBeNaN();
    expect(filled[2]).toEqual({ timestamp: grid[2], value: 30 });
  });
});
