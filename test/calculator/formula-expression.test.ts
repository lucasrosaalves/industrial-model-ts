import { beforeEach, describe, expect, it } from "vitest";
import { CalculatorError } from "../../src/calculator/exceptions";
import {
  ArithmeticError,
  clearCache,
  compileFormula,
  evaluate,
  FormulaError,
  InvalidFormulaError,
  MissingParameterError,
  MissingTimeAxisError,
  OverflowError,
  ParameterError,
  ParameterLengthError,
  ParameterTimestampError,
  ZeroDivisionError,
} from "../../src/calculator/formula-expression";

beforeEach(() => {
  clearCache();
});

// ─── arithmetic ──────────────────────────────────────────────────────────────

describe("evaluate: arithmetic", () => {
  it("adds two aligned series element-wise", () => {
    expect(evaluate("{A} + {B}", { A: [1, 2, 3], B: [10, 20, 30] })).toEqual([11, 22, 33]);
  });

  it("subtracts, multiplies and divides element-wise", () => {
    expect(evaluate("{A} - {B}", { A: [5, 5], B: [1, 2] })).toEqual([4, 3]);
    expect(evaluate("{A} * {B}", { A: [2, 3], B: [4, 5] })).toEqual([8, 15]);
    expect(evaluate("{A} / {B}", { A: [10, 9], B: [2, 3] })).toEqual([5, 3]);
  });

  it("broadcasts a scalar constant across the whole series", () => {
    expect(evaluate("{A} * 2", { A: [1, 2, 3] })).toEqual([2, 4, 6]);
    expect(evaluate("2 * {A}", { A: [1, 2, 3] })).toEqual([2, 4, 6]);
    expect(evaluate("{A} + 0.5", { A: [1, 2] })).toEqual([1.5, 2.5]);
  });

  it("honors operator precedence", () => {
    expect(evaluate("{A} + {B} * 2", { A: [1], B: [3] })).toEqual([7]);
    expect(evaluate("({A} + {B}) * 2", { A: [1], B: [3] })).toEqual([8]);
  });

  it("applies unary plus and minus", () => {
    expect(evaluate("-{A}", { A: [1, -2] })).toEqual([-1, 2]);
    expect(evaluate("+{A}", { A: [1, -2] })).toEqual([1, -2]);
  });

  it("treats ** as right-associative and tighter than unary minus on the left", () => {
    expect(evaluate("2 ** {A}", { A: [3] })).toEqual([8]);
    expect(evaluate("-{A} ** 2", { A: [3] })).toEqual([-9]);
    expect(evaluate("{A} ** {B} ** {C}", { A: [2], B: [2], C: [3] })).toEqual([256]);
  });

  it("allows a unary exponent (2 ** -1)", () => {
    expect(evaluate("2 ** -1 * {A}", { A: [4] })).toEqual([2]);
  });

  it("uses remainder whose sign follows the divisor", () => {
    expect(evaluate("{A} % {B}", { A: [-5], B: [3] })).toEqual([1]);
    expect(evaluate("{A} % {B}", { A: [5], B: [-3] })).toEqual([-1]);
    expect(evaluate("{A} % {B}", { A: [5.5], B: [2] })).toEqual([1.5]);
  });

  it("parses numeric literals with decimals and exponents", () => {
    expect(evaluate("{A} + .5", { A: [1] })).toEqual([1.5]);
    expect(evaluate("{A} * 1e3", { A: [2] })).toEqual([2000]);
  });
});

// ─── placeholders & normalization ────────────────────────────────────────────

describe("evaluate: placeholders and normalization", () => {
  it("reuses the same series for a repeated placeholder", () => {
    expect(evaluate("{A} + {A}", { A: [1, 2] })).toEqual([2, 4]);
  });

  it("collapses arbitrary whitespace before compiling", () => {
    expect(evaluate("  {A}   +\t{B}\n ", { A: [1], B: [2] })).toEqual([3]);
  });

  it("ignores parameters that are not referenced by the formula", () => {
    expect(evaluate("{A} + 1", { A: [1, 2], B: [9, 9, 9] })).toEqual([2, 3]);
  });
});

