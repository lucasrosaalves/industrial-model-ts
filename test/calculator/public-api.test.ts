import { describe, expect, it } from "vitest";
import type {
  AlignmentMode,
  CalculationResult,
  CalculatorParameter,
  CalculatorQuery,
  ConstantParameter,
  DataPoint,
  MultiTimeSeriesParameter,
  ReducerType,
  Series,
  TimeSeriesParameter,
} from "../../src/calculator";
import * as calculator from "../../src/calculator";

const EXPECTED_RUNTIME_EXPORTS = [
  "ArithmeticError",
  "Calculator",
  "CalculatorError",
  "DatapointsRetrievalError",
  "FormulaError",
  "InvalidFormulaError",
  "MissingParameterError",
  "MissingTimeAxisError",
  "OverflowError",
  "ParameterError",
  "ParameterLengthError",
  "ParameterTimestampError",
  "ZeroDivisionError",
  "clearCache",
  "compileFormula",
  "evaluate",
  "validateCalculatorQueries",
  "validateCalculatorQuery",
];

describe("calculator public API", () => {
  it("public names match the expected surface", () => {
    expect(Object.keys(calculator).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
  });

  it("evaluate is re-exported from the package", () => {
    expect(calculator.evaluate("{A} + 1", { A: [1, 2] })).toEqual([2, 3]);
  });

  it("exports every model and error type the calculator API mentions", () => {
    // Compile-time assertion: this file fails to build if any of these type
    // exports is dropped from the calculator subpath.
    const parameters: CalculatorParameter[] = [
      { type: "constant", alias: "C", value: 1 } satisfies ConstantParameter,
      {
        type: "single_timeseries",
        alias: "A",
        timeSeries: { space: "s", externalId: "x" },
      } satisfies TimeSeriesParameter,
      {
        type: "multi_timeseries",
        alias: "B",
        timeSeries: [
          { space: "s", externalId: "x1" },
          { space: "s", externalId: "x2" },
        ],
        reducer: "sum" satisfies ReducerType,
      } satisfies MultiTimeSeriesParameter,
    ];
    const alignment: AlignmentMode = "intersect";
    const query: CalculatorQuery = { formula: "{A} + {B} + {C}", parameters, alignment };
    const series: Series = [{ timestamp: new Date(0), value: 1 } satisfies DataPoint];
    const result: CalculationResult = {
      query,
      datapoints: series,
      inputs: { A: series, B: series, C: series },
    };

    expect(result.query.parameters).toHaveLength(3);
    expect(result.datapoints).toHaveLength(1);
    expect(Object.keys(result.inputs)).toEqual(["A", "B", "C"]);
  });
});
