/**
 * Resolve IANA / UTC-offset strings when stepping hour-and-longer
 * rolling-average grids. Retrieve forwards `timeZone` to CDF as-is; IANA
 * and UTC-offset rules are enforced there.
 */

const OFFSET_RE =
  /^(?:UTC)?(?<sign>[+-])(?<hours>\d{1,2})(?::(?<colonMinutes>\d{2})|(?<hhmm>\d{2}))?$/i;

export type ResolvedTimeZone =
  | { readonly kind: "utc" }
  | { readonly kind: "offset"; readonly offsetMs: number }
  | { readonly kind: "iana"; readonly id: string };

export type WallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const ianaFormatters = new Map<string, Intl.DateTimeFormat>();

/** Resolve an optional IANA id / UTC offset for local calendar stepping. */
export function asTimeZone(value: string | undefined): ResolvedTimeZone {
  if (value === undefined) {
    return { kind: "utc" };
  }
  const offset = parseUtcOffset(value);
  if (offset !== undefined) {
    return offset;
  }
  if (value.toUpperCase() === "UTC") {
    return { kind: "utc" };
  }
  // Throws RangeError for an unknown id, matching zoneinfo.ZoneInfo.
  new Intl.DateTimeFormat("en-US", { timeZone: value });
  return { kind: "iana", id: value };
}

export function toUtc(moment: Date): Date {
  return new Date(moment.getTime());
}

export function utcToWall(moment: Date, timeZone: ResolvedTimeZone): WallTime {
  if (timeZone.kind === "utc") {
    return utcComponents(moment);
  }
  if (timeZone.kind === "offset") {
    return utcComponents(new Date(moment.getTime() + timeZone.offsetMs));
  }
  return readIanaWall(moment, timeZone.id);
}

export function wallToUtc(wall: WallTime, timeZone: ResolvedTimeZone): Date {
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  );
  if (timeZone.kind === "utc") {
    return new Date(asUtc);
  }
  if (timeZone.kind === "offset") {
    return new Date(asUtc - timeZone.offsetMs);
  }
  return localizeIana(wall, timeZone.id);
}

function parseUtcOffset(value: string): ResolvedTimeZone | undefined {
  const match = OFFSET_RE.exec(value);
  if (match === null || match.groups === undefined) {
    return undefined;
  }
  const hours = Number(match.groups.hours);
  const minutesToken = match.groups.colonMinutes ?? match.groups.hhmm;
  const minutes = minutesToken === undefined ? 0 : Number(minutesToken);
  if (hours > 18 || minutes > 59) {
    return undefined;
  }
  let offsetMs = (hours * 60 + minutes) * 60_000;
  if (match.groups.sign === "-") {
    offsetMs = -offsetMs;
  }
  return { kind: "offset", offsetMs };
}

function utcComponents(moment: Date): WallTime {
  return {
    year: moment.getUTCFullYear(),
    month: moment.getUTCMonth() + 1,
    day: moment.getUTCDate(),
    hour: moment.getUTCHours(),
    minute: moment.getUTCMinutes(),
    second: moment.getUTCSeconds(),
    millisecond: moment.getUTCMilliseconds(),
  };
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = ianaFormatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    ianaFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function readIanaWall(moment: Date, timeZone: string): WallTime {
  const parts = formatterFor(timeZone).formatToParts(moment);
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of parts) {
    values[part.type] = part.value;
  }
  let year = Number(values.year);
  let month = Number(values.month);
  let day = Number(values.day);
  let hour = Number(values.hour);
  if (hour === 24) {
    hour = 0;
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return {
    year,
    month,
    day,
    hour,
    minute: Number(values.minute),
    second: Number(values.second),
    millisecond: moment.getUTCMilliseconds(),
  };
}

/**
 * Convert a local wall time in `timeZone` to a UTC instant.
 *
 * Guess by treating the wall clock as UTC, then subtract the zone offset
 * at that instant and correct once if DST makes the offset change.
 */
function localizeIana(wall: WallTime, timeZone: string): Date {
  const utcGuess = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  );
  const offset1 = offsetAt(new Date(utcGuess), timeZone);
  let instant = utcGuess - offset1;
  const offset2 = offsetAt(new Date(instant), timeZone);
  if (offset1 !== offset2) {
    instant = utcGuess - offset2;
  }
  return new Date(instant);
}

/** Local-minus-UTC offset in milliseconds at `instant`. */
function offsetAt(instant: Date, timeZone: string): number {
  const wall = readIanaWall(instant, timeZone);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  );
  return asUtc - instant.getTime();
}
