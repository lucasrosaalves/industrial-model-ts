import { walkExpr } from "./formula-expression/ast";
import { compileFormula } from "./formula-expression/compiler";
import type { BucketAggregate } from "./formula-expression/types";
import type { AnyTimeSeriesParameter, Series } from "./models";
import {
  asTimeZone,
  type ResolvedTimeZone,
  toUtc,
  utcToWall,
  type WallTime,
  wallToUtc,
} from "./timezone";

// Longer unit names first so ``1mo`` is not parsed as ``1m``.
const GRANULARITY_RE =
  /^(\d+)(months|month|mo|minutes|minute|mins|min|seconds|second|secs|sec|quarters|quarter|years|year|hours|hour|hrs|hr|days|day|weeks|week|wks|wk|s|m|h|d|w|q|y|t)$/i;

// Normalized units: s, m, h, d, w, mo, q, y. Same spellings Cognite accepts
// (`t` is its alias for minutes).
const UNIT_ALIASES: Record<string, string> = {
  s: "s",
  sec: "s",
  secs: "s",
  second: "s",
  seconds: "s",
  m: "m",
  t: "m",
  min: "m",
  mins: "m",
  minute: "m",
  minutes: "m",
  h: "h",
  hr: "h",
  hrs: "h",
  hour: "h",
  hours: "h",
  d: "d",
  day: "d",
  days: "d",
  w: "w",
  wk: "w",
  wks: "w",
  week: "w",
  weeks: "w",
  mo: "mo",
  month: "mo",
  months: "mo",
  q: "q",
  quarter: "q",
  quarters: "q",
  y: "y",
  year: "y",
  years: "y",
};

const MONTHS_PER_UNIT: Record<string, number> = { mo: 1, q: 3, y: 12 };

// Shortest length of one unit, to compare granularities (`1m` < `1d`).
const MIN_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3_600,
  d: 86_400,
  w: 7 * 86_400,
  mo: 28 * 86_400,
  q: 89 * 86_400,
  y: 365 * 86_400,
};

export function formulaUsesRollingAverage(formula: string): boolean {
  const compiled = compileFormula(formula);
  let found = false;
  walkExpr(compiled.tree, (node) => {
    if (node.kind === "call" && node.name === "rolling_average") {
      found = true;
    }
  });
  return found;
}

/**
 * Return the common CDF granularity, or `undefined` if it is not uniform.
 *
 * Raw parameters (no aggregate / no granularity) and mixed granularities
 * disable grid fill so `rolling_average` stays count-based.
 */
export function sharedAggregateGranularity(
  parameters: readonly AnyTimeSeriesParameter[],
): string | undefined {
  const granularities: string[] = [];
  for (const parameter of parameters) {
    if (parameter.aggregateType === undefined || parameter.granularity === undefined) {
      return undefined;
    }
    granularities.push(parameter.granularity);
  }
  if (granularities.length === 0) {
    return undefined;
  }
  const first = granularities[0] as string;
  if (granularities.some((granularity) => granularity !== first)) {
    return undefined;
  }
  return first;
}

export function parseGranularity(
  granularity: string,
): { quantity: number; unit: string } | undefined {
  const match = GRANULARITY_RE.exec(granularity.trim());
  if (match === null) {
    return undefined;
  }
  const quantity = Number(match[1]);
  const unitToken = match[2]?.toLowerCase();
  if (!Number.isInteger(quantity) || quantity < 1 || unitToken === undefined) {
    return undefined;
  }
  const unit = UNIT_ALIASES[unitToken];
  if (unit === undefined) {
    return undefined;
  }
  return { quantity, unit };
}

/**
 * Bucket starts that overlap `[start, end)` on `granularity`.
 *
 * Phased from retrieved timestamps. A CDF aggregate whose bucket start is
 * before `start` is kept when that bucket still overlaps the window.
 * Sub-hour steps are fixed UTC durations (CDF ignores timezone for those).
 * Hour and longer steps follow the local calendar of `timeZone` (UTC if
 * omitted) so DST days and month lengths stay correct.
 */
