import { describe, expect, it, vi } from "vitest";
import { Calculator } from "../../src/calculator/calculator";
import {
  MissingTimeAxisError,
  ParameterError,
  ParameterTimestampError,
} from "../../src/calculator/formula-expression";
import type {
  CalculationResult,
  CalculatorParameter,
  CalculatorQuery,
  ConstantParameter,
  MultiTimeSeriesParameter,
  ReducerType,
  TimeSeriesParameter,
} from "../../src/calculator/models";
import type { CognitePort } from "../../src/cognite";
import type { DatapointAggregate, NodeId } from "../../src/types";
import { makeCogniteClientMock, makeCogniteMock } from "../fixtures/index.js";

const TS_A = { space: "ts-space", externalId: "temperature" };
const TS_B = { space: "ts-space", externalId: "pressure" };
const START = new Date("2024-01-01T00:00:00.000Z");
const END = new Date("2024-01-02T00:00:00.000Z");
const T0 = new Date("2024-01-01T00:00:00.000Z");
const T1 = new Date("2024-01-01T01:00:00.000Z");
const T2 = new Date("2024-01-01T02:00:00.000Z");
const T3 = new Date("2024-01-01T03:00:00.000Z");

function makeSeries(points: Array<[Date, number | string]>) {
  return {
    isString: false,
    datapoints: points.map(([timestamp, value]) => ({ timestamp, value })),
  };
}

function makeAggregateSeries(aggregate: DatapointAggregate, points: Array<[Date, number]>) {
  return {
    isString: false,
    datapoints: points.map(([timestamp, value]) => ({ timestamp, [aggregate]: value })),
  };
}

function makeCalculator(resultItems: unknown[]): {
  calculator: Calculator;
  cognite: CognitePort;
} {
  const cognite = makeCogniteMock();
  cognite.retrieveDatapoints = vi.fn().mockResolvedValue({ items: resultItems });
  return { calculator: new Calculator(cognite), cognite };
}

function param(timeSeries: NodeId, alias: string): TimeSeriesParameter {
  return { type: "single_timeseries", timeSeries, alias };
}

function aggregateParam(
  timeSeries: NodeId,
  alias: string,
  aggregateType: DatapointAggregate,
  granularity: string,
): TimeSeriesParameter {
  return { type: "single_timeseries", timeSeries, alias, aggregateType, granularity };
}

function constant(alias: string, value: number): ConstantParameter {
  return { type: "constant", alias, value };
}

function multiParam(
  timeSeries: NodeId[],
  alias: string,
  reducer: ReducerType,
  aggregateType: DatapointAggregate = "average",
  granularity = "1h",
): MultiTimeSeriesParameter {
  return { type: "multi_timeseries", timeSeries, alias, reducer, aggregateType, granularity };
}

function query(
  formula: string,
  parameters: CalculatorParameter[],
  alignment?: "intersect" | "strict",
): CalculatorQuery {
  return alignment === undefined ? { formula, parameters } : { formula, parameters, alignment };
}

function requestItems(cognite: CognitePort) {
  return vi.mocked(cognite.retrieveDatapoints).mock.calls[0]?.[0]?.items ?? [];
}

function inputValues(result: CalculationResult): Record<string, number[]> {
  return Object.fromEntries(
    Object.entries(result.inputs).map(([alias, series]) => [
      alias,
      series.map((point) => point.value),
    ]),
  );
}

function expectInputsShareResultTimestamps(result: CalculationResult): void {
  const timestamps = result.datapoints.map((point) => point.timestamp);
  for (const series of Object.values(result.inputs)) {
    expect(series.map((point) => point.timestamp)).toEqual(timestamps);
  }
}