// ─── comparisons, boolean & conditional ──────────────────────────────────────

describe("evaluate: comparisons and conditionals", () => {
  it("returns 1/0 for comparison operators", () => {
    expect(evaluate("{A} > {B}", { A: [1, 5], B: [3, 3] })).toEqual([0, 1]);
    expect(evaluate("{A} == {B}", { A: [1, 2], B: [1, 9] })).toEqual([1, 0]);
    expect(evaluate("{A} != {B}", { A: [1, 2], B: [1, 9] })).toEqual([0, 1]);
    expect(evaluate("{A} <= {B}", { A: [1, 3], B: [1, 2] })).toEqual([1, 0]);
  });

  it("supports chained comparisons", () => {
    expect(evaluate("{A} < {B} < {C}", { A: [1, 1], B: [2, 9], C: [3, 3] })).toEqual([1, 0]);
  });

  it("returns 1/0 for boolean operators", () => {
    expect(evaluate("{A} and {B}", { A: [1, 0], B: [1, 1] })).toEqual([1, 0]);
    expect(evaluate("{A} or {B}", { A: [0, 0], B: [1, 0] })).toEqual([1, 0]);
  });

  it("evaluates only the selected branch of a conditional", () => {
    const result = evaluate("{A} / {B} if {B} != 0 else 0", { A: [10, 5], B: [2, 0] });
    expect(result).toEqual([5, 0]);
  });

  it("short-circuits boolean operators to avoid value-dependent failures", () => {
    const result = evaluate("({B} != 0) and ({A} / {B} > 1)", { A: [10, 5], B: [2, 0] });
    expect(result).toEqual([1, 0]);
  });

  it("supports nested conditionals in the else branch", () => {
    const result = evaluate("{A} if {A} > 0 else (-{A} if {A} < 0 else 0)", { A: [5, -3, 0] });
    expect(result).toEqual([5, 3, 0]);
  });
});

// ─── empty series ────────────────────────────────────────────────────────────

describe("evaluate: empty series", () => {
  it("returns an empty result when every referenced parameter is empty", () => {
    expect(evaluate("{A} + {B}", { A: [], B: [] })).toEqual([]);
  });

  it("treats a mix of empty and non-empty parameters as a length mismatch", () => {
    expect(() => evaluate("{A} + {B}", { A: [], B: [1] })).toThrow(ParameterLengthError);
  });
});

// ─── structural errors ───────────────────────────────────────────────────────

