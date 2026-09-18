import { describe, expect, it, vi } from "vitest";
import { DatapointsRetriever } from "../../src/calculator/datapoints-retrieval";
import { CalculatorError } from "../../src/calculator/exceptions";
import type { AnyTimeSeriesParameter, MultiTimeSeriesParameter } from "../../src/calculator/models";
import type { CognitePort } from "../../src/cognite";
import type { DatapointAggregate, NodeId } from "../../src/types";
import { makeCogniteMock } from "../fixtures/index.js";

const TS_A = { space: "ts-space", externalId: "temperature" };
const TS_B = { space: "ts-space", externalId: "pressure" };
const START = new Date("2024-01-01T00:00:00.000Z");
const END = new Date("2024-01-02T00:00:00.000Z");
const T0 = new Date("2024-01-01T00:00:00.000Z");
const T1 = new Date("2024-01-01T01:00:00.000Z");

function makeResultItem(overrides: { isString?: boolean; datapoints?: unknown[] }) {
  return {
    isString: overrides.isString ?? false,
    datapoints: overrides.datapoints ?? [],
  };
}

function makeRetriever(resultItems: unknown[]): {
  retriever: DatapointsRetriever;
  cognite: CognitePort;
} {
  const cognite = makeCogniteMock();
  cognite.retrieveDatapoints = vi.fn().mockResolvedValue({ items: resultItems });
  return { retriever: new DatapointsRetriever(cognite), cognite };
}

function rawParam(timeSeries: NodeId, alias: string): AnyTimeSeriesParameter {
  return { type: "single_timeseries", timeSeries, alias };
}

function aggregateParam(
  timeSeries: NodeId,
  alias: string,
  aggregateType: DatapointAggregate,
  granularity = "1h",
): AnyTimeSeriesParameter {
  return { type: "single_timeseries", timeSeries, alias, aggregateType, granularity };
}

function multiParam(
  timeSeries: NodeId[],
  alias: string,
  options: { aggregateType?: DatapointAggregate; granularity?: string } = {},
): MultiTimeSeriesParameter {
  const base = { type: "multi_timeseries", timeSeries, alias, reducer: "sum" } as const;
  return options.aggregateType === undefined
    ? base
    : {
        ...base,
        aggregateType: options.aggregateType,
        granularity: options.granularity ?? "1h",
      };
}

function requestItems(cognite: CognitePort, call = 0) {
  return vi.mocked(cognite.retrieveDatapoints).mock.calls[call]?.[0]?.items ?? [];
}

// A Cognite mock that echoes each request item back as a result item whose
// single datapoint value is the numeric externalId. This lets tests assert
// that pagination stitches responses back together in the right order.
function makePaginatingRetriever(): {
  retriever: DatapointsRetriever;
  cognite: CognitePort;
} {
  const cognite = makeCogniteMock();
  cognite.retrieveDatapoints = vi.fn().mockImplementation(({ items }) =>
    Promise.resolve({
      items: items.map((item: { externalId: string }) =>
        makeResultItem({ datapoints: [{ timestamp: T0, value: Number(item.externalId) }] }),
      ),
    }),
  );
  return { retriever: new DatapointsRetriever(cognite), cognite };
}

