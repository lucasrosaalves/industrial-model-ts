import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Calculator } from "../../src/calculator/calculator";
import { retrievalLimits } from "../../src/calculator/datapoints-retrieval";
import { ParameterTimestampError } from "../../src/calculator/formula-expression";
import type {
  CalculationResult,
  CalculatorQuery,
  MultiTimeSeriesParameter,
  ReducerType,
  TimeSeriesParameter,
} from "../../src/calculator/models";
import type { NodeId } from "../../src/types";
import { createIntegrationCogniteClient, hasIntegrationCredentials } from "./setup.js";

// Live CDF coverage: a throwaway space, real CogniteTimeSeries instances, and
// real datapoints. Each test checks an assumption a mock cannot prove (empty
// aggregate buckets are omitted, hourly averages are time-weighted, merged
// multi-aggregate requests share one timestamp axis, chunked responses stay
// in request order). Skipped unless CDF_* credentials are present.

const describeIntegration = describe.skipIf(!hasIntegrationCredentials());

const TIME_SERIES_NAMES = [
  "produced",
  "scrap",
  "short",
  "temp",
  "line_1",
  "line_2",
  "line_3",
  "gap_a",
  "gap_b",
  "empty",
] as const;

type SeriesName = (typeof TIME_SERIES_NAMES)[number];

type Dataset = Record<SeriesName, NodeId> & { space: string };

// A fixed historical anchor (rather than "now") keeps every hourly bucket
// fully in the past, so there's no risk of asserting on an in-progress,
// not-yet-complete aggregate bucket.
const BASE = new Date("2020-01-01T00:00:00.000Z");
const WINDOW_START = BASE;
const WINDOW_END = new Date(BASE.getTime() + 3 * 60 * 60 * 1000);

function atMinutes(minutes: number): Date {
  return new Date(BASE.getTime() + minutes * 60_000);
}

function ts(space: string, name: SeriesName): TimeSeriesParameter {
  return {
    type: "single_timeseries",
    alias: name.toUpperCase(),
    timeSeries: { space, externalId: name },
  };
}

function values(result: { datapoints: Array<{ value: number }> }): number[] {
  return result.datapoints.map((point) => point.value);
}

