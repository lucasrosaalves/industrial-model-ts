import type { DataPoint, ReducerType, Series } from "./models";

/** Returns a time-ordered series; duplicate timestamps keep the last value. */
function prepare(leaf: Series): Series {
  if (leaf.length < 2) {
    return leaf;
  }

  let sortedOk = true;
  let hasDuplicates = false;
  let previous = (leaf[0] as DataPoint).timestamp.getTime();
  for (let index = 1; index < leaf.length; index += 1) {
    const timestamp = (leaf[index] as DataPoint).timestamp.getTime();
    if (timestamp < previous) {
      sortedOk = false;
      break;
    }
    if (timestamp === previous) {
      hasDuplicates = true;
    }
    previous = timestamp;
  }

  if (sortedOk && !hasDuplicates) {
    return leaf;
  }

  const ordered = sortedOk
    ? leaf
    : [...leaf].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());

  const collapsed: Series = [ordered[0] as DataPoint];
  for (let index = 1; index < ordered.length; index += 1) {
    const point = ordered[index] as DataPoint;
    const last = collapsed[collapsed.length - 1] as DataPoint;
    if (last.timestamp.getTime() === point.timestamp.getTime()) {
      collapsed[collapsed.length - 1] = point;
    } else {
      collapsed.push(point);
    }
  }
  return collapsed;
}

type AlignedRow = { timestamp: Date; values: number[] };

/**
 * Walks several prepared series in lockstep, yielding only the timestamps
 * present in every one of them, in ascending order.
 */
function* iterAlignedRows(prepared: Series[]): Generator<AlignedRow> {
  const count = prepared.length;
  const times = prepared.map((series) => series.map((point) => point.timestamp.getTime()));
  const cursors = new Array<number>(count).fill(0);

  while (true) {
    let latest = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < count; index += 1) {
      const time = (times[index] as number[])[cursors[index] as number];
      if (time === undefined) {
        return;
      }
      if (time > latest) {
        latest = time;
      }
    }

    // Advance every series to the latest head timestamp. A series that
    // overshoots it means no row exists there; the next pass then computes a
    // higher `latest`, which is what guarantees forward progress.
    let aligned = true;
    for (let index = 0; index < count; index += 1) {
      const seriesTimes = times[index] as number[];
      let cursor = cursors[index] as number;
      while (cursor < seriesTimes.length && (seriesTimes[cursor] as number) < latest) {
        cursor += 1;
      }
      cursors[index] = cursor;
      if (seriesTimes[cursor] !== latest) {
        aligned = false;
        break;
      }
    }
    if (!aligned) {
      continue;
    }

    const values = new Array<number>(count);
    let timestamp = new Date(latest);
    for (let index = 0; index < count; index += 1) {
      const point = (prepared[index] as Series)[cursors[index] as number] as DataPoint;
      values[index] = point.value;
      if (index === 0) {
        timestamp = point.timestamp;
      }
    }
    yield { timestamp, values };

    for (let index = 0; index < count; index += 1) {
      cursors[index] = (cursors[index] as number) + 1;
    }
  }
}

function shareTimestamps(prepared: Series[]): boolean {
  const first = prepared[0] as Series;
  return prepared
    .slice(1)
    .every(
      (leaf) =>
        leaf.length === first.length &&
        leaf.every(
          (point, index) =>
            point.timestamp.getTime() === (first[index] as DataPoint).timestamp.getTime(),
        ),
    );
}

function reduceValues(values: number[], reducer: ReducerType): number {
  switch (reducer) {
    case "min": {
      let result = values[0] as number;
      for (const value of values) {
        if (value < result) {
          result = value;
        }
      }
      return result;
    }
    case "max": {
      let result = values[0] as number;
      for (const value of values) {
        if (value > result) {
          result = value;
        }
      }
      return result;
    }
    case "sum":
      return sum(values);
    case "average":
      return sum(values) / values.length;
  }
}

