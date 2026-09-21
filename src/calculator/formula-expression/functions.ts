/** Simple moving average over the last ``window`` points (partial prefix).
 *
 * At index ``i`` the result is the mean of the finite values in
 * ``values[max(0, i-window+1):i+1]``. ``NaN`` entries are skipped so a
 * time-grid with missing buckets still averages the points that exist.
 * An all-``NaN`` window yields ``NaN``. The output is always the same
 * length as ``values``. ``window`` is assumed to be a positive integer
 * (enforced at compile time).
 */
export function rollingAverage(values: readonly number[], window: number): number[] {
  const length = values.length;
  if (length === 0) {
    return [];
  }

  const cumulative = new Array<number>(length + 1);
  const counts = new Array<number>(length + 1);
  cumulative[0] = 0;
  counts[0] = 0;
  for (let index = 0; index < length; index += 1) {
    const value = values[index] as number;
    if (Number.isNaN(value)) {
      cumulative[index + 1] = cumulative[index] as number;
      counts[index + 1] = counts[index] as number;
    } else {
      cumulative[index + 1] = (cumulative[index] as number) + value;
      counts[index + 1] = (counts[index] as number) + 1;
    }
  }

  const result = new Array<number>(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.max(0, index - window + 1);
    const count = (counts[index + 1] as number) - (counts[start] as number);
    result[index] =
      count === 0
        ? Number.NaN
        : ((cumulative[index + 1] as number) - (cumulative[start] as number)) / count;
  }
  return result;
}

export type FunctionSpec = {
  readonly arity: number;
  readonly windowArg: number | null;
  readonly apply: (values: readonly number[], window: number) => number[];
};

export const ALLOWED_FUNCTIONS: Readonly<Record<string, FunctionSpec>> = {
  rolling_average: {
    arity: 2,
    windowArg: 1,
    apply: rollingAverage,
  },
};
