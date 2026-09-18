import { describe, expect, it, vi } from "vitest";
import { Calculator } from "../../src/calculator/calculator";
import { ParameterTimestampError } from "../../src/calculator/formula-expression";
import type {
  CalculatorParameter,
  CalculatorQuery,
  TimeSeriesParameter,
} from "../../src/calculator/models";
import type { CognitePort } from "../../src/cognite";
import { makeCogniteMock } from "../fixtures/index.js";

const START = new Date("2024-01-01T07:10:00.000Z");

function minutesAfter(offset: number): Date {
  return new Date(START.getTime() + offset * 60_000);
}

function makeAggregateSeries(points: Array<[Date, number]>) {
  return {
    isString: false,
    datapoints: points.map(([timestamp, value]) => ({ timestamp, sum: value })),
  };
}

function makeRawSeries(points: Array<[Date, number]>) {
  return {
    isString: false,
    datapoints: points.map(([timestamp, value]) => ({ timestamp, value })),
  };
}

function makeCalculator(resultItems: unknown[]): Calculator {
  const cognite = makeCogniteMock();
  cognite.retrieveDatapoints = vi.fn().mockResolvedValue({ items: resultItems });
  return new Calculator(cognite as CognitePort);
}

function param(alias: string, externalId: string, granularity?: string): TimeSeriesParameter {
  return granularity === undefined
    ? { type: "single_timeseries", alias, timeSeries: { space: "s", externalId } }
    : {
        type: "single_timeseries",
        alias,
        timeSeries: { space: "s", externalId },
        aggregateType: "sum",
        granularity,
      };
}

function query(
  formula: string,
  parameters: CalculatorParameter[],
  alignment?: "strict",
): CalculatorQuery {
  return alignment === undefined ? { formula, parameters } : { formula, parameters, alignment };
}

function gapTimestamps(): Date[] {
  return [0, 1, 2, 6, 7, 8].map(minutesAfter);
}

