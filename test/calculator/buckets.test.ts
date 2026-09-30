import { describe, expect, it } from "vitest";
import { aggregateIntoBuckets, bucketSpan, minGranularitySeconds } from "../../src/calculator/grid";
import type { Series } from "../../src/calculator/models";

// Bucket spans and bucket aggregation for `sum(...)` / `average(...)`.
//
// Expected bucket starts were read from CDF (bdx-dev, 2026-09-30) with native
// `count` aggregates over a start that falls mid-bucket.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const DENVER = "America/Denver";
const MID = new Date("2026-04-15T13:37:42.000Z"); // a Wednesday

function utc(iso: string): Date {
  return new Date(`${iso}Z`);
}

function shift(moment: Date, milliseconds: number): Date {
  return new Date(moment.getTime() + milliseconds);
}

function series(...points: Array<[Date, number]>): Series {
  return points.map(([timestamp, value]) => ({ timestamp, value }));
}

function minutes(start: Date, count: number, value = 1): Series {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: shift(start, index * MINUTE),
    value,
  }));
}

describe("bucketSpan: where CDF starts the first bucket", () => {
  it.each<[string, string | undefined, Date]>([
    // Sub-hour floors to the unit in UTC; the timezone is ignored.
    ["1m", undefined, utc("2026-04-15T13:37")],
    ["15m", DENVER, utc("2026-04-15T13:37")],
    // The unit, not the multiple: 2h from 13:37 starts at 13:00.
    ["2h", undefined, utc("2026-04-15T13:00")],
    ["2h", DENVER, utc("2026-04-15T13:00")],
    // Hour floors on the local clock of a half-hour offset.
    ["1h", "UTC+05:30", utc("2026-04-15T13:30")],
    ["1d", undefined, utc("2026-04-15T00:00")],
    ["1d", DENVER, utc("2026-04-15T06:00")],
    // Weeks start at that day's local midnight, not on a Monday.
    ["7d", DENVER, utc("2026-04-15T06:00")],
    ["1w", DENVER, utc("2026-04-15T06:00")],
    ["1mo", DENVER, utc("2026-04-01T06:00")],
  ])("floors start to the unit of %s in %s", (granularity, timeZone, origin) => {
    const { start } = bucketSpan(MID, shift(MID, 200 * DAY), granularity, timeZone);

    expect(start).toEqual(origin);
  });

  it.each([
    "3mo",
    "1q",
    "2mo",
    "12mo",
    "1y",
  ])("floors quarters and years to the month (%s)", (granularity) => {
    // CDF does not snap to a calendar quarter or year.
    const midMay = utc("2026-05-20T13:37");

    const { start } = bucketSpan(midMay, shift(midMay, DAY), granularity, DENVER);

    expect(start).toEqual(utc("2026-05-01T06:00"));
  });

  it("returns the last bucket whole", () => {
    const span = bucketSpan(utc("2026-04-15T06:00"), utc("2026-04-16T18:00"), "1d", DENVER);

    expect(span).toEqual({ start: utc("2026-04-15T06:00"), end: utc("2026-04-17T06:00") });
  });

  it("adds nothing on a bucket boundary", () => {
    const span = bucketSpan(utc("2026-04-15T06:00"), utc("2026-04-17T06:00"), "1d", DENVER);

    expect(span).toEqual({ start: utc("2026-04-15T06:00"), end: utc("2026-04-17T06:00") });
  });

  it("steps months on the local calendar", () => {
    const { end } = bucketSpan(utc("2026-01-20T00:00"), utc("2026-03-02T00:00"), "1mo", DENVER);

    // Midnight 1 March is still MST (UTC-7); DST starts on 8 March.
    expect(end).toEqual(utc("2026-04-01T06:00"));
  });

  it("an empty window is empty", () => {
    // Mid-bucket, so a naive "round end up" would return a whole day.
    const span = bucketSpan(utc("2026-04-15T06:00"), utc("2026-04-15T06:00"), "1d", undefined);

    expect(span).toEqual({ start: utc("2026-04-15T00:00"), end: utc("2026-04-15T00:00") });
  });

  it("rejects an unknown granularity", () => {
    expect(() => bucketSpan(MID, MID, "1fortnight", undefined)).toThrow(/unsupported granularity/);
  });
});

