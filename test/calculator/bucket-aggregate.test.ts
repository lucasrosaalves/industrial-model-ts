import { describe, expect, it, vi } from "vitest";
import { Calculator } from "../../src/calculator/calculator";
import { BucketGranularityError } from "../../src/calculator/exceptions";
import { InvalidFormulaError, MissingTimeAxisError } from "../../src/calculator/formula-expression";
import type {
  CalculationResult,
  CalculatorParameter,
  CalculatorQuery,
  ConstantParameter,
  MultiTimeSeriesParameter,
  TimeSeriesParameter,
} from "../../src/calculator/models";
import type {
  CogniteDatapointResultItem,
  CogniteDatapointRetrieveItem,
  CogniteDatapointRetrieveOptions,
} from "../../src/cognite";
import type { DatapointAggregate } from "../../src/types";
import { makeCogniteMock } from "../fixtures/index.js";

// `Calculator` with `sum(...)` / `average(...)` formulas.
//
// Parameters are fetched exactly as declared (here per minute), the formula
// runs on them, and the results are aggregated by the query's
// `bucketGranularity`. The running example is OEE Speed Losses Time,
// `(NSP * RUNT - TTP) / NSP`, whose hourly value is only right when the
// division happens per minute.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const START = new Date("2026-04-15T10:00:00.000Z");
const END = new Date(START.getTime() + 2 * HOUR);
const SLT = "sum((({NSP} * {RUNT}) - {TTP}) / {NSP})";

type Points = Array<[Date, number]>;

/** What one datapoints item asked for, captured per retrieve call. */
type Request = {
  externalId: string;
  start: Date;
  end: Date;
  granularity: string | undefined;
  aggregates: DatapointAggregate[] | undefined;
  timeZone: string | undefined;
};

function shift(moment: Date, milliseconds: number): Date {
  return new Date(moment.getTime() + milliseconds);
}

function toDate(value: string | number | Date | undefined): Date {
  if (value === undefined) {
    throw new Error("request without a start or end");
  }
  return value instanceof Date ? value : new Date(value);
}

/**
 * Answers datapoints retrieves from in-memory series, recording each call.
 *
 * `series` maps `externalId|granularity` (`externalId|raw` for raw points) to
 * points. The same points are served for whatever aggregate is asked, which
 * is what a per-minute curated series looks like at `1m`.
 */
class FakeCdf {
  readonly calls: Request[][] = [];
  readonly cognite = makeCogniteMock();

  constructor(readonly series: Map<string, Points>) {
    this.cognite.retrieveDatapoints = vi.fn(async (options: CogniteDatapointRetrieveOptions) => {
      const requests = options.items.map((item) => snapshot(item, options));
      this.calls.push(requests);
      return { items: requests.map((request) => this.answer(request)) };
    });
  }

  calculator(): Calculator {
    return new Calculator(this.cognite);
  }

  private answer(request: Request): CogniteDatapointResultItem {
    const points = (this.series.get(seriesKey(request.externalId, request.granularity)) ?? [])
      .filter(
        ([timestamp]) =>
          timestamp.getTime() >= request.start.getTime() &&
          timestamp.getTime() < request.end.getTime(),
      )
      .map(([timestamp, value]) =>
        request.aggregates === undefined
          ? { timestamp, value }
          : {
              timestamp,
              ...Object.fromEntries(request.aggregates.map((aggregate) => [aggregate, value])),
            },
      );
    return {
      space: "s",
      externalId: request.externalId,
      isString: false,
      datapoints: points as CogniteDatapointResultItem["datapoints"],
    };
  }
}

function seriesKey(externalId: string, granularity: string | undefined): string {
  return `${externalId}|${granularity ?? "raw"}`;
}

function snapshot(
  item: CogniteDatapointRetrieveItem,
  options: CogniteDatapointRetrieveOptions,
): Request {
  return {
    externalId: item.externalId,
    start: toDate(item.start ?? options.start),
    end: toDate(item.end ?? options.end),
    granularity: item.granularity,
    aggregates: item.aggregates === undefined ? undefined : [...item.aggregates],
    timeZone: item.timeZone,
  };
}

function fakeCdf(series: Record<string, Points> = {}): FakeCdf {
  return new FakeCdf(new Map(Object.entries(series)));
}