describe("DatapointsRetriever: request building and de-duplication", () => {
  it("returns an empty result per parameter without calling Cognite when there are no parameters", async () => {
    const { retriever, cognite } = makeRetriever([]);

    const result = await retriever.retrieveDatapoints([], START, END);

    expect(result).toEqual([]);
    expect(cognite.retrieveDatapoints).not.toHaveBeenCalled();
  });

  it("same timeseries and granularity with different aggregates are merged", async () => {
    const { retriever, cognite } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, average: 5, max: 9 }] }),
    ]);

    await retriever.retrieveDatapoints(
      [aggregateParam(TS_A, "A", "average"), aggregateParam(TS_A, "B", "max")],
      START,
      END,
    );

    expect(requestItems(cognite)).toHaveLength(1);
    expect(requestItems(cognite)[0]).toMatchObject({
      space: TS_A.space,
      externalId: TS_A.externalId,
      aggregates: ["average", "max"],
      granularity: "1h",
    });
  });

  it("repeated aggregate on same series is not duplicated", async () => {
    const { retriever, cognite } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, average: 5 }] }),
    ]);

    await retriever.retrieveDatapoints(
      [aggregateParam(TS_A, "A", "average"), aggregateParam(TS_A, "B", "average")],
      START,
      END,
    );

    expect(requestItems(cognite)).toHaveLength(1);
    expect(requestItems(cognite)[0]?.aggregates).toEqual(["average"]);
  });

  it("sets timeZone on every aggregate query", async () => {
    const { retriever, cognite } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, average: 1 }] }),
      makeResultItem({ datapoints: [{ timestamp: T0, sum: 2 }] }),
    ]);

    await retriever.retrieveDatapoints(
      [aggregateParam(TS_A, "A", "average", "1h"), aggregateParam(TS_B, "B", "sum", "1d")],
      START,
      END,
      "America/New_York",
    );

    expect(requestItems(cognite).map((item) => item.timeZone)).toEqual([
      "America/New_York",
      "America/New_York",
    ]);
  });

  it("applies timeZone when calling CDF", async () => {
    const { retriever, cognite } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, average: 1 }] }),
    ]);

    await retriever.retrieveDatapoints(
      [aggregateParam(TS_A, "A", "average", "1d")],
      START,
      END,
      "America/New_York",
    );

    expect(requestItems(cognite)[0]).toMatchObject({
      timeZone: "America/New_York",
      granularity: "1d",
    });
  });

  it("does not set timeZone on a raw retrieve", async () => {
    const { retriever, cognite } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, value: 1 }] }),
    ]);

    await retriever.retrieveDatapoints([rawParam(TS_A, "A")], START, END, "America/New_York");

    expect(requestItems(cognite)[0]?.granularity).toBeUndefined();
    expect(requestItems(cognite)[0]?.timeZone).toBeUndefined();
  });

  it("sets timeZone only on aggregates in a mixed retrieve", async () => {
    const { retriever, cognite } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, value: 1 }] }),
      makeResultItem({ datapoints: [{ timestamp: T0, sum: 2 }] }),
    ]);

    await retriever.retrieveDatapoints(
      [rawParam(TS_A, "A"), aggregateParam(TS_B, "B", "sum", "1d")],
      START,
      END,
      "America/New_York",
    );

    expect(requestItems(cognite)[0]?.timeZone).toBeUndefined();
    expect(requestItems(cognite)[1]?.timeZone).toBe("America/New_York");
  });

  it("keeps a single timeZone when merging aggregates", async () => {
    const { retriever, cognite } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, average: 1, sum: 2 }] }),
    ]);

    await retriever.retrieveDatapoints(
      [aggregateParam(TS_A, "A", "average", "1h"), aggregateParam(TS_A, "B", "sum", "1h")],
      START,
      END,
      "Europe/Oslo",
    );

    expect(requestItems(cognite)).toHaveLength(1);
    expect(requestItems(cognite)[0]?.aggregates).toEqual(["average", "sum"]);
    expect(requestItems(cognite)[0]?.timeZone).toBe("Europe/Oslo");
  });

  it("same timeseries different granularity produces separate requests", async () => {
    const { retriever, cognite } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, average: 1 }] }),
      makeResultItem({ datapoints: [{ timestamp: T0, average: 2 }] }),
    ]);

    const result = await retriever.retrieveDatapoints(
      [aggregateParam(TS_A, "A", "average", "1h"), aggregateParam(TS_A, "B", "average", "1d")],
      START,
      END,
    );

    expect(requestItems(cognite)).toHaveLength(2);
    expect(result[0]?.[0]?.[0]?.value).toBe(1);
    expect(result[1]?.[0]?.[0]?.value).toBe(2);
  });

  it("raw and aggregate for same series are distinct requests", async () => {
    const { retriever, cognite } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, value: 100 }] }),
      makeResultItem({ datapoints: [{ timestamp: T0, average: 50 }] }),
    ]);

    const result = await retriever.retrieveDatapoints(
      [rawParam(TS_A, "raw"), aggregateParam(TS_A, "agg", "average")],
      START,
      END,
    );

    expect(requestItems(cognite)).toHaveLength(2);
    expect(result[0]?.[0]?.[0]?.value).toBe(100);
    expect(result[1]?.[0]?.[0]?.value).toBe(50);
  });

  it("merged aggregates pull their own column per parameter", async () => {
    const { retriever } = makeRetriever([
      makeResultItem({
        datapoints: [
          { timestamp: T0, average: 10, sum: 100 },
          { timestamp: T1, average: 20, sum: 200 },
        ],
      }),
    ]);

    const result = await retriever.retrieveDatapoints(
      [aggregateParam(TS_A, "A", "average"), aggregateParam(TS_A, "B", "sum")],
      START,
      END,
    );

    expect(result[0]?.[0]?.map((point) => point.value)).toEqual([10, 20]);
    expect(result[1]?.[0]?.map((point) => point.value)).toEqual([100, 200]);
  });

  it("shared instance id across parameters reuses one request", async () => {
    const { retriever, cognite } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, average: 5 }] }),
    ]);

    await retriever.retrieveDatapoints(
      [aggregateParam(TS_A, "A", "average"), aggregateParam(TS_A, "B", "average")],
      START,
      END,
    );

    expect(requestItems(cognite)).toHaveLength(1);
  });

  it("shared instance id across parameters yields the same leaf series", async () => {
    const { retriever } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, average: 5 }] }),
    ]);

    const result = await retriever.retrieveDatapoints(
      [aggregateParam(TS_A, "A", "average"), aggregateParam(TS_A, "B", "average")],
      START,
      END,
    );

    const expected = [{ timestamp: T0, value: 5 }];
    expect(result[0]?.[0]).toEqual(expected);
    expect(result[1]?.[0]).toEqual(expected);
  });

  it("retrieve datapoints preserves parameter order", async () => {
    const TS_C = { space: "ts-space", externalId: "flow" };
    const { retriever } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, value: 1 }] }),
      makeResultItem({ datapoints: [{ timestamp: T0, value: 2 }] }),
      makeResultItem({ datapoints: [{ timestamp: T0, value: 3 }] }),
    ]);

    const result = await retriever.retrieveDatapoints(
      [rawParam(TS_A, "A"), rawParam(TS_B, "B"), rawParam(TS_C, "C")],
      START,
      END,
    );

    expect(result[0]?.[0]?.[0]?.value).toBe(1);
    expect(result[1]?.[0]?.[0]?.value).toBe(2);
    expect(result[2]?.[0]?.[0]?.value).toBe(3);
  });
});