describe("evaluate: structural errors", () => {
  it("rejects an empty formula", () => {
    expect(() => evaluate("   ", { A: [1] })).toThrow(InvalidFormulaError);
    expect(() => evaluate("   ", { A: [1] })).toThrow(/must not be empty/);
  });

  it("rejects a formula that references no parameters", () => {
    expect(() => evaluate("1 + 1")).toThrow(/at least one parameter/);
  });

  it("rejects invalid placeholder syntax", () => {
    expect(() => evaluate("{A} + {1bad}", { A: [1] })).toThrow(/invalid placeholder syntax/);
  });

  it("rejects unknown identifiers", () => {
    expect(() => evaluate("{A} + B", { A: [1] })).toThrow(/unknown formula identifier: B/);
  });

  it("rejects boolean and None literals as non-numeric constants", () => {
    expect(() => evaluate("{A} + True", { A: [1] })).toThrow(/only numeric constants/);
    expect(() => evaluate("{A} + None", { A: [1] })).toThrow(/only numeric constants/);
  });

  it("rejects malformed syntax", () => {
    expect(() => evaluate("{A} +", { A: [1] })).toThrow(InvalidFormulaError);
    expect(() => evaluate("{A} {A}", { A: [1] })).toThrow(InvalidFormulaError);
    expect(() => evaluate("{A} $ {A}", { A: [1] })).toThrow(InvalidFormulaError);
  });

  it("reports missing parameters", () => {
    try {
      evaluate("{A} + {B}", { A: [1] });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingParameterError);
      expect((error as MissingParameterError).missing).toEqual(["B"]);
    }
  });

  it("reports parameter length mismatches", () => {
    try {
      evaluate("{A} + {B}", { A: [1, 2], B: [1] });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ParameterLengthError);
      expect(error).toBeInstanceOf(ParameterError);
      expect((error as ParameterLengthError).lengths).toEqual({ A: 2, B: 1 });
      expect((error as Error).message).toContain("'A' has 2");
      expect((error as Error).message).toContain("'B' has 1");
    }
  });

  it("rejects non-numeric and non-array parameter values", () => {
    expect(() => evaluate("{A}", { A: ["x"] as unknown as number[] })).toThrow(ParameterError);
    expect(() => evaluate("{A}", { A: 5 as unknown as number[] })).toThrow(ParameterError);
    expect(() => evaluate("{A}", { A: [true] as unknown as number[] })).toThrow(ParameterError);
  });

  it("exposes InvalidFormulaError as a FormulaError", () => {
    expect(() => evaluate("")).toThrow(FormulaError);
  });

  it("formula errors are catchable as calculator error", () => {
    // FormulaError hangs off the package-wide root so a caller can catch
    // every calculator failure - formula or retrieval - with one except.
    expect(new FormulaError("x")).toBeInstanceOf(CalculatorError);
    expect(() => evaluate("{A}", {})).toThrow(CalculatorError);
  });

  it("parameter timestamp error lists aliases", () => {
    const error = new ParameterTimestampError(["A", "B"]);

    expect(error).toBeInstanceOf(ParameterError);
    expect(error.aliases).toEqual(["A", "B"]);
    expect(error.message).toContain("timestamp mismatch");
    expect(error.message).toContain("A");
    expect(error.message).toContain("B");
  });

  it("missing time axis error lists aliases", () => {
    const error = new MissingTimeAxisError(["A", "B"]);

    expect(error).toBeInstanceOf(ParameterError);
    expect(error.aliases).toEqual(["A", "B"]);
    expect(error.message).toContain("no time-series parameter");
  });
});

// ─── arithmetic errors ───────────────────────────────────────────────────────

describe("evaluate: arithmetic errors", () => {
  it("throws ZeroDivisionError on division by zero", () => {
    expect(() => evaluate("{A} / {B}", { A: [1], B: [0] })).toThrow(ZeroDivisionError);
    expect(() => evaluate("{A} / {B}", { A: [1], B: [0] })).toThrow(ArithmeticError);
  });

  it("throws ZeroDivisionError on modulo by zero", () => {
    expect(() => evaluate("{A} % {B}", { A: [1], B: [0] })).toThrow(ZeroDivisionError);
  });

  it("throws ZeroDivisionError when raising zero to a negative power", () => {
    expect(() => evaluate("{A} ** -1", { A: [0] })).toThrow(ZeroDivisionError);
  });

  it("throws OverflowError on overflowing exponentiation", () => {
    expect(() => evaluate("{A} ** {B}", { A: [10], B: [1000] })).toThrow(OverflowError);
  });

  it("does not wrap arithmetic errors in FormulaError", () => {
    let caught: unknown;
    try {
      evaluate("{A} / 0", { A: [1] });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ZeroDivisionError);
    expect(caught).not.toBeInstanceOf(FormulaError);
  });
});

// ─── caching / compileFormula ────────────────────────────────────────────────