function param(
  alias: string,
  externalId: string,
  aggregateType: DatapointAggregate | null = "sum",
  granularity = "1m",
  fillValue?: number,
): TimeSeriesParameter {
  return {
    type: "single_timeseries",
    alias,
    timeSeries: { space: "s", externalId },
    ...(aggregateType === null ? {} : { aggregateType, granularity }),
    ...(fillValue === undefined ? {} : { fillValue }),
  };
}

function constant(alias: string, value: number): ConstantParameter {
  return { type: "constant", alias, value };
}

function sltParameters(granularity = "1m", fillValue?: number): CalculatorParameter[] {
  return [
    param("NSP", "nsp", "average", granularity),
    param("RUNT", "runt", "sum", granularity, fillValue),
    param("TTP", "ttp", "sum", granularity, fillValue),
  ];
}

function hourly(formula: string, parameters: CalculatorParameter[]): CalculatorQuery {
  return { formula, parameters, bucketGranularity: "1h" };
}

function perMinute(start: Date, end: Date, value: (moment: Date) => number | undefined): Points {
  const points: Points = [];
  for (let time = start.getTime(); time < end.getTime(); time += MINUTE) {
    const moment = new Date(time);
    const item = value(moment);
    if (item !== undefined) {
      points.push([moment, item]);
    }
  }
  return points;
}

function nominalSpeed(moment: Date): number {
  // The product changes on the half hour: 10 units/min, then 20.
  return moment.getUTCMinutes() < 30 ? 10 : 20;
}

function sltCdf(throughput: (moment: Date) => number | undefined = () => 8): FakeCdf {
  return fakeCdf({
    "nsp|1m": perMinute(START, END, nominalSpeed),
    "runt|1m": perMinute(START, END, () => 1),
    "ttp|1m": perMinute(START, END, throughput),
  });
}

function calculate(
  cdf: FakeCdf,
  query: CalculatorQuery,
  start: Date = START,
  end: Date = END,
  timeZone?: string,
): Promise<CalculationResult> {
  return cdf.calculator().calculate(query, start, end, timeZone);
}

function expectValues(result: CalculationResult, expected: Points): void {
  expect(result.datapoints.map((point) => point.timestamp)).toEqual(
    expected.map(([timestamp]) => timestamp),
  );
  result.datapoints.forEach((point, index) => {
    expect(point.value).toBeCloseTo((expected[index] as [Date, number])[1], 9);
  });
}

const HOURLY_24: Points = [
  [START, 24],
  [shift(START, HOUR), 24],
];

