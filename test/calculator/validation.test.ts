import { describe, expect, it } from "vitest";
import {
  type CalculatorParameter,
  type CalculatorQuery,
  instanceIdsOf,
  type ReducerType,
} from "../../src/calculator/models";
import {
  validateCalculatorQueries,
  validateCalculatorQuery,
} from "../../src/calculator/validation";

const TS_1 = { space: "s", externalId: "x1" };
const TS_2 = { space: "s", externalId: "x2" };

function queryWith(...parameters: unknown[]): unknown {
  return { formula: "{A}", parameters };
}

function validate(query: unknown): void {
  validateCalculatorQuery(query);
}

describe("calculator validation: type tags", () => {
  it("accepts the constant type tag", () => {
    expect(() => validate(queryWith({ type: "constant", alias: "A", value: 1 }))).not.toThrow();
  });

  it("accepts the single_timeseries type tag", () => {
    expect(() =>
      validate(queryWith({ type: "single_timeseries", alias: "A", timeSeries: TS_1 })),
    ).not.toThrow();
  });

  it("accepts the multi_timeseries type tag", () => {
    expect(() =>
      validate(
        queryWith({
          type: "multi_timeseries",
          alias: "A",
          timeSeries: [TS_1, TS_2],
          reducer: "sum",
        }),
      ),
    ).not.toThrow();
  });

  it("resolves parameters by type tag", () => {
    const payload = {
      formula: "{A} + {B} + {C}",
      parameters: [
        { type: "single_timeseries", alias: "A", timeSeries: TS_1 },
        { type: "constant", alias: "B", value: 1 },
        { type: "multi_timeseries", alias: "C", timeSeries: [TS_1, TS_2], reducer: "sum" },
      ],
    };

    expect(() => validate(payload)).not.toThrow();
  });

  it("rejects a parameter with no type tag", () => {
    // A parameter built by hand (e.g. from an external API payload) that omits
    // the discriminator can't be resolved to any parameter kind.
    expect(() => validate(queryWith({ alias: "A", timeSeries: TS_1 }))).toThrow(/type/);
  });

  it("rejects an unknown type tag", () => {
    expect(() => validate(queryWith({ type: "series", alias: "A", timeSeries: TS_1 }))).toThrow();
  });

  it("JSON round trip re-validates", () => {
    const query: CalculatorQuery = {
      formula: "{A} + {B}",
      parameters: [
        { type: "single_timeseries", alias: "A", timeSeries: TS_1 },
        { type: "constant", alias: "B", value: 2 },
      ],
    };

    const roundTripped = JSON.parse(JSON.stringify(query));

    expect(roundTripped).toEqual(query);
    expect(() => validate(roundTripped)).not.toThrow();
  });
});

describe("calculator validation: MultiTimeSeriesParameter", () => {
  it("multi timeseries parameter rejects empty instance id list", () => {
    expect(() =>
      validate(queryWith({ type: "multi_timeseries", alias: "A", timeSeries: [], reducer: "sum" })),
    ).toThrow(/at least two timeseries/);
  });

  it("multi timeseries parameter rejects a single instance id", () => {
    // A single time series should be expressed as a single_timeseries parameter.
    expect(() =>
      validate(
        queryWith({ type: "multi_timeseries", alias: "A", timeSeries: [TS_1], reducer: "sum" }),
      ),
    ).toThrow(/at least two timeseries/);
  });

  it("multi timeseries parameter requires reducer field", () => {
    expect(() =>
      validate(queryWith({ type: "multi_timeseries", alias: "A", timeSeries: [TS_1, TS_2] })),
    ).toThrow(/reducer/);
  });

  it("multi timeseries parameter rejects duplicate instance ids", () => {
    expect(() =>
      validate(
        queryWith({
          type: "multi_timeseries",
          alias: "A",
          timeSeries: [TS_1, TS_1],
          reducer: "sum",
        }),
      ),
    ).toThrow(/duplicate timeseries instance ids/);
  });

  it("aggregate without granularity is rejected at validation", () => {
    expect(() =>
      validate(
        queryWith({
          type: "single_timeseries",
          alias: "A",
          timeSeries: TS_1,
          aggregateType: "average",
        }),
      ),
    ).toThrow(/Missing granularity for 'A'/);
  });

  it("multi timeseries aggregate without granularity is rejected", () => {
    expect(() =>
      validate(
        queryWith({
          type: "multi_timeseries",
          alias: "A",
          timeSeries: [TS_1, TS_2],
          aggregateType: "sum",
          reducer: "sum",
        }),
      ),
    ).toThrow(/Missing granularity for 'A'/);
  });

  it("multi timeseries parameter with two ids and reducer is valid", () => {
    const parameter: CalculatorParameter = {
      type: "multi_timeseries",
      alias: "A",
      timeSeries: [TS_1, TS_2],
      reducer: "average",
    };

    expect(() => validate(queryWith(parameter))).not.toThrow();
    expect(instanceIdsOf(parameter)).toHaveLength(2);
  });

  it("single timeseries parameter has no reducer field", () => {
    const parameter = {
      type: "single_timeseries",
      alias: "A",
      timeSeries: TS_1,
    } satisfies CalculatorParameter;

    expect(parameter).not.toHaveProperty("reducer");
    expect(instanceIdsOf(parameter)).toEqual([TS_1]);
  });

  it("multi timeseries parameter instance ids preserves order", () => {
    const parameter = {
      type: "multi_timeseries",
      alias: "A",
      timeSeries: [TS_1, TS_2],
      reducer: "sum",
    } satisfies CalculatorParameter;

    expect(instanceIdsOf(parameter)).toEqual([TS_1, TS_2]);
  });
});