describe("Calculator.calculate: happy paths", () => {
  it("returns evaluation result for simple formula", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
        [T2, 3],
      ]),
    ]);

    const result = await calculator.calculate(query("{A} * 2", [param(TS_A, "A")]), START, END);

    expect(result.datapoints.map((point) => point.value)).toEqual([2, 4, 6]);
  });

  it("rolling average keeps input alignment", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 10],
        [T1, 20],
        [T2, 30],
        [T3, 40],
      ]),
    ]);

    const result = await calculator.calculate(
      query("rolling_average({A}, 3)", [param(TS_A, "A")]),
      START,
      END,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([10, 15, 20, 30]);
    expect(inputValues(result)).toEqual({ A: [10, 20, 30, 40] });
    expectInputsShareResultTimestamps(result);
  });

  it("rolling average minus a second series stays aligned", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 10],
        [T1, 20],
        [T2, 30],
        [T3, 40],
      ]),
      makeSeries([
        [T0, 1],
        [T1, 2],
        [T2, 3],
        [T3, 4],
      ]),
    ]);

    const result = await calculator.calculate(
      query("rolling_average({A}, 3) - {B}", [param(TS_A, "A"), param(TS_B, "B")]),
      START,
      END,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([9, 13, 17, 26]);
    expect(inputValues(result)).toEqual({
      A: [10, 20, 30, 40],
      B: [1, 2, 3, 4],
    });
    expectInputsShareResultTimestamps(result);
  });

  it("passes window to client", async () => {
    const { calculator, cognite } = makeCalculator([makeSeries([[T0, 5]])]);

    await calculator.calculate(query("{A}", [param(TS_A, "A")]), START, END);

    const options = vi.mocked(cognite.retrieveDatapoints).mock.calls[0]?.[0];
    expect(options?.start).toBe(START);
    expect(options?.end).toBe(END);
  });

  it("multi parameter formula", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 10],
        [T1, 20],
      ]),
      makeSeries([
        [T0, 2],
        [T1, 4],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{A} / {B}", [param(TS_A, "A"), param(TS_B, "B")]),
      START,
      END,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([5, 5]);
  });

  it("with aggregate passes granularity in query", async () => {
    const { calculator, cognite } = makeCalculator([
      makeAggregateSeries("average", [
        [T0, 10],
        [T1, 20],
      ]),
    ]);

    await calculator.calculate(
      query("{A}", [aggregateParam(TS_A, "A", "average", "1h")]),
      START,
      END,
    );

    expect(requestItems(cognite)[0]?.granularity).toBe("1h");
  });

  it("non aggregate parameter has no granularity in query", async () => {
    const { calculator, cognite } = makeCalculator([makeSeries([[T0, 1]])]);

    await calculator.calculate(query("{A}", [param(TS_A, "A")]), START, END);

    expect(requestItems(cognite)[0]?.granularity).toBeUndefined();
  });

  it("returns empty result when data missing for parameter", async () => {
    // A time series with no data in the window is treated as an empty series.
    const { calculator } = makeCalculator([makeSeries([])]);
    const input = query("{A}", [param(TS_A, "A")]);

    const result = await calculator.calculate(input, START, END);

    expect(result).toEqual({ query: input, datapoints: [], inputs: { A: [] } });
  });

  it("supports conditional formulas end-to-end", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 10],
        [T1, 5],
      ]),
      makeSeries([
        [T0, 2],
        [T1, 0],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{A} / {B} if {B} != 0 else 0", [param(TS_A, "A"), param(TS_B, "B")]),
      START,
      END,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([5, 0]);
  });

  it("propagates arithmetic errors from the formula", async () => {
    const { calculator } = makeCalculator([makeSeries([[T0, 10]]), makeSeries([[T0, 0]])]);

    await expect(
      calculator.calculate(query("{A} / {B}", [param(TS_A, "A"), param(TS_B, "B")]), START, END),
    ).rejects.toThrow(/division by zero/);
  });

  it("accepts a raw CogniteClient and adapts it internally", async () => {
    const client = makeCogniteClientMock({
      datapointsRetrieveResponse: [
        {
          instanceId: { space: TS_A.space, externalId: TS_A.externalId },
          isString: false,
          datapoints: [{ timestamp: T0, value: 5 }],
        },
      ],
    });

    const calculator = new Calculator(client);
    const result = await calculator.calculate(query("{A} + 1", [param(TS_A, "A")]), START, END);

    expect(client.datapoints.retrieve).toHaveBeenCalledOnce();
    expect(result.datapoints).toEqual([{ timestamp: T0, value: 6 }]);
  });
});