describe("bucket formulas: calculate on the parameters as fetched, then aggregate", () => {
  it("sum runs per fetched point then sums each bucket", async () => {
    // Per minute: 1 - 8/10 = 0.2 for 30 minutes, 1 - 8/20 = 0.6 for 30.
    // Aggregating first would give (15 * 60 - 480) / 15 = 28 per hour.
    const result = await calculate(sltCdf(), hourly(SLT, sltParameters()));

    expectValues(result, HOURLY_24);
  });

  it("average runs per fetched point then averages each bucket", async () => {
    const result = await calculate(sltCdf(), hourly("average({TTP} / {NSP})", sltParameters()));

    expectValues(result, [
      [START, 0.6],
      [shift(START, HOUR), 0.6],
    ]);
  });

  it("fetches parameters exactly as declared", async () => {
    const cdf = sltCdf();

    await calculate(
      cdf,
      hourly(SLT, sltParameters()),
      shift(START, 37 * MINUTE),
      shift(START, HOUR + 5 * MINUTE),
    );

    expect(cdf.calls).toHaveLength(1);
    const requests = cdf.calls[0] as Request[];
    expect(new Set(requests.map((request) => request.granularity))).toEqual(new Set(["1m"]));
    expect(requests.map((request) => request.aggregates)).toEqual([["average"], ["sum"], ["sum"]]);
    // The window covers the whole hourly buckets that [start, end) touches.
    expect(new Set(requests.map((request) => request.start.getTime()))).toEqual(
      new Set([START.getTime()]),
    );
    expect(new Set(requests.map((request) => request.end.getTime()))).toEqual(
      new Set([END.getTime()]),
    );
  });

  it("returns whole buckets for a mid-bucket window, like CDF", async () => {
    const result = await calculate(
      sltCdf(),
      hourly(SLT, sltParameters()),
      shift(START, 37 * MINUTE),
      shift(START, HOUR + 5 * MINUTE),
    );

    expectValues(result, HOURLY_24);
  });

  it("fetches parameters at another granularity", async () => {
    const cdf = fakeCdf({
      "runt|15m": Array.from({ length: 8 }, (_, index): [Date, number] => [
        shift(START, 15 * MINUTE * index),
        15,
      ]),
    });

    const result = await calculate(
      cdf,
      hourly("sum({RUNT} / 15)", [param("RUNT", "runt", "sum", "15m")]),
    );

    expect(new Set(cdf.calls[0]?.map((request) => request.granularity))).toEqual(new Set(["15m"]));
    expectValues(result, [
      [START, 4],
      [shift(START, HOUR), 4],
    ]);
  });

  it("calculates raw parameters per raw point", async () => {
    const stamps = [5, 20, 3_610, 3_650].map((seconds) => shift(START, seconds * 1000));
    const cdf = fakeCdf({
      "good|raw": stamps.map((timestamp): [Date, number] => [timestamp, 4]),
      "scrap|raw": stamps.map((timestamp): [Date, number] => [timestamp, 1]),
    });

    const result = await calculate(
      cdf,
      hourly("sum({SQ} / ({GQ} + {SQ}))", [param("GQ", "good", null), param("SQ", "scrap", null)]),
    );

    expect(new Set(cdf.calls[0]?.map((request) => request.granularity))).toEqual(
      new Set([undefined]),
    );
    expectValues(result, [
      [START, 0.4],
      [shift(START, HOUR), 0.4],
    ]);
  });

  it("broadcasts constants per fetched point", async () => {
    const result = await calculate(
      sltCdf(),
      hourly("sum({RUNT} * {SECONDS})", [param("RUNT", "runt"), constant("SECONDS", 60)]),
    );

    expectValues(result, [
      [START, 3_600],
      [shift(START, HOUR), 3_600],
    ]);
  });

  it("reduces a multi time series parameter per fetched point", async () => {
    const cdf = fakeCdf({
      "nsp|1m": perMinute(START, END, nominalSpeed),
      "good|1m": perMinute(START, END, () => 6),
      "scrap|1m": perMinute(START, END, () => 2),
    });
    const throughput: MultiTimeSeriesParameter = {
      type: "multi_timeseries",
      alias: "TTP",
      timeSeries: [
        { space: "s", externalId: "good" },
        { space: "s", externalId: "scrap" },
      ],
      reducer: "sum",
      aggregateType: "sum",
      granularity: "1m",
    };

    const result = await calculate(
      cdf,
      hourly("sum({TTP} / {NSP})", [param("NSP", "nsp", "average"), throughput]),
    );

    // 8/10 for 30 minutes + 8/20 for 30 minutes.
    expectValues(result, [
      [START, 36],
      [shift(START, HOUR), 36],
    ]);
  });

  it("keeps a line that reported with a multi time series fillValue", async () => {
    // Scrap reports nothing for the first ten minutes of each hour; good
    // parts from those minutes must still count.
    const cdf = fakeCdf({
      "nsp|1m": perMinute(START, END, nominalSpeed),
      "good|1m": perMinute(START, END, () => 6),
      "scrap|1m": perMinute(START, END, (moment) => (moment.getUTCMinutes() < 10 ? undefined : 2)),
    });
    const throughput: MultiTimeSeriesParameter = {
      type: "multi_timeseries",
      alias: "TTP",
      timeSeries: [
        { space: "s", externalId: "good" },
        { space: "s", externalId: "scrap" },
      ],
      reducer: "sum",
      aggregateType: "sum",
      granularity: "1m",
      fillValue: 0,
    };

    const result = await calculate(
      cdf,
      hourly("sum({TTP})", [param("NSP", "nsp", "average"), throughput]),
    );

    // 10 minutes * 6 + 50 minutes * 8.
    expectValues(result, [
      [START, 460],
      [shift(START, HOUR), 460],
    ]);
  });

  it("runs a guarded division per fetched point", async () => {
    const cdf = fakeCdf({
      "nsp|1m": perMinute(START, END, (moment) => (moment.getUTCMinutes() < 30 ? 0 : 20)),
      "ttp|1m": perMinute(START, END, () => 8),
    });

    const result = await calculate(
      cdf,
      hourly("sum({TTP} / {NSP} if {NSP} != 0 else 0)", [
        param("NSP", "nsp", "average"),
        param("TTP", "ttp"),
      ]),
    );

    expectValues(result, [
      [START, 12],
      [shift(START, HOUR), 12],
    ]);
  });
});