export function buildBucketGrid(
  start: Date,
  end: Date,
  granularity: string,
  timeZone: string | undefined,
  references: readonly Date[],
): Date[] {
  const parsed = parseGranularity(granularity);
  if (parsed === undefined || references.length === 0) {
    return [];
  }
  const startUtc = toUtc(start);
  const endUtc = toUtc(end);
  if (endUtc.getTime() <= startUtc.getTime()) {
    return [];
  }

  const { quantity, unit } = parsed;
  const tz = asTimeZone(timeZone);
  let origin = references
    .map(toUtc)
    .reduce((earliest, moment) => (moment.getTime() < earliest.getTime() ? moment : earliest));

  while (true) {
    const previous = step(origin, quantity, unit, tz, -1);
    if (previous.getTime() >= origin.getTime()) {
      break;
    }
    if (previous.getTime() >= startUtc.getTime()) {
      origin = previous;
      continue;
    }
    if (origin.getTime() > startUtc.getTime()) {
      origin = previous;
    }
    break;
  }

  const grid: Date[] = [];
  let moment = origin;
  while (moment.getTime() < endUtc.getTime()) {
    const next = step(moment, quantity, unit, tz, 1);
    if (next.getTime() <= moment.getTime()) {
      break;
    }
    if (next.getTime() > startUtc.getTime()) {
      grid.push(moment);
    }
    moment = next;
  }
  return grid;
}

/**
 * Place `series` on `grid`; a bucket without a point gets `fill`.
 *
 * Without a fill value the bucket is `NaN`.
 */
export function expandSeriesOnGrid(series: Series, grid: readonly Date[], fill?: number): Series {
  const missing = fill ?? Number.NaN;
  const values = new Map<number, number>();
  for (const point of series) {
    values.set(point.timestamp.getTime(), point.value);
  }
  return grid.map((timestamp) => ({
    timestamp,
    value: values.get(timestamp.getTime()) ?? missing,
  }));
}

function step(
  moment: Date,
  quantity: number,
  unit: string,
  timeZone: ResolvedTimeZone,
  sign: number,
): Date {
  const delta = quantity * sign;
  if (unit === "s") {
    return new Date(moment.getTime() + delta * 1000);
  }
  if (unit === "m") {
    return new Date(moment.getTime() + delta * 60_000);
  }
  const local = utcToWall(moment, timeZone);
  const shifted =
    unit === "h"
      ? shiftWall(local, { hours: delta })
      : unit === "d"
        ? shiftWall(local, { days: delta })
        : unit === "w"
          ? shiftWall(local, { days: 7 * delta })
          : shiftMonths(local, delta * (MONTHS_PER_UNIT[unit] as number));
  return wallToUtc(shifted, timeZone);
}

function shiftWall(local: WallTime, delta: { hours?: number; days?: number }): WallTime {
  const shifted = new Date(
    Date.UTC(
      local.year,
      local.month - 1,
      local.day + (delta.days ?? 0),
      local.hour + (delta.hours ?? 0),
      local.minute,
      local.second,
      local.millisecond,
    ),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
  };
}