describe("Calculator.calculate: deduplication", () => {
  it("deduplicates identical parameter requests", async () => {
    // Two parameters in one formula referencing the same time series (same
    // aggregate/granularity) should be fetched a single time.
    const { calculator, cognite } = makeCalculator([
      makeSeries([
        [T0, 3],
        [T1, 6],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{A} + {B}", [param(TS_A, "A"), param(TS_A, "B")]),
      START,
      END,
    );

    expect(cognite.retrieveDatapoints).toHaveBeenCalledOnce();
    expect(requestItems(cognite)).toHaveLength(1);
    expect(result.datapoints.map((point) => point.value)).toEqual([6, 12]);
  });

  it("raises on non numeric values in window", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, "bad"],
        [T2, 3],
      ]),
    ]);

    await expect(
      calculator.calculate(query("{A}", [param(TS_A, "A")]), START, END),
    ).rejects.toThrow(ParameterError);
  });
});

describe("Calculator.calculateMultiples", () => {
  it("returns one result per query", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
      ]),
      makeSeries([
        [T0, 10],
        [T1, 20],
      ]),
    ]);

    const results = await calculator.calculateMultiples(
      [query("{A} * 2", [param(TS_A, "A")]), query("{B} + 1", [param(TS_B, "B")])],
      START,
      END,
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.datapoints.map((point) => point.value)).toEqual([2, 4]);
    expect(results[1]?.datapoints.map((point) => point.value)).toEqual([11, 21]);
  });

  it("batches into single api call", async () => {
    const { calculator, cognite } = makeCalculator([makeSeries([[T0, 1]]), makeSeries([[T0, 2]])]);

    await calculator.calculateMultiples(
      [query("{A}", [param(TS_A, "A")]), query("{B}", [param(TS_B, "B")])],
      START,
      END,
    );

    expect(cognite.retrieveDatapoints).toHaveBeenCalledOnce();
    expect(requestItems(cognite)).toHaveLength(2);
  });

  it("deduplicates shared timeseries across queries", async () => {
    // Both queries reference the same time series - only one API request
    // should be made for it, but each query gets its own result.
    const { calculator, cognite } = makeCalculator([
      makeSeries([
        [T0, 5],
        [T1, 10],
      ]),
    ]);

    const results = await calculator.calculateMultiples(
      [query("{A} * 2", [param(TS_A, "A")]), query("{B} + 1", [param(TS_A, "B")])],
      START,
      END,
    );

    expect(requestItems(cognite)).toHaveLength(1);
    expect(results[0]?.datapoints.map((point) => point.value)).toEqual([10, 20]);
    expect(results[1]?.datapoints.map((point) => point.value)).toEqual([6, 11]);
  });

  it("empty queries returns empty list", async () => {
    const { calculator, cognite } = makeCalculator([]);

    const results = await calculator.calculateMultiples([], START, END);

    expect(results).toEqual([]);
    expect(cognite.retrieveDatapoints).not.toHaveBeenCalled();
  });

  it("multi parameter query", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 4],
        [T1, 8],
      ]),
      makeSeries([
        [T0, 2],
        [T1, 4],
      ]),
      makeSeries([
        [T0, 1],
        [T1, 2],
      ]),
    ]);

    const results = await calculator.calculateMultiples(
      [
        query("{A} / {B}", [param(TS_A, "A"), param(TS_B, "B")]),
        query("{C} * 3", [param({ space: "ts-space", externalId: "flow" }, "C")]),
      ],
      START,
      END,
    );

    expect(results[0]?.datapoints.map((point) => point.value)).toEqual([2, 2]);
    expect(results[1]?.datapoints.map((point) => point.value)).toEqual([3, 6]);
  });
});