const PERFORMANCE = "sum({TTP}) / sum({NSP} * {RUNT})";

describe("bucket formulas: several bucket terms", () => {
  it("divides a ratio of bucket sums once per bucket", async () => {
    const result = await calculate(sltCdf(), hourly(PERFORMANCE, sltParameters()));

    // 480 produced over 30 * 10 + 30 * 20 = 900 possible.
    expectValues(result, [
      [START, 480 / 900],
      [shift(START, HOUR), 480 / 900],
    ]);
  });

  it("an average of ratios is not the ratio of sums", async () => {
    const result = await calculate(
      sltCdf(),
      hourly("average({TTP} / ({NSP} * {RUNT}))", sltParameters()),
    );

    // Every minute weighs the same: (30 * 0.8 + 30 * 0.4) / 60.
    expect(result.datapoints[0]?.value).toBeCloseTo(0.6, 9);
  });

  it("applies a per-bucket guard and constants outside bucket calls", async () => {
    const cdf = fakeCdf({
      "nsp|1m": perMinute(START, END, (moment) =>
        moment.getTime() < shift(START, HOUR).getTime() ? 0 : 10,
      ),
      "runt|1m": perMinute(START, END, () => 1),
      "ttp|1m": perMinute(START, END, () => 8),
    });

    const result = await calculate(
      cdf,
      hourly("{SCALE} * sum({TTP}) / sum({NSP} * {RUNT}) if sum({NSP} * {RUNT}) != 0 else {IDLE}", [
        ...sltParameters(),
        constant("SCALE", 100),
        constant("IDLE", -1),
      ]),
    );

    expectValues(result, [
      [START, -1],
      [shift(START, HOUR), 80],
    ]);
  });

  it("rejects a time-series parameter outside bucket calls", async () => {
    const cdf = sltCdf();

    const promise = calculate(cdf, hourly("sum({TTP}) / {NSP}", sltParameters()));

    await expect(promise).rejects.toBeInstanceOf(InvalidFormulaError);
    await expect(promise).rejects.toThrow(/must be inside sum/);
    expect(cdf.calls).toEqual([]);
  });

  it("follows the local calendar across DST for daily buckets", async () => {
    // 2026-03-08 is 23 hours long in Denver.
    const start = new Date("2026-03-08T07:00:00.000Z");
    const end = new Date("2026-03-10T06:00:00.000Z");
    const cdf = fakeCdf({ "runt|1m": perMinute(start, end, () => 1) });

    const result = await calculate(
      cdf,
      { formula: "sum({RUNT})", parameters: [param("RUNT", "runt")], bucketGranularity: "1d" },
      start,
      end,
      "America/Denver",
    );

    expectValues(result, [
      [start, 23 * 60],
      [new Date("2026-03-09T06:00:00.000Z"), 24 * 60],
    ]);
    expect(new Set(cdf.calls[0]?.map((request) => request.timeZone))).toEqual(
      new Set(["America/Denver"]),
    );
  });

  it("returns the fetched points the formula ran on as inputs", async () => {
    const result = await calculate(sltCdf(), hourly(SLT, sltParameters()));

    expect(result.datapoints).toHaveLength(2);
    expect(new Set(Object.values(result.inputs).map((series) => series.length))).toEqual(
      new Set([120]),
    );
    expect(result.inputs.NSP?.[0]).toEqual({ timestamp: START, value: 10 });
  });

  it("a plain formula ignores bucketGranularity", async () => {
    const cdf = fakeCdf({ "runt|1h": [[START, 60]] });

    const result = await calculate(cdf, {
      formula: "{RUNT}",
      parameters: [param("RUNT", "runt", "sum", "1h")],
      bucketGranularity: "1d",
    });

    expectValues(result, [[START, 60]]);
    expect(cdf.calls[0]?.map((request) => [request.start, request.end])).toEqual([[START, END]]);
  });
});

function idleFirstTenMinutes(moment: Date): number | undefined {
  return moment.getTime() < shift(START, 10 * MINUTE).getTime() ? undefined : 8;
}

