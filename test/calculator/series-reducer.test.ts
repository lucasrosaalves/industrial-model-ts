import { describe, expect, it } from "vitest";
import type { Series } from "../../src/calculator/models";
import { SeriesReducer } from "../../src/calculator/series-reducer";

const T0 = new Date("2024-01-01T00:00:00.000Z");
const T1 = new Date("2024-01-01T01:00:00.000Z");
const T2 = new Date("2024-01-01T02:00:00.000Z");

function series(...points: Array<[Date, number]>): Series {
  return points.map(([timestamp, value]) => ({ timestamp, value }));
}

function reduceSumViaAlignFilled(
  reducer: SeriesReducer,
  lines: Series[],
  fillValue: number,
): Series {
  const filled = reducer.alignFilled(
    lines,
    lines.map(() => fillValue),
  );
  const axis = filled[0] as Series;
  return axis.map((point, index) => ({
    timestamp: point.timestamp,
    value: filled.reduce((total, leaf) => total + (leaf[index] as { value: number }).value, 0),
  }));
}

describe("SeriesReducer: zero / one series (no reduction needed)", () => {
  it("empty series list returns empty list", () => {
    const reducer = new SeriesReducer();

    expect(reducer.reduce([], "sum")).toEqual([]);
  });

  it("single series is returned as a copy", () => {
    const reducer = new SeriesReducer();
    const input = series([T0, 1], [T1, 2]);

    const result = reducer.reduce([input], "sum");

    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });

  it("single series is returned unchanged even with reducer set", () => {
    // A reducer is meaningless with only one series, so it must be ignored
    // rather than applied or rejected.
    const reducer = new SeriesReducer();
    const input = series([T0, 1], [T1, 2]);

    expect(reducer.reduce([input], "max")).toEqual(input);
  });

  it("single empty series is returned unchanged", () => {
    const reducer = new SeriesReducer();

    expect(reducer.reduce([[]], "sum")).toEqual([]);
  });

  it("single series is normalized like a multi series reduction", () => {
    // Normalization must not depend on how many series were passed, otherwise
    // `{A}` and `{A} + {B}` would disagree about what "A" is.
    const reducer = new SeriesReducer();
    const input = series([T1, 2], [T0, 1], [T0, 9]);

    expect(reducer.reduce([input], "sum")).toEqual(series([T0, 9], [T1, 2]));
  });
});

describe("SeriesReducer: reducer correctness", () => {
  it("sum reducer adds values across series", () => {
    const reducer = new SeriesReducer();
    const seriesA = series([T0, 1], [T1, 2]);
    const seriesB = series([T0, 10], [T1, 20]);

    expect(reducer.reduce([seriesA, seriesB], "sum")).toEqual(series([T0, 11], [T1, 22]));
  });

  it("min reducer takes lowest value per timestamp", () => {
    const reducer = new SeriesReducer();

    const result = reducer.reduce([series([T0, 5]), series([T0, -3]), series([T0, 10])], "min");

    expect(result).toEqual(series([T0, -3]));
  });

  it("max reducer takes highest value per timestamp", () => {
    const reducer = new SeriesReducer();

    const result = reducer.reduce([series([T0, 5]), series([T0, -3]), series([T0, 10])], "max");

    expect(result).toEqual(series([T0, 10]));
  });

  it("average reducer takes mean value per timestamp", () => {
    const reducer = new SeriesReducer();

    const result = reducer.reduce([series([T0, 4]), series([T0, 10])], "average");

    expect(result).toEqual(series([T0, 7]));
  });

  it("average reducer over three series", () => {
    const reducer = new SeriesReducer();

    const result = reducer.reduce([series([T0, 3]), series([T0, 6]), series([T0, 9])], "average");

    expect(result).toEqual(series([T0, 6]));
  });

  it("reducer handles negative and fractional values", () => {
    const reducer = new SeriesReducer();

    const result = reducer.reduce([series([T0, -1.5]), series([T0, 2.5])], "sum");

    expect(result).toEqual(series([T0, 1]));
  });
});