describe("calculator validation: ReducerType and AlignmentMode", () => {
  const reducers: ReducerType[] = ["min", "max", "sum", "average"];

  it.each(reducers)("reducer type accepts the %s literal", (reducer) => {
    expect(() =>
      validate(
        queryWith({ type: "multi_timeseries", alias: "A", timeSeries: [TS_1, TS_2], reducer }),
      ),
    ).not.toThrow();
  });

  it("reducer type rejects unknown value", () => {
    expect(() =>
      validate(
        queryWith({
          type: "multi_timeseries",
          alias: "A",
          timeSeries: [TS_1, TS_2],
          reducer: "median",
        }),
      ),
    ).toThrow();
  });

  it("treats a missing alignment as valid, defaulting to intersect", () => {
    const query = queryWith({ type: "constant", alias: "A", value: 1 }) as CalculatorQuery;

    expect(() => validate(query)).not.toThrow();
    expect(query.alignment).toBeUndefined();
  });

  it("accepts the strict alignment string", () => {
    expect(() =>
      validate({
        formula: "{A}",
        parameters: [{ type: "constant", alias: "A", value: 1 }],
        alignment: "strict",
      }),
    ).not.toThrow();
  });

  it("rejects unknown alignment", () => {
    expect(() =>
      validate({
        formula: "{A}",
        parameters: [{ type: "constant", alias: "A", value: 1 }],
        alignment: "union",
      }),
    ).toThrow();
  });
});

describe("calculator validation: duplicate aliases", () => {
  it("rejects duplicate aliases", () => {
    expect(() =>
      validate({
        formula: "{A} + {A}",
        parameters: [
          { type: "constant", alias: "A", value: 1 },
          { type: "constant", alias: "A", value: 2 },
        ],
      }),
    ).toThrow(/duplicate parameter alias/);
  });

  it("rejects duplicate aliases across parameter types", () => {
    expect(() =>
      validate({
        formula: "{A}",
        parameters: [
          { type: "constant", alias: "A", value: 1 },
          { type: "single_timeseries", alias: "A", timeSeries: TS_1 },
        ],
      }),
    ).toThrow(/duplicate parameter alias/);
  });

  it("error lists every duplicate alias", () => {
    expect(() =>
      validate({
        formula: "{A} + {B}",
        parameters: [
          { type: "constant", alias: "A", value: 1 },
          { type: "constant", alias: "A", value: 2 },
          { type: "constant", alias: "B", value: 3 },
          { type: "constant", alias: "B", value: 4 },
        ],
      }),
    ).toThrow(/duplicate parameter alias\(es\): A, B/);
  });

  it("allows unique aliases", () => {
    expect(() =>
      validate({
        formula: "{A} + {B}",
        parameters: [
          { type: "constant", alias: "A", value: 1 },
          { type: "constant", alias: "B", value: 2 },
        ],
      }),
    ).not.toThrow();
  });

  it("allows a single parameter", () => {
    expect(() => validate(queryWith({ type: "constant", alias: "A", value: 1 }))).not.toThrow();
  });

  it("allows zero parameters", () => {
    // No aliases at all means no duplicates - the formula engine, not this
    // validator, is responsible for rejecting a parameter-less formula.
    expect(() => validate({ formula: "42", parameters: [] })).not.toThrow();
  });

  it("validateCalculatorQueries reports problems from more than one query", () => {
    expect(() =>
      validateCalculatorQueries([
        {
          formula: "{A}",
          parameters: [
            { type: "constant", alias: "A", value: 1 },
            { type: "constant", alias: "A", value: 2 },
          ],
        },
        {
          formula: "{B}",
          parameters: [{ type: "constant", alias: "B", value: 1 }],
          alignment: "union",
        },
      ]),
    ).toThrow(/queries\.0[\s\S]*queries\.1/);
  });
});

describe("calculator validation: fillValue and bucketGranularity", () => {
  function seriesParam(fillValue?: number): unknown {
    return {
      type: "single_timeseries",
      alias: "A",
      timeSeries: TS_1,
      ...(fillValue === undefined ? {} : { fillValue }),
    };
  }

  it("fillValue is optional", () => {
    expect(() => validate(queryWith(seriesParam()))).not.toThrow();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])("fillValue must be finite (%s)", (value) => {
    expect(() => validate(queryWith(seriesParam(value)))).toThrow(/fillValue/);
  });

  it("fillValue is rejected with strict alignment", () => {
    expect(() =>
      validate({ formula: "{A}", parameters: [seriesParam(0)], alignment: "strict" }),
    ).toThrow(/fillValue needs alignment/);
  });

  it("fillValue is accepted with intersect alignment", () => {
    expect(() => validate(queryWith(seriesParam(0)))).not.toThrow();
    expect(() =>
      validate({ formula: "{A}", parameters: [seriesParam(0)], alignment: "intersect" }),
    ).not.toThrow();
  });

  it("bucketGranularity is optional", () => {
    expect(() => validate({ formula: "{A}", parameters: [] })).not.toThrow();
    expect(() =>
      validate({ formula: "{A}", parameters: [], bucketGranularity: "1h" }),
    ).not.toThrow();
  });
});