describe("aggregateIntoBuckets", () => {
  it("sums minutes per hour", () => {
    const origin = utc("2026-04-15T13:00");
    const input = minutes(origin, 150, 2); // 2.5 hours

    const result = aggregateIntoBuckets(input, origin, "1h", undefined, "sum");

    expect(result).toEqual(
      series(
        [utc("2026-04-15T13:00"), 120],
        [utc("2026-04-15T14:00"), 120],
        [utc("2026-04-15T15:00"), 60],
      ),
    );
  });

  it("average is a mean of present points", () => {
    const origin = utc("2026-04-15T13:00");
    const input = series([origin, 1], [shift(origin, 5 * MINUTE), 3]);

    const result = aggregateIntoBuckets(input, origin, "1h", undefined, "average");

    expect(result).toEqual(series([origin, 2]));
  });

  it("omits empty buckets and skips NaN", () => {
    const origin = utc("2026-04-15T00:00");
    const input = series(
      [origin, 1],
      [shift(origin, 120 * MINUTE), Number.NaN],
      [shift(origin, 180 * MINUTE), 5],
      [shift(origin, 181 * MINUTE), Number.NaN],
    );

    const result = aggregateIntoBuckets(input, origin, "1h", undefined, "sum");

    expect(result).toEqual(series([origin, 1], [shift(origin, 180 * MINUTE), 5]));
  });

  it("an empty series is empty", () => {
    expect(aggregateIntoBuckets([], utc("2026-01-01T00:00"), "1d", undefined, "sum")).toEqual([]);
  });

  it("daily buckets follow a short DST day", () => {
    // 2026-03-08 in Denver is 23 hours long.
    const origin = utc("2026-03-08T07:00");
    const input = minutes(origin, 24 * 60);

    const result = aggregateIntoBuckets(input, origin, "1d", DENVER, "sum");

    expect(result).toEqual(
      series([utc("2026-03-08T07:00"), 23 * 60], [utc("2026-03-09T06:00"), 60]),
    );
  });

  it("hourly buckets keep the repeated fall-back hour", () => {
    // 2026-11-01 in Denver is 25 hours long: 01:00 happens twice.
    const origin = utc("2026-11-01T06:00"); // local midnight, MDT
    const input = minutes(origin, 25 * 60);

    const result = aggregateIntoBuckets(input, origin, "1h", DENVER, "sum");

    expect(result).toHaveLength(25);
    expect(result.every((point) => point.value === 60)).toBe(true);
  });

  it("weekly buckets start from a Wednesday", () => {
    const origin = utc("2026-04-15T06:00");
    const input = series([origin, 1], [utc("2026-04-22T05:59"), 2], [utc("2026-04-22T06:00"), 4]);

    const result = aggregateIntoBuckets(input, origin, "7d", DENVER, "sum");

    expect(result).toEqual(series([origin, 3], [utc("2026-04-22T06:00"), 4]));
  });
});

describe("minGranularitySeconds", () => {
  it("orders units", () => {
    expect(minGranularitySeconds("1m")).toBe(60);
    expect(minGranularitySeconds("2h")).toBe(7_200);
    const seconds = ["1d", "7d", "1mo", "3mo", "12mo"].map(minGranularitySeconds);
    const known = seconds.filter((value): value is number => value !== undefined);
    expect(known).toHaveLength(seconds.length);
    expect(known).toEqual([...known].sort((left, right) => left - right));
  });

  it("an unknown granularity is undefined", () => {
    expect(minGranularitySeconds("1fortnight")).toBeUndefined();
  });
});