describe("compileFormula", () => {
  it("caches compiled formulas keyed by normalized text", () => {
    const first = compileFormula("{A} + {B}");
    const second = compileFormula("  {A}   +   {B} ");
    expect(second).toBe(first);
  });

  it("recompiles after the cache is cleared", () => {
    const first = compileFormula("{A} + {B}");
    clearCache();
    const second = compileFormula("{A} + {B}");
    expect(second).not.toBe(first);
    expect(second.variables).toEqual(["A", "B"]);
    expect(second.hasConditional).toBe(false);
  });

  it("flags formulas that require element-wise evaluation", () => {
    expect(compileFormula("{A} + {B}").hasConditional).toBe(false);
    expect(compileFormula("{A} if {B} > 0 else 0").hasConditional).toBe(true);
    expect(compileFormula("{A} > {B}").hasConditional).toBe(true);
    expect(compileFormula("{A} and {B}").hasConditional).toBe(true);
  });

  it("preserves variable order without duplicates", () => {
    expect(compileFormula("{B} + {A} + {B}").variables).toEqual(["B", "A"]);
  });

  it("rewrites placeholders to internal names and stores the mapping", () => {
    const compiled = compileFormula("{APV} - {FPV}");
    expect(compiled.expression).toBe("__formula_expression_param_0 - __formula_expression_param_1");
    expect(compiled.nameMap.get("APV")).toBe("__formula_expression_param_0");
    expect(compiled.nameMap.get("FPV")).toBe("__formula_expression_param_1");
  });

  it("stores the whitespace-normalized raw formula", () => {
    expect(compileFormula("\t{A}\n+\n{B} ").raw).toBe("{A} + {B}");
  });

  it("supports parameter names with underscores and digits", () => {
    expect(compileFormula("{_A} + {B2}").variables).toEqual(["_A", "B2"]);
    expect(compileFormula("{A1} + {B2}").variables).toEqual(["A1", "B2"]);
  });

  it("parses rolling_average as a call", () => {
    const compiled = compileFormula("rolling_average({A}, 3)");
    expect(compiled.tree.kind).toBe("call");
    expect(compiled.hasConditional).toBe(false);
    expect(compiled.variables).toEqual(["A"]);
  });

  it("folds rolling_average window expression", () => {
    const compiled = compileFormula("rolling_average({A}, 2 + 2)");
    expect(compiled.tree.kind).toBe("call");
    if (compiled.tree.kind !== "call") {
      return;
    }
    expect(compiled.tree.args[1]).toEqual({ kind: "constant", value: 4 });
  });

  it("folds a near-integer window to an exact integer", () => {
    const compiled = compileFormula("rolling_average({A}, 8.3 - 5.3)");
    expect(compiled.tree.kind).toBe("call");
    if (compiled.tree.kind !== "call") {
      return;
    }
    expect(compiled.tree.args[1]).toEqual({ kind: "constant", value: 3 });
  });

  it("flags rolling_average of a ternary as conditional", () => {
    const compiled = compileFormula("rolling_average({A} / {B} if {B} != 0 else 0, 3)");
    expect(compiled.hasConditional).toBe(true);
  });
});

// ─── safety: unsafe / unsupported syntax ─────────────────────────────────────

describe("evaluate: safety and unsupported syntax", () => {
  const unsafe = [
    "__import__('os').system('echo unsafe')",
    "{A}.__class__",
    "{A}[0]",
    "'text'",
    "{A",
    "{A B}",
    "{A} // 2",
    "[{A}]",
    "lambda x: x",
    "eval('1')",
    "{A}({B})",
    "{A} + {B}; {A}",
    "for x in {A}: x",
    "{A} += 1",
    "{A} | {B}",
    "{A} & {B}",
    "{A} ^ {B}",
    "{A} << 1",
    "{A} >> 1",
    "~{A}",
    "not {A}",
    "{A} is {B}",
    "{A} in {B}",
    "f'{A}'",
    "{A}: {B}",
    "{A} + ...",
    "... + {A}",
    "{A} + {B}.real",
  ];

  it.each(unsafe)("rejects unsafe or unsupported syntax: %s", (formula) => {
    expect(() => evaluate(formula, { A: [1], B: [2] })).toThrow(InvalidFormulaError);
  });

  const invalidPlaceholders = [
    "{}",
    "{{A}}",
    "{A}{B}",
    "{123}",
    "{A + B}",
    "{A-B}",
    "{A.B}",
    "{A@B}",
  ];

  it.each(invalidPlaceholders)("rejects invalid placeholder syntax: %s", (formula) => {
    expect(() => evaluate(formula, { A: [1], B: [2] })).toThrow(InvalidFormulaError);
  });

  it("rejects a non-string formula with a TypeError", () => {
    expect(() => evaluate(123 as unknown as string)).toThrow(TypeError);
    expect(() => evaluate(123 as unknown as string)).toThrow(/formula must be a string/);
  });

  it("reports a formula syntax error with a descriptive message", () => {
    expect(() => evaluate("{A} +* {B}", { A: [1], B: [2] })).toThrow(/invalid formula syntax/);
  });
});