function shiftMonths(local: WallTime, months: number): WallTime {
  const totalMonths = local.year * 12 + (local.month - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  const day = Math.min(local.day, daysInMonth(year, month + 1));
  return { ...local, year, month: month + 1, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Shortest possible bucket length, or `undefined` for an unknown granularity. */
export function minGranularitySeconds(granularity: string): number | undefined {
  const parsed = parseGranularity(granularity);
  if (parsed === undefined) {
    return undefined;
  }
  return parsed.quantity * (MIN_UNIT_SECONDS[parsed.unit] as number);
}

/**
 * The whole buckets CDF aggregates over for `[start, end)`.
 *
 * CDF floors `start` to the granularity's *unit*, not its multiple: `2h`
 * from 13:37 starts at 13:00, `7d` and `1w` at that day's local midnight
 * (not a Monday), `3mo` / `1q` / `1y` at the 1st of that local month. The
 * last bucket that starts before `end` is returned whole. Every bucket holds
 * all of its data, including data outside `[start, end)`. An empty window
 * spans nothing.
 */
export function bucketSpan(
  start: Date,
  end: Date,
  granularity: string,
  timeZone: string | undefined,
): { start: Date; end: Date } {
  const { quantity, unit } = requireGranularity(granularity);
  const tz = asTimeZone(timeZone);
  const startUtc = toUtc(start);
  const endUtc = toUtc(end);
  const origin = floorToUnit(startUtc, unit, tz);
  if (endUtc.getTime() <= startUtc.getTime()) {
    return { start: origin, end: origin };
  }
  let stop = origin;
  while (stop.getTime() < endUtc.getTime()) {
    stop = nextBucket(stop, quantity, unit, tz);
  }
  return { start: origin, end: stop };
}

/**
 * Aggregate an ascending series into buckets that start at `origin`.
 *
 * `origin` comes from {@link bucketSpan}, so bucket starts match the
 * timestamps CDF returns for the same granularity and time zone. `NaN`
 * values are skipped; a bucket with no value is omitted, as CDF omits empty
 * buckets.
 */
export function aggregateIntoBuckets(
  series: Series,
  origin: Date,
  granularity: string,
  timeZone: string | undefined,
  aggregate: BucketAggregate,
): Series {
  const { quantity, unit } = requireGranularity(granularity);
  const tz = asTimeZone(timeZone);
  const result: Series = [];
  let bucketStart = toUtc(origin);
  let bucketEnd = nextBucket(bucketStart, quantity, unit, tz);
  let values: number[] = [];
  for (const point of series) {
    const moment = point.timestamp.getTime();
    if (moment < bucketStart.getTime()) {
      continue;
    }
    while (moment >= bucketEnd.getTime()) {
      if (values.length > 0) {
        result.push({ timestamp: bucketStart, value: aggregateValues(values, aggregate) });
        values = [];
      }
      bucketStart = bucketEnd;
      bucketEnd = nextBucket(bucketStart, quantity, unit, tz);
    }
    if (!Number.isNaN(point.value)) {
      values.push(point.value);
    }
  }
  if (values.length > 0) {
    result.push({ timestamp: bucketStart, value: aggregateValues(values, aggregate) });
  }
  return result;
}

function aggregateValues(values: readonly number[], aggregate: BucketAggregate): number {
  const total = preciseSum(values);
  return aggregate === "sum" ? total : total / values.length;
}

/** Neumaier-compensated sum, so long buckets of small values do not drift. */
function preciseSum(values: readonly number[]): number {
  let total = 0;
  let compensation = 0;
  for (const value of values) {
    const next = total + value;
    compensation +=
      Math.abs(total) >= Math.abs(value) ? total - next + value : value - next + total;
    total = next;
  }
  return total + compensation;
}

function requireGranularity(granularity: string): { quantity: number; unit: string } {
  const parsed = parseGranularity(granularity);
  if (parsed === undefined) {
    throw new Error(`unsupported granularity: '${granularity}'`);
  }
  return parsed;
}

/**
 * Start of the unit containing `moment`.
 *
 * Sub-hour units floor in UTC (CDF ignores the time zone for them); hour
 * and longer floor on the local calendar of `timeZone`.
 */
function floorToUnit(moment: Date, unit: string, timeZone: ResolvedTimeZone): Date {
  const time = moment.getTime();
  if (unit === "s") {
    return new Date(Math.floor(time / 1000) * 1000);
  }
  if (unit === "m") {
    return new Date(Math.floor(time / 60_000) * 60_000);
  }
  const local = utcToWall(moment, timeZone);
  if (unit === "h") {
    // Subtract the elapsed part of the local hour rather than rebuilding the
    // wall time, so the repeated hour of a DST fall-back floors to its own
    // start instead of the first occurrence.
    return new Date(time - (local.minute * 60_000 + local.second * 1000 + local.millisecond));
  }
  const day = unit === "d" || unit === "w" ? local.day : 1;
  return wallToUtc({ ...local, day, hour: 0, minute: 0, second: 0, millisecond: 0 }, timeZone);
}

/**
 * Start of the bucket after the one starting at `moment`.
 *
 * Hours are fixed durations, so a DST fall-back day has 25 hourly buckets.
 * Days and longer follow the local wall clock (23 / 25 h days).
 */
function nextBucket(
  moment: Date,
  quantity: number,
  unit: string,
  timeZone: ResolvedTimeZone,
): Date {
  if (unit === "s") {
    return new Date(moment.getTime() + quantity * 1000);
  }
  if (unit === "m") {
    return new Date(moment.getTime() + quantity * 60_000);
  }
  if (unit === "h") {
    return new Date(moment.getTime() + quantity * 3_600_000);
  }
  const local = utcToWall(moment, timeZone);
  const shifted =
    unit === "d"
      ? shiftWall(local, { days: quantity })
      : unit === "w"
        ? shiftWall(local, { days: 7 * quantity })
        : shiftMonths(local, quantity * (MONTHS_PER_UNIT[unit] as number));
  return wallToUtc(shifted, timeZone);
}
