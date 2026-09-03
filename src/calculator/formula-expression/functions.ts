/** Simple moving average over the last ``window`` points (partial prefix).
 *
 * At index ``i`` the result is the mean of ``values[max(0, i-window+1):i+1]``.
 * The output is always the same length as ``values``. ``window`` is assumed
 * to be a positive integer (enforced at compile time).
 */
export function rollingAverage(values: readonly number[], window: number): number[] {
  const length = values.length;
  if (length === 0) {
    return [];
  }

  const cumulative = new Array<number>(length + 1);
  cumulative[0] = 0;
  for (let index = 0; index < length; index += 1) {
    cumulative[index + 1] = (cumulative[index] as number) + (values[index] as number);
  }

  const result = new Array<number>(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.max(0, index - window + 1);
    result[index] =
      ((cumulative[index + 1] as number) - (cumulative[start] as number)) / (index - start + 1);
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