describe("Calculator rolling average grid fill", () => {
  it("fills missing minute buckets", async () => {
    const end = minutesAfter(9);
    const series = makeAggregateSeries(
      gapTimestamps().map((timestamp, index) => {
        const values = [10, 20, 30, 100, 110, 120];
        return [timestamp, values[index] as number];
      }),
    );

    const result = await makeCalculator([series]).calculate(
      query("rolling_average({GQ}, 3)", [param("GQ", "ts1", "1m")]),
      START,
      end,
    );

    const expectedMinutes = [0, 1, 2, 3, 4, 6, 7, 8];
    expect(result.datapoints.map((point) => point.timestamp)).toEqual(
      expectedMinutes.map(minutesAfter),
    );
    expect(result.datapoints.map((point) => point.value)).toEqual([
      10, 15, 20, 25, 30, 100, 105, 110,
    ]);
    const gq = result.inputs.GQ?.map((point) => point.value) ?? [];
    expect(gq.slice(0, 3)).toEqual([10, 20, 30]);
    expect(gq[3]).toBeNaN();
    expect(gq[4]).toBeNaN();
    expect(gq.slice(5)).toEqual([100, 110, 120]);
    expect(result.inputs.GQ?.map((point) => point.timestamp)).toEqual(
      result.datapoints.map((point) => point.timestamp),
    );
  });

  it("emits trailing partial windows", async () => {
    const end = minutesAfter(12);
    const series = makeAggregateSeries(
      gapTimestamps().map((timestamp, index) => {
        const values = [10, 20, 30, 100, 110, 120];
        return [timestamp, values[index] as number];
      }),
    );

    const result = await makeCalculator([series]).calculate(
      query("rolling_average({GQ}, 3)", [param("GQ", "ts1", "1m")]),
      START,
      end,
    );

    const byMinute = new Map(
      result.datapoints.map((point) => [point.timestamp.getTime(), point.value]),
    );
    expect(byMinute.get(minutesAfter(6).getTime())).toBe(100);
    expect(byMinute.get(minutesAfter(7).getTime())).toBe(105);
    expect(byMinute.get(minutesAfter(8).getTime())).toBe(110);
    expect(byMinute.get(minutesAfter(9).getTime())).toBe(115);
    expect(byMinute.get(minutesAfter(10).getTime())).toBe(120);
    expect(byMinute.has(minutesAfter(11).getTime())).toBe(false);
  });

  it("stays count-based without granularity", async () => {
    const end = minutesAfter(9);
    const series = makeRawSeries(
      gapTimestamps().map((timestamp, index) => {
        const values = [10, 20, 30, 100, 110, 120];
        return [timestamp, values[index] as number];
      }),
    );

    const result = await makeCalculator([series]).calculate(
      query("rolling_average({A}, 3)", [param("A", "ts1")]),
      START,
      end,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([10, 15, 20, 50, 80, 110]);
    expect(result.datapoints.map((point) => point.timestamp)).toEqual(
      [0, 1, 2, 6, 7, 8].map(minutesAfter),
    );
  });

  it("does not fill gaps without rolling_average", async () => {
    const end = minutesAfter(3);
    const result = await makeCalculator([
      makeAggregateSeries([
        [START, 10],
        [minutesAfter(2), 30],
      ]),
      makeAggregateSeries([
        [START, 1],
        [minutesAfter(1), 2],
        [minutesAfter(2), 3],
      ]),
    ]).calculate(
      query("{A} + {B}", [param("A", "ts_a", "1m"), param("B", "ts_b", "1m")]),
      START,
      end,
    );

    expect(result.datapoints.map((point) => point.timestamp)).toEqual([START, minutesAfter(2)]);
    expect(result.datapoints.map((point) => point.value)).toEqual([11, 33]);
  });

  it("keeps filled minutes when subtracting a constant", async () => {
    const end = minutesAfter(6);
    const result = await makeCalculator([
      makeAggregateSeries([
        [START, 10],
        [minutesAfter(1), 20],
        [minutesAfter(2), 30],
      ]),
    ]).calculate(
      query("rolling_average({GQ}, 3) - {C}", [
        param("GQ", "ts1", "1m"),
        { type: "constant", alias: "C", value: 5 },
      ]),
      START,
      end,
    );

    const byMinute = new Map(
      result.datapoints.map((point) => [point.timestamp.getTime(), point.value]),
    );
    expect(byMinute.get(START.getTime())).toBe(5);
    expect(byMinute.get(minutesAfter(1).getTime())).toBe(10);
    expect(byMinute.get(minutesAfter(2).getTime())).toBe(15);
    expect(byMinute.get(minutesAfter(3).getTime())).toBe(20);
    expect(byMinute.get(minutesAfter(4).getTime())).toBe(25);
    expect(byMinute.has(minutesAfter(5).getTime())).toBe(false);
  });

  it("stays count-based with mixed granularities", async () => {
    const end = minutesAfter(9);
    const timestamps = gapTimestamps();
    const values = [10, 20, 30, 100, 110, 120];
    const result = await makeCalculator([
      makeAggregateSeries(
        timestamps.map((timestamp, index) => [timestamp, values[index] as number]),
      ),
      makeAggregateSeries(timestamps.map((timestamp) => [timestamp, 0])),
    ]).calculate(
      query("rolling_average({A}, 3) - {B}", [param("A", "ts_a", "1m"), param("B", "ts_b", "5m")]),
      START,
      end,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([10, 15, 20, 50, 80, 110]);
  });

  it("uses an overlapping pre-start bucket", async () => {
    const start = new Date(START.getTime() + 30_000);
    const end = minutesAfter(3);
    const result = await makeCalculator([
      makeAggregateSeries([
        [START, 10],
        [minutesAfter(1), 20],
        [minutesAfter(2), 30],
      ]),
    ]).calculate(query("rolling_average({GQ}, 3)", [param("GQ", "ts1", "1m")]), start, end);

    expect(result.datapoints.map((point) => point.timestamp)).toEqual([0, 1, 2].map(minutesAfter));
    expect(result.datapoints.map((point) => point.value)).toEqual([10, 15, 20]);
  });

  it("strict raises on mismatched buckets", async () => {
    const end = minutesAfter(3);
    await expect(
      makeCalculator([
        makeAggregateSeries([
          [START, 10],
          [minutesAfter(1), 20],
          [minutesAfter(2), 30],
        ]),
        makeAggregateSeries([
          [START, 1],
          [minutesAfter(2), 3],
        ]),
      ]).calculate(
        query(
          "rolling_average({A}, 3) - {B}",
          [param("A", "ts_a", "1m"), param("B", "ts_b", "1m")],
          "strict",
        ),
        START,
        end,
      ),
    ).rejects.toThrow(ParameterTimestampError);
  });

  it("strict fills when timestamps already match", async () => {
    const end = minutesAfter(4);
    const timestamps = [0, 1, 2].map(minutesAfter);
    const result = await makeCalculator([
      makeAggregateSeries(
        timestamps.map((timestamp, index) => [timestamp, [10, 20, 30][index] as number]),
      ),
      makeAggregateSeries(
        timestamps.map((timestamp, index) => [timestamp, [1, 2, 3][index] as number]),
      ),
    ]).calculate(
      query(
        "rolling_average({A}, 3) - {B}",
        [param("A", "ts_a", "1m"), param("B", "ts_b", "1m")],
        "strict",
      ),
      START,
      end,
    );

    expect(result.datapoints.map((point) => point.value)).toEqual([9, 13, 17]);
    expect(result.datapoints.map((point) => point.timestamp)).toEqual(timestamps);
  });
});