describe("DatapointsRetriever: leaf series per parameter", () => {
  it("single instance id param returns one leaf series", async () => {
    const { retriever } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, value: 1 }] }),
    ]);

    const result = await retriever.retrieveDatapoints([rawParam(TS_A, "A")], START, END);

    expect(result[0]).toHaveLength(1);
    expect(result[0]?.[0]?.map((point) => point.value)).toEqual([1]);
  });

  it("multi instance param requests one series per instance", async () => {
    const { retriever, cognite } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, average: 1 }] }),
      makeResultItem({ datapoints: [{ timestamp: T0, average: 2 }] }),
    ]);

    await retriever.retrieveDatapoints(
      [multiParam([TS_A, TS_B], "A", { aggregateType: "average" })],
      START,
      END,
    );

    expect(requestItems(cognite)).toHaveLength(2);
  });

  it("multi instance param returns each leaf series unreduced", async () => {
    // DatapointsRetriever only fetches and parses data - combining a
    // parameter's series (via its reducer) is the caller's responsibility.
    const { retriever } = makeRetriever([
      makeResultItem({
        datapoints: [
          { timestamp: T0, average: 1 },
          { timestamp: T1, average: 2 },
        ],
      }),
      makeResultItem({
        datapoints: [
          { timestamp: T0, average: 10 },
          { timestamp: T1, average: 20 },
        ],
      }),
    ]);

    const result = await retriever.retrieveDatapoints(
      [multiParam([TS_A, TS_B], "A", { aggregateType: "average" })],
      START,
      END,
    );

    expect(result).toHaveLength(1);
    // One leaf series per instance id, not reduced.
    expect(result[0]).toHaveLength(2);
    expect(result[0]?.[0]?.map((point) => point.value)).toEqual([1, 2]);
    expect(result[0]?.[1]?.map((point) => point.value)).toEqual([10, 20]);
  });

  it("mixed raw and multi instance aggregate params in one batch", async () => {
    const rawTs = { space: "ts-space", externalId: "raw-ts" };
    const aggTs1 = { space: "ts-space", externalId: "agg-ts-1" };
    const aggTs2 = { space: "ts-space", externalId: "agg-ts-2" };
    const { retriever } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, value: 1 }] }),
      makeResultItem({ datapoints: [{ timestamp: T0, average: 2 }] }),
      makeResultItem({ datapoints: [{ timestamp: T0, average: 3 }] }),
    ]);

    const result = await retriever.retrieveDatapoints(
      [rawParam(rawTs, "A"), multiParam([aggTs1, aggTs2], "B", { aggregateType: "average" })],
      START,
      END,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(1); // raw param: one leaf series
    expect(result[1]).toHaveLength(2); // multi param: two leaf series, unreduced
    expect(result[0]?.[0]?.map((point) => point.value)).toEqual([1]);
    expect(result[1]?.[0]?.map((point) => point.value)).toEqual([2]);
    expect(result[1]?.[1]?.map((point) => point.value)).toEqual([3]);
  });
});