describe("Calculator.calculate: constant parameters", () => {
  it("broadcasts constant parameter to series length", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
        [T2, 3],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{A} + {B}", [param(TS_A, "A"), constant("B", 10)]),
      START,
      END,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([11, 12, 13]);
  });

  it("broadcasts constant onto intersected timestamps", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
        [T2, 3],
      ]),
      makeSeries([[T0, 10]]),
    ]);

    const result = await calculator.calculate(
      query("{A} + {B} + {C}", [param(TS_A, "A"), param(TS_B, "B"), constant("C", 100)]),
      START,
      END,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([111]);
  });

  it("constant parameter can precede timeseries parameter", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{A} * {B}", [constant("B", 2), param(TS_A, "A")]),
      START,
      END,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([2, 4]);
  });

  it("all constant formula raises missing time axis", async () => {
    // Constants are broadcast onto the timestamps of the query's time-series
    // parameters. With no time-series parameter there is nothing to broadcast
    // onto, which would silently yield zero datapoints for a query that looks
    // valid - so it is rejected instead.
    const { calculator } = makeCalculator([]);

    await expect(
      calculator.calculate(query("{A} * 2", [constant("A", 5)]), START, END),
    ).rejects.toThrow(/no time-series parameter/);
  });

  it("missing time axis error lists every constant alias", async () => {
    const { calculator } = makeCalculator([]);

    await expect(
      calculator.calculate(query("{A} + {B}", [constant("A", 1), constant("B", 2)]), START, END),
    ).rejects.toMatchObject({
      name: "MissingTimeAxisError",
      aliases: ["A", "B"],
    });
  });

  it("multiple constants never reach the cdf client", async () => {
    const { calculator, cognite } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 1],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{A} + {B} + {C} + {D}", [
        constant("A", 2),
        constant("B", 3),
        constant("C", 4),
        param(TS_A, "D"),
      ]),
      START,
      END,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([10, 10]);
    // Only D's time series is ever requested - A, B, C never touch the client.
    expect(requestItems(cognite)).toHaveLength(1);
  });
});