describe("SeriesReducer: timestamp alignment edge cases", () => {
  it("only common timestamps survive reduction", () => {
    const reducer = new SeriesReducer();
    const seriesA = series([T0, 1], [T1, 2], [T2, 3]);
    const seriesB = series([T0, 10], [T2, 30]); // missing T1

    expect(reducer.reduce([seriesA, seriesB], "sum")).toEqual(series([T0, 11], [T2, 33]));
  });

  it("disjoint timestamps produce empty result", () => {
    const reducer = new SeriesReducer();

    expect(reducer.reduce([series([T0, 1]), series([T1, 2])], "sum")).toEqual([]);
  });

  it("one empty series among many produces empty result", () => {
    // An empty series has no timestamps, so its intersection with anything
    // else is empty too.
    const reducer = new SeriesReducer();

    expect(reducer.reduce([series([T0, 1], [T1, 2]), []], "sum")).toEqual([]);
  });

  it("all empty series produce empty result", () => {
    const reducer = new SeriesReducer();

    expect(reducer.reduce([[], []], "sum")).toEqual([]);
  });

  it("result is sorted by timestamp regardless of input order", () => {
    const reducer = new SeriesReducer();
    const seriesA = series([T2, 3], [T0, 1], [T1, 2]);
    const seriesB = series([T1, 20], [T2, 30], [T0, 10]);

    expect(reducer.reduce([seriesA, seriesB], "sum")).toEqual(series([T0, 11], [T1, 22], [T2, 33]));
  });

  it("reduction is symmetric regardless of series argument order", () => {
    const reducer = new SeriesReducer();
    const seriesA = series([T0, 5], [T1, 7]);
    const seriesB = series([T0, 1], [T1, 2]);

    const forward = reducer.reduce([seriesA, seriesB], "min");
    const backward = reducer.reduce([seriesB, seriesA], "min");

    expect(forward).toEqual(backward);
    expect(forward).toEqual(series([T0, 1], [T1, 2]));
  });

  it("duplicate timestamp within a series keeps the last value", () => {
    // Each series is collapsed into a timestamp -> value map before
    // reduction, so a repeated timestamp resolves to its last occurrence.
    const reducer = new SeriesReducer();
    const seriesA = series([T0, 1], [T0, 99]);
    const seriesB = series([T0, 10]);

    expect(reducer.reduce([seriesA, seriesB], "sum")).toEqual(series([T0, 109]));
  });

  it("four series reduced together", () => {
    const reducer = new SeriesReducer();
    const inputs = [1, 2, 3, 4].map((value) => series([T0, value]));

    expect(reducer.reduce(inputs, "sum")).toEqual(series([T0, 10]));
  });
});

describe("SeriesReducer: immutability", () => {
  it("reduce does not mutate input series", () => {
    const reducer = new SeriesReducer();
    const seriesA = series([T2, 3], [T0, 1]);
    const seriesB = series([T0, 10], [T2, 30]);
    const originalA = [...seriesA];
    const originalB = [...seriesB];

    reducer.reduce([seriesA, seriesB], "sum");

    expect(seriesA).toEqual(originalA);
    expect(seriesB).toEqual(originalB);
  });

  it("large gapped series intersect and sum", () => {
    const reducer = new SeriesReducer();
    const count = 20_000;
    const at = (index: number) => new Date(T0.getTime() + index * 1000);
    const seriesA: Series = [];
    const seriesB: Series = [];
    const seriesC: Series = [];
    for (let index = 0; index < count; index += 1) {
      if (index % 3 !== 0) {
        seriesA.push({ timestamp: at(index), value: index });
      }
      if (index % 5 !== 0) {
        seriesB.push({ timestamp: at(index), value: index * 10 });
      }
      if (index % 7 !== 0) {
        seriesC.push({ timestamp: at(index), value: index * 100 });
      }
    }

    const result = reducer.reduce([seriesA, seriesB, seriesC], "sum");

    const expectedIndexes: number[] = [];
    for (let index = 0; index < count; index += 1) {
      if (index % 3 !== 0 && index % 5 !== 0 && index % 7 !== 0) {
        expectedIndexes.push(index);
      }
    }
    expect(result.map((point) => point.timestamp.getTime())).toEqual(
      expectedIndexes.map((index) => at(index).getTime()),
    );
    expect(result.map((point) => point.value)).toEqual(
      expectedIndexes.map((index) => index + index * 10 + index * 100),
    );
  });
});