function sum(values: number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

/**
 * Sum several series on the union of their timestamps without a full grid.
 *
 * A missing point counts as `fillValue`, including series that are empty
 * (they never have a point). Empty input series still count toward how many
 * fills apply at each timestamp.
 */
function reduceSumFilled(series: Series[], fillValue: number): Series {
  const prepared = series.filter((leaf) => leaf.length > 0).map((leaf) => prepare([...leaf]));
  if (prepared.length === 0) {
    return [];
  }

  const nSeries = series.length;
  const totals = new Map<number, number>();
  const present = new Map<number, number>();
  const timestamps = new Map<number, Date>();

  for (const leaf of prepared) {
    for (const point of leaf) {
      const time = point.timestamp.getTime();
      totals.set(time, (totals.get(time) ?? 0) + point.value);
      present.set(time, (present.get(time) ?? 0) + 1);
      if (!timestamps.has(time)) {
        timestamps.set(time, point.timestamp);
      }
    }
  }
  if (totals.size === 0) {
    return [];
  }
  if (fillValue === 0) {
    return [...totals.entries()]
      .sort(([left], [right]) => left - right)
      .map(([time, value]) => ({ timestamp: timestamps.get(time) as Date, value }));
  }
  return [...totals.keys()]
    .sort((left, right) => left - right)
    .map((time) => ({
      timestamp: timestamps.get(time) as Date,
      value: (totals.get(time) as number) + fillValue * (nSeries - (present.get(time) as number)),
    }));
}

/**
 * Combines or aligns multiple time series by intersecting on timestamp.
 *
 * A timestamp survives only when every input series has a value for it.
 * This is stricter than a positional zip: it tolerates series with gaps or
 * misaligned points instead of silently pairing up unrelated values.
 *
 * Every input is normalized first (sorted by timestamp, duplicate timestamps
 * collapsed to their last value), including when a single series is passed, so
 * the output does not depend on how many series the caller happened to supply.
 */
export class SeriesReducer {
  /**
   * Combines several series into one on their common timestamps.
   *
   * With `fillValue`, combines on the union of their timestamps instead: a
   * series without a point at a timestamp counts as `fillValue` there (`0`
   * for a count summed across lines).
   */
  reduce(series: Series[], reducer: ReducerType, fillValue?: number): Series {
    if (series.length === 0) {
      return [];
    }
    if (series.length === 1) {
      return prepare([...(series[0] as Series)]);
    }
    if (fillValue !== undefined) {
      if (reducer === "sum") {
        return reduceSumFilled(series, fillValue);
      }
      const filled = this.alignFilled(series, new Array(series.length).fill(fillValue));
      return (filled[0] as Series).map((point, index) => ({
        timestamp: point.timestamp,
        value: reduceValues(
          filled.map((leaf) => (leaf[index] as DataPoint).value),
          reducer,
        ),
      }));
    }
    if (series.some((leaf) => leaf.length === 0)) {
      return [];
    }

    const result: Series = [];
    for (const row of iterAlignedRows(series.map(prepare))) {
      result.push({ timestamp: row.timestamp, value: reduceValues(row.values, reducer) });
    }
    return result;
  }

  /** Filters each series to the timestamps present in every series. */
  align(series: Series[]): Series[] {
    if (series.length === 0) {
      return [];
    }
    if (series.length === 1) {
      return [prepare([...(series[0] as Series)])];
    }
    if (series.some((leaf) => leaf.length === 0)) {
      return series.map(() => []);
    }

    const aligned: Series[] = series.map(() => []);
    for (const row of iterAlignedRows(series.map(prepare))) {
      for (let index = 0; index < row.values.length; index += 1) {
        (aligned[index] as Series).push({
          timestamp: row.timestamp,
          value: row.values[index] as number,
        });
      }
    }
    return aligned;
  }

  /**
   * Aligns on the union of timestamps, filling where a value is given.
   *
   * A timestamp is kept when every series without a fill value has a point
   * there; a series with a fill value uses it where it has none. When every
   * series has a fill value, the axis is the union of all their timestamps.
   */
  alignFilled(series: Series[], fillValues: ReadonlyArray<number | undefined>): Series[] {
    if (fillValues.length !== series.length) {
      throw new Error(`got ${fillValues.length} fill value(s) for ${series.length} series`);
    }
    if (series.length === 0) {
      return [];
    }

    const prepared = series.map((leaf) => prepare([...leaf]));
    if (shareTimestamps(prepared)) {
      // Nothing to fill: the usual case for series on one minute grid.
      return prepared;
    }

    const byTimestamp: Array<Map<number, number>> = prepared.map(
      (leaf) => new Map(leaf.map((point) => [point.timestamp.getTime(), point.value])),
    );
    const required = byTimestamp.filter((_values, index) => fillValues[index] === undefined);
    let axis: number[];
    if (required.length > 0) {
      // A kept timestamp is in every required series, so the smallest one
      // holds every candidate.
      let sparsest = required[0] as Map<number, number>;
      for (const values of required) {
        if (values.size < sparsest.size) {
          sparsest = values;
        }
      }
      axis = [...sparsest.keys()];
    } else {
      axis = [...new Set(byTimestamp.flatMap((values) => [...values.keys()]))];
    }
    axis.sort((left, right) => left - right);

    const aligned: Series[] = series.map(() => []);
    for (const time of axis) {
      if (required.some((values) => !values.has(time))) {
        continue;
      }
      const timestamp = new Date(time);
      byTimestamp.forEach((values, index) => {
        (aligned[index] as Series).push({
          timestamp,
          value: values.get(time) ?? (fillValues[index] as number),
        });
      });
    }
    return aligned;
  }
}