describe("Calculator.calculate: multiple timeseries per parameter (reducers)", () => {
  it("reduces multiple timeseries with sum", async () => {
    const { calculator } = makeCalculator([
      makeAggregateSeries("average", [
        [T0, 1],
        [T1, 2],
      ]),
      makeAggregateSeries("average", [
        [T0, 10],
        [T1, 20],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{A}", [multiParam([TS_A, TS_B], "A", "sum")]),
      START,
      END,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([11, 22]);
  });

  it("reduces multiple timeseries with average", async () => {
    const { calculator } = makeCalculator([
      makeAggregateSeries("average", [[T0, 4]]),
      makeAggregateSeries("average", [[T0, 10]]),
    ]);

    const result = await calculator.calculate(
      query("{A}", [multiParam([TS_A, TS_B], "A", "average")]),
      START,
      END,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([7]);
  });

  it("multi instance parameter with no common timestamps is empty", async () => {
    // The two series never overlap on timestamp, so the reduced parameter
    // series is empty end-to-end, and so is the result.
    const { calculator } = makeCalculator([
      makeAggregateSeries("average", [[T0, 1]]),
      makeAggregateSeries("average", [[T1, 2]]),
    ]);
    const input = query("{A}", [multiParam([TS_A, TS_B], "A", "sum")]);

    const result = await calculator.calculate(input, START, END);

    expect(result).toEqual({ query: input, datapoints: [], inputs: { A: [] } });
  });

  it("timestamps come from reduced series not raw leaf series", async () => {
    // The first parameter is multi-instance: its two leaf series only agree
    // on one of their two timestamps, so the reduced series (and therefore
    // the output) has length 1, not the leaf series' length of 2.
    const TS_C = { space: "ts-space", externalId: "flow" };
    const { calculator } = makeCalculator([
      makeAggregateSeries("average", [
        [T0, 1],
        [T1, 2],
      ]),
      makeAggregateSeries("average", [[T0, 10]]),
      makeAggregateSeries("average", [[T0, 100]]),
    ]);

    const result = await calculator.calculate(
      query("{A} + {B}", [
        multiParam([TS_A, TS_B], "A", "sum"),
        aggregateParam(TS_C, "B", "average", "1h"),
      ]),
      START,
      END,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([111]);
  });

  it("calculateMultiples dedupes shared instance across multi params", async () => {
    // Two queries each reference a two-instance reduced parameter, and the
    // two parameters share one instance id (shared). That instance should be
    // fetched once, not twice.
    const shared = { space: "ts-space", externalId: "shared" };
    const aOnly = { space: "ts-space", externalId: "a-only" };
    const bOnly = { space: "ts-space", externalId: "b-only" };
    const { calculator, cognite } = makeCalculator([
      makeAggregateSeries("average", [[T0, 1]]),
      makeAggregateSeries("average", [[T0, 2]]),
      makeAggregateSeries("average", [[T0, 3]]),
    ]);

    const results = await calculator.calculateMultiples(
      [
        query("{A}", [multiParam([shared, aOnly], "A", "sum")]),
        query("{B}", [multiParam([shared, bOnly], "B", "sum")]),
      ],
      START,
      END,
    );

    // shared, a-only, b-only - not four requests.
    expect(requestItems(cognite)).toHaveLength(3);
    expect(results[0]?.datapoints.map((point) => point.value)).toEqual([3]);
    expect(results[1]?.datapoints.map((point) => point.value)).toEqual([4]);
  });
});

describe("Calculator.calculate: timestamp alignment", () => {
  it("calculateMultiples honors per query alignment", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
      ]),
      makeSeries([
        [T0, 10],
        [T1, 20],
      ]),
    ]);

    const [intersected, strict] = await calculator.calculateMultiples(
      [
        query("{A} + {B}", [param(TS_A, "A"), param(TS_B, "B")], "intersect"),
        query("{A} + {B}", [param(TS_A, "A"), param(TS_B, "B")], "strict"),
      ],
      START,
      END,
    );

    expect(intersected?.datapoints.map((point) => point.value)).toEqual([11, 22]);
    expect(strict?.datapoints.map((point) => point.value)).toEqual([11, 22]);
  });

  it("intersects mismatched series by default", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
        [T2, 3],
      ]),
      makeSeries([[T0, 10]]),
    ]);

    const result = await calculator.calculate(
      query("{A} + {B}", [param(TS_A, "A"), param(TS_B, "B")]),
      START,
      END,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([11]);
  });

  it("intersects same length series with different timestamps", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
      ]),
      makeSeries([
        [T1, 10],
        [T2, 20],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{A} + {B}", [param(TS_A, "A"), param(TS_B, "B")]),
      START,
      END,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([12]);
    expect(result.datapoints[0]?.timestamp).toEqual(T1);
  });

  it("intersect with no overlap is empty", async () => {
    const TS_C = { space: "ts-space", externalId: "flow" };
    const { calculator } = makeCalculator([
      makeAggregateSeries("average", [[T0, 1]]),
      makeAggregateSeries("average", [[T0, 10]]),
      makeAggregateSeries("average", [[T1, 100]]),
    ]);
    const input = query("{A} + {B}", [
      multiParam([TS_A, TS_B], "A", "sum"),
      aggregateParam(TS_C, "B", "average", "1h"),
    ]);

    const result = await calculator.calculate(input, START, END);

    expect(result).toEqual({ query: input, datapoints: [], inputs: { A: [], B: [] } });
  });

  it("strict alignment raises on mismatched series", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
        [T2, 3],
      ]),
      makeSeries([[T0, 1]]),
    ]);

    await expect(
      calculator.calculate(
        query("{A} + {B}", [param(TS_A, "A"), param(TS_B, "B")], "strict"),
        START,
        END,
      ),
    ).rejects.toThrow(/timestamp mismatch/);
  });

  it("strict alignment raises when same length but different times", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
      ]),
      makeSeries([
        [T1, 10],
        [T2, 20],
      ]),
    ]);

    await expect(
      calculator.calculate(
        query("{A} + {B}", [param(TS_A, "A"), param(TS_B, "B")], "strict"),
        START,
        END,
      ),
    ).rejects.toThrow(ParameterTimestampError);
  });

  it("intersects an unreferenced parameter into the time axis", async () => {
    // A is not referenced by the formula and has more points than B. Unlike a
    // "referenced parameters only" rule, intersection still applies to it, so
    // the axis is A and B's common timestamps.
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 100],
        [T1, 100],
        [T2, 100],
      ]),
      makeSeries([
        [T0, 7],
        [T1, 7],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{B} + 1", [param(TS_A, "A"), param(TS_B, "B")]),
      START,
      END,
    );

    expect(result.datapoints).toEqual([
      { timestamp: T0, value: 8 },
      { timestamp: T1, value: 8 },
    ]);
  });
});