describe("bucket formulas: missing points and fillValue", () => {
  it("drops a minute without throughput by default", async () => {
    const result = await calculate(sltCdf(idleFirstTenMinutes), hourly(SLT, sltParameters()));

    // 20 * 0.2 + 30 * 0.6: the ten running minutes without output are lost.
    expect(result.datapoints[0]?.value).toBeCloseTo(22, 9);
  });

  it("counts a minute without throughput as zero with fillValue", async () => {
    const result = await calculate(
      sltCdf(idleFirstTenMinutes),
      hourly(SLT, sltParameters("1m", 0)),
    );

    // 10 * (1 - 0) + 20 * 0.2 + 30 * 0.6.
    expectValues(result, [
      [START, 32],
      [shift(START, HOUR), 24],
    ]);
    expect(result.inputs.TTP?.[0]?.value).toBe(0);
  });
});

describe("bucket formulas: batching", () => {
  it("retrieves bucket and plain queries once per window", async () => {
    const cdf = sltCdf();
    cdf.series.set("runt|1h", [
      [START, 60],
      [shift(START, HOUR), 60],
    ]);
    const start = shift(START, 37 * MINUTE);

    const results = await cdf
      .calculator()
      .calculateMultiples(
        [
          { formula: "{RUNT}", parameters: [param("RUNT", "runt", "sum", "1h")] },
          hourly(SLT, sltParameters()),
        ],
        start,
        END,
      );

    expect(cdf.calls).toHaveLength(2);
    const [plain, bucketed] = cdf.calls as [Request[], Request[]];
    expect(plain.map((request) => [request.granularity, request.start])).toEqual([["1h", start]]);
    expect(
      new Set(bucketed.map((request) => `${request.granularity}|${request.start.toISOString()}`)),
    ).toEqual(new Set([`1m|${START.toISOString()}`]));
    expectValues(results[0] as CalculationResult, [[shift(START, HOUR), 60]]);
    expectValues(results[1] as CalculationResult, HOURLY_24);
  });

  it("bucket queries on one granularity share a retrieve", async () => {
    const cdf = sltCdf();

    const results = await cdf
      .calculator()
      .calculateMultiples(
        [hourly(SLT, sltParameters()), hourly("sum({TTP} / {NSP})", sltParameters())],
        START,
        END,
      );

    expect(cdf.calls).toHaveLength(1);
    expect(cdf.calls[0]).toHaveLength(3); // deduplicated across both queries
    expect(results.map((result) => result.datapoints.length)).toEqual([2, 2]);
  });
});

describe("bucket formulas: invalid queries fail before any retrieve", () => {
  it.each<{
    name: string;
    formula: string;
    parameters: CalculatorParameter[];
    bucketGranularity: string | undefined;
    match: RegExp;
  }>([
    {
      name: "missing bucketGranularity",
      formula: "sum({A})",
      parameters: [param("A", "a")],
      bucketGranularity: undefined,
      match: /needs bucketGranularity/,
    },
    {
      name: "unsupported bucketGranularity",
      formula: "sum({A})",
      parameters: [param("A", "a")],
      bucketGranularity: "1fortnight",
      match: /unsupported bucketGranularity/,
    },
    {
      name: "parameter coarser than bucketGranularity",
      formula: "sum({A} + {B})",
      parameters: [param("A", "a", "sum", "1m"), param("B", "b", "sum", "1d")],
      bucketGranularity: "1h",
      match: /coarser than bucketGranularity '1h': B \(1d\)/,
    },
  ])("rejects $name without retrieving", async ({
    formula,
    parameters,
    bucketGranularity,
    match,
  }) => {
    const cdf = fakeCdf();
    const query: CalculatorQuery =
      bucketGranularity === undefined
        ? { formula, parameters }
        : { formula, parameters, bucketGranularity };

    const promise = calculate(cdf, query);

    await expect(promise).rejects.toBeInstanceOf(BucketGranularityError);
    await expect(promise).rejects.toThrow(match);
    expect(cdf.calls).toEqual([]);
  });

  it("a bucket query with only constants has no time axis", async () => {
    const cdf = fakeCdf();

    await expect(
      calculate(cdf, {
        formula: "sum({K})",
        parameters: [constant("K", 1)],
        bucketGranularity: "1h",
      }),
    ).rejects.toBeInstanceOf(MissingTimeAxisError);
    expect(cdf.calls).toEqual([]);
  });
});