describe("SeriesReducer.align", () => {
  it("align filters each series to common timestamps", () => {
    const reducer = new SeriesReducer();
    const seriesA = series([T0, 1], [T1, 2], [T2, 3]);
    const seriesB = series([T0, 10], [T2, 30]);

    expect(reducer.align([seriesA, seriesB])).toEqual([
      series([T0, 1], [T2, 3]),
      series([T0, 10], [T2, 30]),
    ]);
  });

  it("align empty leaf makes every series empty", () => {
    const reducer = new SeriesReducer();

    expect(reducer.align([series([T0, 1], [T1, 2]), []])).toEqual([[], []]);
  });

  it("align single series returns a copy", () => {
    const reducer = new SeriesReducer();
    const input = series([T0, 1], [T1, 2]);

    const aligned = reducer.align([input]);

    expect(aligned).toEqual([input]);
    expect(aligned[0]).not.toBe(input);
  });

  it("align normalizes a single series", () => {
    const reducer = new SeriesReducer();
    const input = series([T1, 2], [T0, 1], [T0, 9]);

    expect(reducer.align([input])).toEqual([series([T0, 9], [T1, 2])]);
  });

  it("align does not mutate input series", () => {
    const reducer = new SeriesReducer();
    const seriesA = series([T2, 3], [T0, 1]);
    const seriesB = series([T0, 10], [T2, 30]);
    const originalA = [...seriesA];
    const originalB = [...seriesB];

    reducer.align([seriesA, seriesB]);

    expect(seriesA).toEqual(originalA);
    expect(seriesB).toEqual(originalB);
  });
});

describe("SeriesReducer: reduce with a fill value", () => {
  it("combines on the union of timestamps", () => {
    const reducer = new SeriesReducer();
    const lineA = series([T0, 5], [T1, 5], [T2, 5]);
    const lineB = series([T0, 3], [T2, 3]);

    const result = reducer.reduce([lineA, lineB], "sum", 0);

    // T1 keeps line A's count instead of being dropped.
    expect(result).toEqual(series([T0, 8], [T1, 5], [T2, 8]));
  });

  it("keeps a series when another is empty", () => {
    const reducer = new SeriesReducer();
    const lineA = series([T0, 5], [T1, 5]);

    expect(reducer.reduce([lineA, []], "sum", 0)).toEqual(lineA);
  });

  it("non-zero fill counts empty series toward the sum", () => {
    const reducer = new SeriesReducer();
    const lineA = series([T0, 10], [T1, 20]);

    expect(reducer.reduce([lineA, []], "sum", 5)).toEqual(series([T0, 15], [T1, 25]));
    expect(reducer.reduce([lineA, []], "sum", 5)).toEqual(
      reduceSumViaAlignFilled(reducer, [lineA, []], 5),
    );
  });

  it("fills before reducing", () => {
    const reducer = new SeriesReducer();
    const a = series([T0, 4], [T1, 6]);
    const b = series([T1, 2]);

    expect(reducer.reduce([a, b], "average", 0)).toEqual(series([T0, 2], [T1, 4]));
    expect(reducer.reduce([a, b], "min", -1)).toEqual(series([T0, -1], [T1, 2]));
  });

  it("empty series reduce to an empty series", () => {
    expect(new SeriesReducer().reduce([[], []], "sum", 0)).toEqual([]);
  });

  it.each([0, -1, 5])(
    "filled sum matches union grid (fillValue=%s)",
    (fillValue) => {
      const reducer = new SeriesReducer();
      const base = new Date("2024-06-01T00:00:00.000Z");
      const lines: Series[] = Array.from({ length: 40 }, (_, n) =>
        Array.from({ length: Math.ceil(120 / (3 + (n % 4))) }, (_, i) => {
          const minutes = i * (3 + (n % 4));
          return {
            timestamp: new Date(base.getTime() + minutes * 60_000),
            value: minutes % 7,
          };
        }),
      );
      expect(reducer.reduce(lines, "sum", fillValue)).toEqual(
        reduceSumViaAlignFilled(reducer, lines, fillValue),
      );
    },
  );

  it.each([0, 3])("filled sum with some empty inputs (fillValue=%s)", (fillValue) => {
    const reducer = new SeriesReducer();
    const base = new Date("2024-06-01T00:00:00.000Z");
    const hour = 60 * 60_000;
    const lines: Series[] = [
      series([base, 1], [new Date(base.getTime() + hour), 2]),
      [],
      series([new Date(base.getTime() + hour), 4]),
      [],
    ];

    expect(reducer.reduce(lines, "sum", fillValue)).toEqual(
      reduceSumViaAlignFilled(reducer, lines, fillValue),
    );
  });
});