describe("Calculator.calculate: composition", () => {
  it("calculateMultiples with a constants-only query in the batch raises without fetching it", async () => {
    const { calculator, cognite } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
      ]),
      makeSeries([
        [T0, 10],
        [T1, 20],
      ]),
    ]);

    await expect(
      calculator.calculateMultiples(
        [
          query("{A} + {B}", [param(TS_A, "A"), param(TS_B, "B")]),
          query("{C}", [constant("C", 5)]),
        ],
        START,
        END,
      ),
    ).rejects.toMatchObject({
      name: "MissingTimeAxisError",
      aliases: ["C"],
    });
    // The constant query must not add a phantom series to the retrieve call.
    expect(requestItems(cognite)).toHaveLength(2);
  });

  it("calculateMultiples slices retrieved series by time-series count not parameter count", async () => {
    // Query 1 has two parameters but only one time series (the other is a
    // constant). If the batch sliced by parameters.length, query 2 would
    // inherit the leftover series and evaluate against the wrong data.
    const TS_C = { space: "ts-space", externalId: "flow" };
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 3],
        [T1, 4],
      ]),
      makeSeries([
        [T0, 10],
        [T1, 20],
      ]),
      makeSeries([
        [T0, 1],
        [T1, 2],
      ]),
    ]);

    const results = await calculator.calculateMultiples(
      [
        query("{A} * {K}", [constant("K", 10), param(TS_A, "A")]),
        query("{B} + {C}", [param(TS_B, "B"), param(TS_C, "C")]),
      ],
      START,
      END,
    );

    expect(results[0]?.datapoints.map((point) => point.value)).toEqual([30, 40]);
    expect(results[1]?.datapoints.map((point) => point.value)).toEqual([11, 22]);
  });

  it("constant plus multi plus single with a gap reduce then intersect then broadcast", async () => {
    // Multi A only agrees with itself at T0; single B has T0 and T1; C is a
    // constant. The axis must be T0, and C must broadcast onto that one point.
    const TS_C = { space: "ts-space", externalId: "flow" };
    const { calculator } = makeCalculator([
      makeAggregateSeries("average", [
        [T0, 1],
        [T1, 2],
      ]),
      makeAggregateSeries("average", [[T0, 10]]),
      makeAggregateSeries("average", [
        [T0, 100],
        [T1, 200],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{A} + {B} + {C}", [
        multiParam([TS_A, TS_B], "A", "sum"),
        aggregateParam(TS_C, "B", "average", "1h"),
        constant("C", 5),
      ]),
      START,
      END,
    );

    expect(result.datapoints).toEqual([{ timestamp: T0, value: 116 }]);
  });

  it("strict alignment with three series lists only the mismatched aliases", async () => {
    const TS_C = { space: "ts-space", externalId: "flow" };
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
      ]),
      makeSeries([
        [T0, 10],
        [T1, 20],
      ]),
      makeSeries([[T0, 100]]),
    ]);

    await expect(
      calculator.calculate(
        query("{A} + {B} + {C}", [param(TS_A, "A"), param(TS_B, "B"), param(TS_C, "C")], "strict"),
        START,
        END,
      ),
    ).rejects.toMatchObject({
      name: "ParameterTimestampError",
      aliases: ["A", "C"],
    });
  });

  it("strict alignment does not normalize unsorted timestamps", async () => {
    // A and B share the same timestamps but not the same order. Intersect
    // would sort them onto one axis; strict compares index-by-index and
    // must fail rather than silently reorder.
    const { calculator } = makeCalculator([
      makeSeries([
        [T1, 2],
        [T0, 1],
      ]),
      makeSeries([
        [T0, 10],
        [T1, 20],
      ]),
    ]);

    await expect(
      calculator.calculate(
        query("{A} + {B}", [param(TS_A, "A"), param(TS_B, "B")], "strict"),
        START,
        END,
      ),
    ).rejects.toThrow(ParameterTimestampError);
  });

  it("duplicate timestamps on a single series are collapsed before intersecting", async () => {
    // Last-value-wins lives in align, not only inside reduce: A has two
    // points at T0, and the later one must be the value that meets B.
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T0, 99],
        [T1, 2],
      ]),
      makeSeries([
        [T0, 10],
        [T1, 20],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{A} + {B}", [param(TS_A, "A"), param(TS_B, "B")]),
      START,
      END,
    );

    expect(result.datapoints).toEqual([
      { timestamp: T0, value: 109 },
      { timestamp: T1, value: 22 },
    ]);
  });
});