// ─── parameter validation ────────────────────────────────────────────────────

describe("evaluate: parameter validation", () => {
  const invalidValues: Array<[string, unknown]> = [
    ["string", "12"],
    ["null", null],
    ["object", { x: 1 }],
    ["nested array", [[1, 2]]],
    ["array of strings", ["x", "y"]],
    ["array with null", [1, null]],
    ["array with boolean", [true, false]],
  ];

  it.each(invalidValues)("rejects non-numeric sequence (%s)", (_label, value) => {
    expect(() => evaluate("{A} + 1", { A: value as unknown as number[] })).toThrow(ParameterError);
    expect(() => evaluate("{A} + 1", { A: value as unknown as number[] })).toThrow(
      /numeric sequence/,
    );
  });

  it("includes the parameter name in the error message", () => {
    expect(() => evaluate("{A} + 1", { A: [1, "x"] as unknown as number[] })).toThrow(
      /parameter 'A'/,
    );
  });

  it("ignores unused parameters when checking lengths", () => {
    expect(evaluate("{A} + 1", { A: [1, 2], UNUSED: [1, 2, 3, 4] })).toEqual([2, 3]);
  });

  it("reports every referenced parameter length on a mismatch", () => {
    try {
      evaluate("{A} + {B} + {C}", { A: [1, 2], B: [1, 2, 3], C: [1, 2] });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ParameterLengthError);
      expect((error as ParameterLengthError).lengths).toEqual({ A: 2, B: 3, C: 2 });
    }
  });
});

// ─── missing parameters ──────────────────────────────────────────────────────

describe("evaluate: missing parameters", () => {
  it("reports missing parameters in formula order (deduplicated)", () => {
    try {
      evaluate("{B} + {A} + {B}");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as MissingParameterError).missing).toEqual(["B", "A"]);
    }
  });

  it("reports the missing name even when extra parameters are provided", () => {
    try {
      evaluate("{A} + {B}", { A: [1], C: [2] });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as MissingParameterError).missing).toEqual(["B"]);
    }
  });

  it("builds a MissingParameterError message from the missing names", () => {
    const error = new MissingParameterError(["B", "A", "C"]);
    expect(error.missing).toEqual(["B", "A", "C"]);
    expect(error.message).toBe("missing formula parameter(s): B, A, C");
  });
});

// ─── numeric fidelity ────────────────────────────────────────────────────────

describe("evaluate: numeric fidelity", () => {
  it("preserves series index for unit conversion within floating tolerance", () => {
    const result = evaluate("{A1KG} + ({A1LBS} * 0.453592)", {
      A1KG: [10, 20, 30],
      A1LBS: [5, 5, 5],
    });
    expect(result[0]).toBeCloseTo(12.26796, 10);
    expect(result[1]).toBeCloseTo(22.26796, 10);
    expect(result[2]).toBeCloseTo(32.26796, 10);
  });

  it("propagates NaN through arithmetic", () => {
    const result = evaluate("{A} + {B}", { A: [Number.NaN, 1], B: [2, Number.NaN] });
    expect(Number.isNaN(result[0] as number)).toBe(true);
    expect(Number.isNaN(result[1] as number)).toBe(true);
  });

  it("handles double unary negation, zero and fractional exponents", () => {
    expect(evaluate("-(-{A})", { A: [3, -4] })).toEqual([3, -4]);
    expect(evaluate("{A} ** 0", { A: [0, 5, -3] })).toEqual([1, 1, 1]);
    expect(evaluate("{A} ** 0.5", { A: [4, 9] })).toEqual([2, 3]);
  });

  it("evaluates nested if/else that short-circuits every branch independently", () => {
    const result = evaluate("1 / {A} if {A} != 0 else (1 / {B} if {B} != 0 else 0)", {
      A: [0, 2, 0],
      B: [0, 100, 4],
    });
    expect(result).toEqual([0, 0.5, 0.25]);
  });

  it("returns a fresh array on each call", () => {
    const first = evaluate("{A} + 1", { A: [1] });
    const second = evaluate("{A} + 1", { A: [1] });
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});