describe("SeriesReducer: alignFilled", () => {
  it("fills a series missing a required timestamp", () => {
    const reducer = new SeriesReducer();
    const required = series([T0, 10], [T1, 20], [T2, 30]);
    const counts = series([T1, 5]);

    const aligned = reducer.alignFilled([required, counts], [undefined, 0]);

    expect(aligned).toEqual([
      series([T0, 10], [T1, 20], [T2, 30]),
      series([T0, 0], [T1, 5], [T2, 0]),
    ]);
  });

  it("never adds a timestamp a required series lacks", () => {
    const reducer = new SeriesReducer();
    const required = series([T1, 20]);
    const counts = series([T0, 1], [T1, 2], [T2, 3]);

    const aligned = reducer.alignFilled([required, counts], [undefined, 0]);

    expect(aligned).toEqual([series([T1, 20]), series([T1, 2])]);
  });

  it("intersects required series", () => {
    const reducer = new SeriesReducer();
    const a = series([T0, 1], [T1, 2]);
    const b = series([T1, 3], [T2, 4]);
    const c = series();

    const aligned = reducer.alignFilled([a, b, c], [undefined, undefined, 9]);

    expect(aligned).toEqual([series([T1, 2]), series([T1, 3]), series([T1, 9])]);
  });

  it("uses the union when every series fills", () => {
    const reducer = new SeriesReducer();
    const a = series([T2, 1], [T0, 2]);
    const b = series([T1, 3]);

    const aligned = reducer.alignFilled([a, b], [0, -1]);

    expect(aligned).toEqual([
      series([T0, 2], [T1, 0], [T2, 1]),
      series([T0, -1], [T1, 3], [T2, -1]),
    ]);
  });

  it("an empty required series aligns to empty", () => {
    const reducer = new SeriesReducer();

    const aligned = reducer.alignFilled([series(), series([T0, 1])], [undefined, 0]);

    expect(aligned).toEqual([[], []]);
  });

  it("keeps the last value of a duplicate timestamp", () => {
    const reducer = new SeriesReducer();

    const aligned = reducer.alignFilled([series([T0, 1], [T0, 2]), series()], [undefined, 0]);

    expect(aligned).toEqual([series([T0, 2]), series([T0, 0])]);
  });

  it("rejects mismatched fill values", () => {
    const reducer = new SeriesReducer();

    expect(() => reducer.alignFilled([series([T0, 1])], [])).toThrow(/fill value/);
  });

  it("returns series that already share timestamps", () => {
    const reducer = new SeriesReducer();
    const a = series([T0, 1], [T1, 2]);
    const b = series([T0, 3], [T1, 4]);

    expect(reducer.alignFilled([a, b], [undefined, 0])).toEqual([a, b]);
  });
});