describe("Calculator.calculate: inputs (aligned values used by the formula)", () => {
  it("are the series passed to the formula", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
        [T2, 3],
      ]),
    ]);

    const result = await calculator.calculate(query("{A} * 2", [param(TS_A, "A")]), START, END);

    expect(inputValues(result)).toEqual({ A: [1, 2, 3] });
    expect(result.datapoints.map((point) => point.value)).toEqual([2, 4, 6]);
    expectInputsShareResultTimestamps(result);
  });

  it("include every parameter at aligned indexes", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 10],
        [T1, 20],
      ]),
      makeSeries([
        [T0, 2],
        [T1, 4],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{A} / {B}", [param(TS_A, "A"), param(TS_B, "B")]),
      START,
      END,
    );

    expect(inputValues(result)).toEqual({ A: [10, 20], B: [2, 4] });
    for (const [index, point] of result.datapoints.entries()) {
      const a = result.inputs.A?.[index]?.value;
      const b = result.inputs.B?.[index]?.value;
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(point.value).toBe((a as number) / (b as number));
    }
    expectInputsShareResultTimestamps(result);
  });

  it("are the intersected values, not the raw series", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
        [T2, 3],
      ]),
      makeSeries([[T0, 10]]),
    ]);

    const result = await calculator.calculate(
      query("{A} + {B}", [param(TS_A, "A"), param(TS_B, "B")]),
      START,
      END,
    );

    // Only the shared timestamp survives alignment, so inputs drop A's extra points.
    expect(inputValues(result)).toEqual({ A: [1], B: [10] });
    expect(result.datapoints.map((point) => point.value)).toEqual([11]);
    expectInputsShareResultTimestamps(result);
  });

  it("broadcast constants to the aligned length", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
        [T2, 3],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{A} + {B}", [param(TS_A, "A"), constant("B", 10)]),
      START,
      END,
    );

    expect(inputValues(result)).toEqual({ A: [1, 2, 3], B: [10, 10, 10] });
    expectInputsShareResultTimestamps(result);
  });

  it("use the reduced series for multi timeseries", async () => {
    const { calculator } = makeCalculator([
      makeAggregateSeries("average", [
        [T0, 1],
        [T1, 2],
      ]),
      makeAggregateSeries("average", [
        [T0, 10],
        [T1, 20],
      ]),
    ]);

    const result = await calculator.calculate(
      query("{A}", [multiParam([TS_A, TS_B], "A", "sum")]),
      START,
      END,
    );

    expect(inputValues(result)).toEqual({ A: [11, 22] });
    expect(result.datapoints.map((point) => point.value)).toEqual([11, 22]);
    expectInputsShareResultTimestamps(result);
  });

  it("calculateMultiples inputs are scoped to each query", async () => {
    const { calculator } = makeCalculator([
      makeSeries([
        [T0, 1],
        [T1, 2],
      ]),
      makeSeries([
        [T0, 10],
        [T1, 20],
      ]),
    ]);

    const results = await calculator.calculateMultiples(
      [query("{A} * 2", [param(TS_A, "A")]), query("{B} + 1", [param(TS_B, "B")])],
      START,
      END,
    );

    expect(results).toHaveLength(2);
    expect(inputValues(results[0] as CalculationResult)).toEqual({ A: [1, 2] });
    expect(inputValues(results[1] as CalculationResult)).toEqual({ B: [10, 20] });
    expectInputsShareResultTimestamps(results[0] as CalculationResult);
    expectInputsShareResultTimestamps(results[1] as CalculationResult);
  });
});

describe("Calculator error types", () => {
  it("exposes MissingTimeAxisError and ParameterTimestampError as ParameterErrors", () => {
    expect(new MissingTimeAxisError(["A"])).toBeInstanceOf(ParameterError);
    expect(new ParameterTimestampError(["A", "B"])).toBeInstanceOf(ParameterError);
  });
});