describeIntegration("integration calculator", () => {
  const client = createIntegrationCogniteClient();
  const calculator = new Calculator(client);
  let dataset: Dataset;

  beforeAll(async () => {
    const space = `calc-int-test-${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    await client.spaces.upsert([
      {
        space,
        name: "Calculator integration test (safe to delete)",
        description: "Throwaway space created by test/integration/calculator.test.ts",
      },
    ]);

    await client.instances.upsert({
      items: TIME_SERIES_NAMES.map((externalId) => ({
        instanceType: "node" as const,
        space,
        externalId,
        sources: [
          {
            source: {
              type: "view" as const,
              space: "cdf_cdm",
              externalId: "CogniteTimeSeries",
              version: "v1",
            },
            properties: { isStep: false, type: "numeric" },
          },
        ],
      })),
    });

    const insert = async (name: SeriesName, points: Array<[Date, number]>) => {
      await client.datapoints.insert([
        {
          instanceId: { space, externalId: name },
          datapoints: points.map(([timestamp, value]) => ({ timestamp, value })),
        },
      ]);
    };

    // Raw series for plain arithmetic and guarded-division scenarios.
    // scrap includes a real zero to exercise the division guard.
    await insert(
      "produced",
      [0, 1, 2, 3, 4].map((minute, index) => [
        atMinutes(minute),
        [100, 110, 120, 130, 140][index] as number,
      ]),
    );
    await insert(
      "scrap",
      [0, 1, 2, 3, 4].map((minute, index) => [
        atMinutes(minute),
        [10, 0, 5, 20, 2][index] as number,
      ]),
    );
    // Fewer points than produced/scrap - used to probe default timestamp
    // intersection (overlap kept) vs strict alignment (mismatch raises).
    await insert(
      "short",
      [0, 1, 2].map((minute, index) => [atMinutes(minute), [1, 2, 3][index] as number]),
    );

    // Hourly buckets for the average-aggregate probe. CDF's "average" is
    // time-weighted over the full bucket (including interpolation across
    // unsampled edges), so tests must not assume the naive 50.0 / 70.0
    // mean of the sampled points.
    await insert("temp", [
      ...[5, 20, 35, 50].map((minute) => [atMinutes(minute), 50] as [Date, number]),
      ...[65, 80, 95, 110].map((minute) => [atMinutes(minute), 70] as [Date, number]),
    ]);

    // Exactly one raw point per hourly bucket per line, so the "sum"
    // aggregate for that bucket is just that single value.
    await insert("line_1", [
      [atMinutes(15), 100],
      [atMinutes(75), 110],
    ]);
    await insert("line_2", [
      [atMinutes(15), 200],
      [atMinutes(75), 210],
    ]);
    await insert("line_3", [
      [atMinutes(15), 300],
      [atMinutes(75), 310],
    ]);

    // gap_b has no data at all in hour 1's window - the key probe for
    // whether CDF's aggregate API omits empty buckets (as SeriesReducer
    // assumes) rather than returning a null/zero datapoint for them.
    await insert("gap_a", [
      [atMinutes(15), 5],
      [atMinutes(75), 6],
    ]);
    await insert("gap_b", [[atMinutes(75), 50]]);

    dataset = {
      space,
      ...Object.fromEntries(TIME_SERIES_NAMES.map((name) => [name, { space, externalId: name }])),
    } as Dataset;
  }, 120_000);

  afterAll(async () => {
    if (dataset === undefined) {
      return;
    }
    await client.instances.delete(
      TIME_SERIES_NAMES.map((externalId) => ({
        instanceType: "node" as const,
        space: dataset.space,
        externalId,
      })),
    );
    await client.spaces.delete([dataset.space]);
  }, 60_000);

  it("simple raw arithmetic", async () => {
    const query: CalculatorQuery = {
      formula: "{PRODUCED} - {SCRAP}",
      parameters: [
        { ...ts(dataset.space, "produced"), alias: "PRODUCED" },
        { ...ts(dataset.space, "scrap"), alias: "SCRAP" },
      ],
    };

    const result = await calculator.calculate(query, WINDOW_START, WINDOW_END);

    expect(values(result)).toEqual([90, 110, 115, 110, 138]);
    expect(result.datapoints.every((point) => point.timestamp instanceof Date)).toBe(true);
  });

  it("guarded division handles a real zero denominator", async () => {
    const query: CalculatorQuery = {
      formula: "{PRODUCED} / {SCRAP} if {SCRAP} != 0 else -1",
      parameters: [
        { ...ts(dataset.space, "produced"), alias: "PRODUCED" },
        { ...ts(dataset.space, "scrap"), alias: "SCRAP" },
      ],
    };

    const result = await calculator.calculate(query, WINDOW_START, WINDOW_END);

    expect(values(result)).toEqual([10, -1, 24, 6.5, 70]);
  });

  it("mismatched series are intersected by default", async () => {
    const query: CalculatorQuery = {
      formula: "{PRODUCED} + {SHORT}",
      parameters: [
        { ...ts(dataset.space, "produced"), alias: "PRODUCED" },
        { ...ts(dataset.space, "short"), alias: "SHORT" },
      ],
    };

    const result = await calculator.calculate(query, WINDOW_START, WINDOW_END);

    expect(values(result)).toEqual([101, 112, 123]);
  });

  it("strict alignment raises when series timestamps differ", async () => {
    const query: CalculatorQuery = {
      formula: "{PRODUCED} + {SHORT}",
      parameters: [
        { ...ts(dataset.space, "produced"), alias: "PRODUCED" },
        { ...ts(dataset.space, "short"), alias: "SHORT" },
      ],
      alignment: "strict",
    };

    await expect(calculator.calculate(query, WINDOW_START, WINDOW_END)).rejects.toThrow(
      ParameterTimestampError,
    );
  });

  it("strict alignment accepts identically bucketed aggregates", async () => {
    // Two series with raw data in the same hours must come back on
    // byte-for-byte identical bucket timestamps, or `strict` would be
    // unusable in practice even for well-behaved data.
    const query: CalculatorQuery = {
      formula: "{L1} + {L2}",
      parameters: [
        {
          type: "single_timeseries",
          alias: "L1",
          timeSeries: dataset.line_1,
          aggregateType: "sum",
          granularity: "1h",
        },
        {
          type: "single_timeseries",
          alias: "L2",
          timeSeries: dataset.line_2,
          aggregateType: "sum",
          granularity: "1h",
        },
      ],
      alignment: "strict",
    };

    const result = await calculator.calculate(query, WINDOW_START, WINDOW_END);

    expect(values(result)).toEqual([300, 320]);
  });

  it("timeseries with no datapoints returns empty result", async () => {
    const query: CalculatorQuery = {
      formula: "{EMPTY}",
      parameters: [{ type: "single_timeseries", alias: "EMPTY", timeSeries: dataset.empty }],
    };

    const result = await calculator.calculate(query, WINDOW_START, WINDOW_END);

    expect(result.datapoints).toEqual([]);
  });

  it("intersect with an empty series is empty", async () => {
    const query: CalculatorQuery = {
      formula: "{PRODUCED} + {EMPTY}",
      parameters: [
        { ...ts(dataset.space, "produced"), alias: "PRODUCED" },
        { type: "single_timeseries", alias: "EMPTY", timeSeries: dataset.empty },
      ],
    };

    const result = await calculator.calculate(query, WINDOW_START, WINDOW_END);

    expect(result.datapoints).toEqual([]);
  });

  it("window with no data returns empty result", async () => {
    const query: CalculatorQuery = {
      formula: "{PRODUCED}",
      parameters: [{ ...ts(dataset.space, "produced"), alias: "PRODUCED" }],
    };
    const start = new Date(BASE.getTime() - 30 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

    const result = await calculator.calculate(query, start, end);

    expect(result.datapoints).toEqual([]);
  });

  it("single aggregate hourly average", async () => {
    // CDF's "average" aggregate on a non-step series is time-weighted over
    // the full bucket width, not a simple mean of the sampled points. This
    // asserts a generous bound rather than pretending the exact value is
    // hand-derivable.
    const query: CalculatorQuery = {
      formula: "{TEMP}",
      parameters: [
        {
          type: "single_timeseries",
          alias: "TEMP",
          timeSeries: dataset.temp,
          aggregateType: "average",
          granularity: "1h",
        },
      ],
    };

    const result = await calculator.calculate(query, WINDOW_START, WINDOW_END);

    expect(result.datapoints).toHaveLength(2);
    expect(result.datapoints[0]?.value).toBeCloseTo(50, -1);
    expect(result.datapoints[1]?.value).toBeCloseTo(70, -1);
  });

  it("two aggregates of one series share a merged request", async () => {
    // Two parameters on the same (series, granularity) collapse into a
    // single request carrying aggregates=["sum", "max"]. produced has five
    // distinct values inside hour 0, so sum (600) and max (140) differ - a
    // swapped or duplicated column can't pass.
    const query: CalculatorQuery = {
      formula: "{TOTAL} - {PEAK}",
      parameters: [
        {
          type: "single_timeseries",
          alias: "TOTAL",
          timeSeries: dataset.produced,
          aggregateType: "sum",
          granularity: "1h",
        },
        {
          type: "single_timeseries",
          alias: "PEAK",
          timeSeries: dataset.produced,
          aggregateType: "max",
          granularity: "1h",
        },
      ],
    };

    const result = await calculator.calculate(query, WINDOW_START, WINDOW_END);

    expect(values(result)).toEqual([460]);
  });

  it("one series read both raw and aggregated", async () => {
    // Raw and aggregated reads of the same series are deliberately not
    // deduplicated. Only the hour-0 bucket start coincides with a raw
    // sample (both land exactly on BASE), so intersection leaves a single
    // point: raw 100 + sum 600.
    const query: CalculatorQuery = {
      formula: "{RAW} + {TOTAL}",
      parameters: [
        { type: "single_timeseries", alias: "RAW", timeSeries: dataset.produced },
        {
          type: "single_timeseries",
          alias: "TOTAL",
          timeSeries: dataset.produced,
          aggregateType: "sum",
          granularity: "1h",
        },
      ],
    };

    const result = await calculator.calculate(query, WINDOW_START, WINDOW_END);

    expect(values(result)).toEqual([700]);
    expect(result.datapoints[0]?.timestamp).toEqual(BASE);
  });

  it("constant parameter broadcasts against a real series", async () => {
    const query: CalculatorQuery = {
      formula: "{PRODUCED} * {LBS_TO_KG}",
      parameters: [
        { ...ts(dataset.space, "produced"), alias: "PRODUCED" },
        { type: "constant", alias: "LBS_TO_KG", value: 0.453592 },
      ],
    };

    const result = await calculator.calculate(query, WINDOW_START, WINDOW_END);

    expect(values(result)).toEqual([100, 110, 120, 130, 140].map((value) => value * 0.453592));
  });

  for (const [reducer, expected] of [
    ["sum", [600, 630]],
    ["average", [200, 210]],
    ["min", [100, 110]],
    ["max", [300, 310]],
  ] as const) {
    it(`multi timeseries reducer against real hourly aggregates (${reducer})`, async () => {
      const lines: MultiTimeSeriesParameter = {
        type: "multi_timeseries",
        alias: "LINES",
        timeSeries: [dataset.line_1, dataset.line_2, dataset.line_3],
        aggregateType: "sum",
        granularity: "1h",
        reducer: reducer as ReducerType,
      };

      const result = await calculator.calculate(
        { formula: "{LINES}", parameters: [lines] },
        WINDOW_START,
        WINDOW_END,
      );

      // 3-hour window but only hours 0 and 1 have raw data; CDF must omit the
      // empty trailing bucket rather than returning a null/zero for it.
      expect(result.datapoints).toHaveLength(2);
      expect(values(result)).toEqual([...expected]);
    });
  }

  it("multi timeseries reducer drops buckets missing from any series", async () => {
    // gap_b has no raw datapoints in the first hourly bucket. If CDF's
    // aggregate API genuinely omits empty buckets, SeriesReducer's
    // timestamp-intersection must drop the first hour entirely rather than
    // treating the missing value as zero.
    const gap: MultiTimeSeriesParameter = {
      type: "multi_timeseries",
      alias: "GAP",
      timeSeries: [dataset.gap_a, dataset.gap_b],
      aggregateType: "sum",
      granularity: "1h",
      reducer: "sum",
    };

    const result = await calculator.calculate(
      { formula: "{GAP}", parameters: [gap] },
      WINDOW_START,
      WINDOW_END,
    );

    expect(result.datapoints).toHaveLength(1);
    expect(result.datapoints[0]?.value).toBeCloseTo(56);
  });

  it("formula intersects reduced series with a gapped sibling", async () => {
    // LINES has hourly sums in both hour 0 and hour 1; GAP only survives
    // in hour 1. Default intersect alignment must keep only that shared hour.
    const lines: MultiTimeSeriesParameter = {
      type: "multi_timeseries",
      alias: "LINES",
      timeSeries: [dataset.line_1, dataset.line_2, dataset.line_3],
      aggregateType: "sum",
      granularity: "1h",
      reducer: "sum",
    };
    const gap: MultiTimeSeriesParameter = {
      type: "multi_timeseries",
      alias: "GAP",
      timeSeries: [dataset.gap_a, dataset.gap_b],
      aggregateType: "sum",
      granularity: "1h",
      reducer: "sum",
    };

    const result = await calculator.calculate(
      { formula: "{LINES} + {GAP}", parameters: [lines, gap] },
      WINDOW_START,
      WINDOW_END,
    );

    expect(result.datapoints).toHaveLength(1);
    expect(result.datapoints[0]?.value).toBeCloseTo(686);
  });

  it("complex formula combining reducer and constants", async () => {
    const query: CalculatorQuery = {
      formula: "(({LINES_KG} * {KG_TO_LBS}) / {TARGET}) * 100",
      parameters: [
        {
          type: "multi_timeseries",
          alias: "LINES_KG",
          timeSeries: [dataset.line_1, dataset.line_2, dataset.line_3],
          aggregateType: "sum",
          granularity: "1h",
          reducer: "sum",
        },
        { type: "constant", alias: "KG_TO_LBS", value: 2.20462 },
        { type: "constant", alias: "TARGET", value: 1000 },
      ],
    };

    const result = await calculator.calculate(query, WINDOW_START, WINDOW_END);

    expect(values(result)).toEqual([600, 630].map((value) => ((value * 2.20462) / 1000) * 100));
  });

  it("chunked requests keep each series on its own alias", async () => {
    // `_buildRequests` hands back positional indexes into a flat response
    // list, so a reordered (or differently chunked) CDF response would
    // silently attach every value to the wrong parameter. Shrinking the
    // chunk size splits four out-of-order series across two round trips.
    const previous = retrievalLimits.maxTimeSeriesPerRequest;
    retrievalLimits.maxTimeSeriesPerRequest = 2;
    try {
      const query: CalculatorQuery = {
        formula: "{L3} * 1000 + {L1} * 100 + {GA} * 10 + {L2}",
        parameters: [
          { type: "single_timeseries", alias: "L3", timeSeries: dataset.line_3 },
          { type: "single_timeseries", alias: "L1", timeSeries: dataset.line_1 },
          { type: "single_timeseries", alias: "GA", timeSeries: dataset.gap_a },
          { type: "single_timeseries", alias: "L2", timeSeries: dataset.line_2 },
        ],
      };

      const result = await calculator.calculate(query, WINDOW_START, WINDOW_END);

      // minute 15: 300*1000 + 100*100 + 5*10 + 200
      // minute 75: 310*1000 + 110*100 + 6*10 + 210
      expect(values(result)).toEqual([310250, 321270]);
    } finally {
      retrievalLimits.maxTimeSeriesPerRequest = previous;
    }
  });

  it("calculateMultiples batches real queries together", async () => {
    const simpleQuery: CalculatorQuery = {
      formula: "{PRODUCED} - {SCRAP}",
      parameters: [
        { ...ts(dataset.space, "produced"), alias: "PRODUCED" },
        { ...ts(dataset.space, "scrap"), alias: "SCRAP" },
      ],
    };
    const aggregateQuery: CalculatorQuery = {
      formula: "{TEMP}",
      parameters: [
        {
          type: "single_timeseries",
          alias: "TEMP",
          timeSeries: dataset.temp,
          aggregateType: "average",
          granularity: "1h",
        },
      ],
    };
    const reducerQuery: CalculatorQuery = {
      formula: "{LINES}",
      parameters: [
        {
          type: "multi_timeseries",
          alias: "LINES",
          timeSeries: [dataset.line_1, dataset.line_2, dataset.line_3],
          aggregateType: "sum",
          granularity: "1h",
          reducer: "sum",
        },
      ],
    };

    const [simpleResult, aggregateResult, reducerResult] = await calculator.calculateMultiples(
      [simpleQuery, aggregateQuery, reducerQuery],
      WINDOW_START,
      WINDOW_END,
    );

    expect(values(simpleResult as { datapoints: Array<{ value: number }> })).toEqual([
      90, 110, 115, 110, 138,
    ]);
    expect(aggregateResult?.datapoints).toHaveLength(2);
    expect(aggregateResult?.datapoints[0]?.value).toBeCloseTo(50, -1);
    expect(aggregateResult?.datapoints[1]?.value).toBeCloseTo(70, -1);
    expect(values(reducerResult as { datapoints: Array<{ value: number }> })).toEqual([600, 630]);
  });

  it("small pages are followed until every series is complete", async () => {
    // Shrink the point budgets so each series needs several pages: raw
    // series get 2 points per page and the aggregate 2 buckets. For the
    // aggregate, CDF rounds the advanced start down to the bucket already
    // returned, which the retriever must drop rather than duplicate.
    const queries: CalculatorQuery[] = [
      {
        formula: "{PRODUCED} - {SCRAP}",
        parameters: [
          { ...ts(dataset.space, "produced"), alias: "PRODUCED" },
          { ...ts(dataset.space, "scrap"), alias: "SCRAP" },
        ],
      },
      {
        formula: "{TEMP}",
        parameters: [
          {
            type: "single_timeseries",
            alias: "TEMP",
            timeSeries: dataset.temp,
            aggregateType: "sum",
            granularity: "1m",
          },
        ],
      },
    ];
    const whole = await calculator.calculateMultiples(queries, WINDOW_START, WINDOW_END);

    const previous = { ...retrievalLimits };
    retrievalLimits.rawPointsPerRequest = 4;
    retrievalLimits.aggregatePointsPerRequest = 2;
    try {
      const paged = await calculator.calculateMultiples(queries, WINDOW_START, WINDOW_END);

      expect(values(whole[0] as CalculationResult)).toEqual([90, 110, 115, 110, 138]);
      expect(whole[1]?.datapoints).toHaveLength(8);
      expect(paged).toEqual(whole);
    } finally {
      Object.assign(retrievalLimits, previous);
    }
  });

  // sum({X}) over per-minute sums, aggregated by the granularity, equals
  // CDF's own sum aggregate, so any difference is a bucket boundary or
  // window-span mismatch.
  it.each([
    // Mid-bucket start: CDF floors to the unit and returns whole buckets.
    { granularity: "1h", timeZone: undefined, start: atMinutes(37) },
    { granularity: "2h", timeZone: undefined, start: atMinutes(37) },
    // Half-hour offset: local hours start at :30 UTC.
    { granularity: "1h", timeZone: "UTC+05:30", start: WINDOW_START },
    // 00:15Z / 01:15Z are 31 Dec in Denver; the day starts at 07:00Z.
    { granularity: "1d", timeZone: "America/Denver", start: WINDOW_START },
  ])("bucket sum matches the native CDF sum aggregate ($granularity, $timeZone)", async ({
    granularity,
    timeZone,
    start,
  }) => {
    const query = (
      formula: string,
      fetch: string,
      bucketGranularity: string | undefined,
    ): CalculatorQuery => ({
      formula,
      parameters: [
        {
          type: "single_timeseries",
          alias: "L1",
          timeSeries: dataset.line_1,
          aggregateType: "sum",
          granularity: fetch,
        },
      ],
      ...(bucketGranularity !== undefined ? { bucketGranularity } : {}),
    });

    const [native, bucketed] = (await calculator.calculateMultiples(
      [query("{L1}", granularity, undefined), query("sum({L1})", "1m", granularity)],
      start,
      WINDOW_END,
      timeZone,
    )) as [CalculationResult, CalculationResult];

    expect(native.datapoints.length).toBeGreaterThan(0);
    expect(bucketed.datapoints.map((point) => point.timestamp)).toEqual(
      native.datapoints.map((point) => point.timestamp),
    );
    bucketed.datapoints.forEach((point, index) => {
      expect(point.value).toBeCloseTo(native.datapoints[index]?.value as number, 9);
    });
  });
});
