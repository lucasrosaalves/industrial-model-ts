import { walkExpr } from "./formula-expression/ast";
import { compileFormula } from "./formula-expression/compiler";
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
  /^(\d+)(months|month|mo|minutes|minute|mins|min|seconds|second|secs|sec|hours|hour|hrs|hr|days|day|weeks|week|wks|wk|s|m|h|d|w)$/i;

const UNIT_ALIASES: Record<string, string> = {
  s: "s",
  sec: "s",
  secs: "s",
  second: "s",
  seconds: "s",
  m: "m",
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

export function expandSeriesOnGrid(series: Series, grid: readonly Date[]): Series {
  const values = new Map<number, number>();
  for (const point of series) {
    values.set(point.timestamp.getTime(), point.value);
  }
  return grid.map((timestamp) => ({
    timestamp,
    value: values.get(timestamp.getTime()) ?? Number.NaN,
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
          : shiftMonths(local, delta);
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
