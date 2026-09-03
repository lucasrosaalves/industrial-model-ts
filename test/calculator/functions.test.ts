import { describe, expect, it } from "vitest";
import {
  evaluate,
  InvalidFormulaError,
  ZeroDivisionError,
} from "../../src/calculator/formula-expression";

function expectClose(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index] as number, 10);
  }
}

describe("rolling_average", () => {
  it("uses partial windows then a full simple moving average", () => {
    expectClose(evaluate("rolling_average({A}, 3)", { A: [10, 20, 30, 40] }), [10, 15, 20, 30]);
  });

  it("is the identity when the window is 1", () => {
    expectClose(evaluate("rolling_average({A}, 1)", { A: [4, 8, 15] }), [4, 8, 15]);
  });

  it("is the expanding mean when the window is larger than the series", () => {
    expectClose(evaluate("rolling_average({A}, 5)", { A: [2, 4, 6] }), [2, 3, 4]);
  });

  it("returns an empty result for an empty series", () => {
    expect(evaluate("rolling_average({A}, 3)", { A: [] })).toEqual([]);
  });

  it("returns the single point when the series has length 1", () => {
    expectClose(evaluate("rolling_average({A}, 24)", { A: [42] }), [42]);
  });

  it("matches an independent simple moving average on mixed values", () => {
    const values = [3, -1, 0, 8.5, -4, 2, 2, 10, -0.5, 1.5];
    const window = 4;
    const result = evaluate("rolling_average({A}, 4)", { A: values });
    const expected = values.map((_, index) => {
      const start = Math.max(0, index - window + 1);
      const slice = values.slice(start, index + 1);
      return slice.reduce((sum, value) => sum + value, 0) / slice.length;
    });
    expectClose(result, expected);
  });

  it("still raises on unguarded division inside the window", () => {
    expect(() => evaluate("rolling_average({A} / {B}, 2)", { A: [10, 20], B: [2, 0] })).toThrow(
      ZeroDivisionError,
    );
  });

  it("composes with another parameter", () => {
    expectClose(
      evaluate("rolling_average({A}, 3) - {B}", { A: [10, 20, 30, 40], B: [1, 2, 3, 4] }),
      [9, 13, 17, 26],
    );
  });

  it("averages an inner expression", () => {
    expectClose(
      evaluate("rolling_average({A} + {B}, 2)", { A: [1, 2, 3], B: [10, 20, 30] }),
      [11, 16.5, 27.5],
    );
  });

  it("nests rolling_average calls", () => {
    expectClose(
      evaluate("rolling_average(rolling_average({A}, 2), 2)", { A: [10, 20, 30, 40] }),
      [10, 12.5, 20, 30],
    );
  });

  it("averages a guarded division", () => {
    expectClose(
      evaluate("rolling_average({A} / {B} if {B} != 0 else 0, 2)", {
        A: [10, 20, 30, 40],
        B: [2, 0, 5, 10],
      }),
      [5, 2.5, 3, 5],
    );
  });

  it("uses neighboring indexes when rolling_average is inside a ternary", () => {
    expectClose(
      evaluate("rolling_average({A}, 2) if {B} > 0 else 0", { A: [10, 20, 30], B: [1, 0, 1] }),
      [10, 0, 25],
    );
  });

  it("still matches a nested rolling_average when a ternary forces the element-wise path", () => {
    expectClose(
      evaluate("rolling_average(rolling_average({A}, 2), 2) if {B} > 0 else 0", {
        A: [10, 20, 30, 40],
        B: [1, 1, 1, 1],
      }),
      [10, 12.5, 20, 30],
    );
  });

  it("keeps rolling_average aligned when a ternary is elsewhere in the formula", () => {
    expectClose(
      evaluate("rolling_average({A}, 3) + ({B} if {B} > 0 else 0)", {
        A: [10, 20, 30, 40],
        B: [1, 0, 1, 1],
      }),
      [11, 15, 21, 31],
    );
  });

  it("does not run rolling_average when the call is never selected", () => {
    expectClose(
      evaluate("rolling_average({A} / {B}, 2) if {C} > 0 else 0", {
        A: [10, 20],
        B: [0, 0],
        C: [0, 0],
      }),
      [0, 0],
    );
  });

  it("raises when an outer guard wraps unguarded division inside the window", () => {
    expect(() =>
      evaluate("rolling_average({A} / {B}, 2) if {B} != 0 else 0", {
        A: [10, 20, 30],
        B: [2, 0, 5],
      }),
    ).toThrow(ZeroDivisionError);
  });

  it("accepts a folded window expression", () => {
    expectClose(
      evaluate("rolling_average({A}, 2 + 2)", { A: [1, 2, 3, 4, 5] }),
      [1, 1.5, 2, 2.5, 3.5],
    );
  });

  it("accepts an integral float window", () => {
    expectClose(evaluate("rolling_average({A}, 6 / 2)", { A: [10, 20, 30, 40] }), [10, 15, 20, 30]);
  });

  it("accepts a folded window that is an integer up to float noise", () => {
    expectClose(
      evaluate("rolling_average({A}, 8.3 - 5.3)", { A: [10, 20, 30, 40] }),
      [10, 15, 20, 30],
    );
  });

  it("leaves a scalar argument unchanged", () => {
    expectClose(evaluate("rolling_average(5, 3) + {A}", { A: [1, 2, 3] }), [6, 7, 8]);
  });

  it.each([
    ["foo({A})", /unknown formula function: foo/],
    ["rolling_average({A})", /takes 2 arguments, got 1/],
    ["rolling_average({A}, 3, 4)", /takes 2 arguments, got 3/],
    ["rolling_average({A}, window=3)", /does not accept keyword arguments/],
    ["rolling_average(*{A}, 3)", /does not accept starred arguments/],
    ["rolling_average({A}, *3)", /does not accept starred arguments/],
    ["rolling_average({A}, {B})", /window must be a numeric constant/],
    ["rolling_average({A}, 0)", /window must be a positive integer/],
    ["rolling_average({A}, -1)", /window must be a positive integer/],
    ["rolling_average({A}, 1.5)", /window must be a positive integer/],
    ["{A} + rolling_average", /unknown formula identifier/],
  ] as Array<[string, RegExp]>)("rejects invalid call %s", (formula, match) => {
    expect(() => evaluate(formula, { A: [1, 2], B: [3, 4] })).toThrow(InvalidFormulaError);
    expect(() => evaluate(formula, { A: [1, 2], B: [3, 4] })).toThrow(match);
  });
});