describe("DatapointsRetriever: response parsing", () => {
  it("parse datapoints drops none values and aligns timestamps", async () => {
    const { retriever } = makeRetriever([
      makeResultItem({
        datapoints: [
          { timestamp: T0, value: 1 },
          { timestamp: T1, value: null },
          { timestamp: new Date("2024-01-01T02:00:00.000Z"), value: 3 },
        ],
      }),
    ]);

    const result = await retriever.retrieveDatapoints([rawParam(TS_A, "A")], START, END);

    expect(result[0]?.[0]?.map((point) => point.value)).toEqual([1, 3]);
    expect(result[0]?.[0]?.[0]?.timestamp).toEqual(T0);
  });

  it("missing column is treated as empty series", async () => {
    const { retriever } = makeRetriever([makeResultItem({ datapoints: [{ timestamp: T0 }] })]);

    const result = await retriever.retrieveDatapoints([rawParam(TS_A, "A")], START, END);

    expect(result).toEqual([[[]]]);
  });

  it("missing aggregate column is treated as empty series", async () => {
    const { retriever } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, sum: 1 }] }),
    ]);

    const result = await retriever.retrieveDatapoints(
      [aggregateParam(TS_A, "A", "average")],
      START,
      END,
    );

    expect(result).toEqual([[[]]]);
  });

  it("reads the raw 'value' field, ignoring same-named aggregate keys", async () => {
    const { retriever } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, value: 1, average: 999 }] }),
    ]);

    const result = await retriever.retrieveDatapoints([rawParam(TS_A, "A")], START, END);

    expect(result[0]?.[0]).toEqual([{ timestamp: T0, value: 1 }]);
  });

  it("retrieves a single raw series and forwards the window", async () => {
    const { retriever, cognite } = makeRetriever([
      makeResultItem({
        datapoints: [
          { timestamp: T0, value: 10 },
          { timestamp: T1, value: 20 },
        ],
      }),
    ]);

    const result = await retriever.retrieveDatapoints([rawParam(TS_A, "A")], START, END);

    expect(result).toEqual([
      [
        [
          { timestamp: T0, value: 10 },
          { timestamp: T1, value: 20 },
        ],
      ],
    ]);
    expect(cognite.retrieveDatapoints).toHaveBeenCalledWith({
      items: [{ space: TS_A.space, externalId: TS_A.externalId }],
      start: START,
      end: END,
    });
  });
});

describe("DatapointsRetriever: error handling", () => {
  it("non numeric datapoints type is rejected", async () => {
    const { retriever } = makeRetriever([makeResultItem({ isString: true })]);

    await expect(retriever.retrieveDatapoints([rawParam(TS_A, "A")], START, END)).rejects.toThrow(
      /expected numeric datapoints/,
    );
  });

  it("short cdf response is rejected", async () => {
    const { retriever } = makeRetriever([
      makeResultItem({ datapoints: [{ timestamp: T0, value: 1 }] }),
    ]);

    await expect(
      retriever.retrieveDatapoints([rawParam(TS_A, "A"), rawParam(TS_B, "B")], START, END),
    ).rejects.toThrow(/expected 2 datapoint series from CDF, got 1/);
  });

  it("every retriever error is catchable as calculator error", async () => {
    const { retriever } = makeRetriever([makeResultItem({ isString: true })]);

    await expect(retriever.retrieveDatapoints([rawParam(TS_A, "A")], START, END)).rejects.toThrow(
      CalculatorError,
    );
  });

  it("throws when an aggregate parameter is missing granularity", async () => {
    // `validateCalculatorQuery` normally catches this first; the retriever
    // still guards it for a parameter that skipped validation.
    const { retriever } = makeRetriever([]);

    await expect(
      retriever.retrieveDatapoints(
        [{ type: "single_timeseries", timeSeries: TS_A, aggregateType: "average", alias: "A" }],
        START,
        END,
      ),
    ).rejects.toThrow(/Missing granularity for 'A' with aggregate 'average'/);
  });
});

describe("DatapointsRetriever: pagination", () => {
  it("more than 100 timeseries are paginated across requests", async () => {
    const { retriever, cognite } = makePaginatingRetriever();

    const params = Array.from({ length: 150 }, (_, index) =>
      rawParam({ space: "ts-space", externalId: String(index) }, `p${index}`),
    );
    const result = await retriever.retrieveDatapoints(params, START, END);

    expect(cognite.retrieveDatapoints).toHaveBeenCalledTimes(2);
    expect(requestItems(cognite, 0)).toHaveLength(100);
    expect(requestItems(cognite, 1)).toHaveLength(50);
    expect(result[0]?.[0]?.[0]?.value).toBe(0);
    expect(result[99]?.[0]?.[0]?.value).toBe(99);
    expect(result[149]?.[0]?.[0]?.value).toBe(149);
  });

  it("issues a single request for exactly 100 unique time series", async () => {
    const { retriever, cognite } = makePaginatingRetriever();

    const params = Array.from({ length: 100 }, (_, index) =>
      rawParam({ space: "ts-space", externalId: String(index) }, `p${index}`),
    );
    const result = await retriever.retrieveDatapoints(params, START, END);

    expect(cognite.retrieveDatapoints).toHaveBeenCalledTimes(1);
    expect(requestItems(cognite)).toHaveLength(100);
    expect(result[0]?.[0]?.[0]?.value).toBe(0);
    expect(result[99]?.[0]?.[0]?.value).toBe(99);
  });

  it("de-duplicates before paginating so shared series stay in one request", async () => {
    const { retriever, cognite } = makePaginatingRetriever();

    // 150 parameters, but all point at the same series: only one unique request.
    const params = Array.from({ length: 150 }, (_, index) =>
      rawParam({ space: "ts-space", externalId: "7" }, `p${index}`),
    );
    const result = await retriever.retrieveDatapoints(params, START, END);

    expect(cognite.retrieveDatapoints).toHaveBeenCalledTimes(1);
    expect(requestItems(cognite)).toHaveLength(1);
    expect(result).toHaveLength(150);
    expect(result.every((leafSeries) => leafSeries[0]?.[0]?.value === 7)).toBe(true);
  });

  it("forwards the shared start and end window to every paginated request", async () => {
    const { retriever, cognite } = makePaginatingRetriever();

    const params = Array.from({ length: 150 }, (_, index) =>
      rawParam({ space: "ts-space", externalId: String(index) }, `p${index}`),
    );
    await retriever.retrieveDatapoints(params, START, END);

    for (const call of vi.mocked(cognite.retrieveDatapoints).mock.calls) {
      expect(call[0]?.start).toBe(START);
      expect(call[0]?.end).toBe(END);
    }
  });
});
