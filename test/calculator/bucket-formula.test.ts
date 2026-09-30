import { beforeEach, describe, expect, it } from "vitest";
import {
  type BucketTerm,
  clearCache,
  compileFormula,
  evaluate,
  InvalidFormulaError,
} from "../../src/calculator/formula-expression";

beforeEach(() => {
  clearCache();
});

describe("compileFormula: bucket terms", () => {
  it.each(["sum", "average"])("a %s() call becomes a per-point term", (aggregate) => {
    const compiled = compileFormula(`${aggregate}((({NSP} * {RUNT}) - {TTP}) / {NSP})`);

    expect(compiled.bucketTerms).toHaveLength(1);
    const term = compiled.bucketTerms[0] as BucketTerm;
    expect(term.aggregate).toBe(aggregate);
    expect(term.key).toBe(`${aggregate}#0`);
    expect(term.formula.variables).toEqual(["NSP", "RUNT", "TTP"]);
    // The per-bucket formula only reads the term.
    expect(compiled.variables).toEqual([term.key]);
  });

  it("a formula without bucket calls has no terms", () => {
    expect(compileFormula("{A} + {B}").bucketTerms).toEqual([]);
  });

  it("a ratio of bucket sums has one term per call", () => {
    const compiled = compileFormula("sum({TTP}) / sum({NSP} * {RUNT})");

    expect(compiled.bucketTerms).toHaveLength(2);
    const [first, second] = compiled.bucketTerms as [BucketTerm, BucketTerm];
    expect(first.formula.variables).toEqual(["TTP"]);
    expect(second.formula.variables).toEqual(["NSP", "RUNT"]);
    expect(compiled.variables).toEqual([first.key, second.key]);
  });

  it("identical bucket calls share a term", () => {
    const compiled = compileFormula("sum({A}) / sum({B}) if sum({B}) != 0 else 0");

    expect(compiled.bucketTerms.map((term) => term.formula.variables)).toEqual([["B"], ["A"]]);
    expect(compiled.hasConditional).toBe(true);
  });

  it("the same argument with another aggregate is another term", () => {
    const compiled = compileFormula("sum({A}) - average({A})");

    expect(compiled.bucketTerms.map((term) => term.aggregate)).toEqual(["sum", "average"]);
  });

  it("placeholders outside bucket calls stay in the per-bucket formula", () => {
    const compiled = compileFormula("100 * sum({A}) / {TARGET}");

    expect(compiled.bucketTerms).toHaveLength(1);
    const term = compiled.bucketTerms[0] as BucketTerm;
    expect(compiled.variables).toEqual(["TARGET", term.key]);
  });

  it("a bucket term may be conditional", () => {
    const compiled = compileFormula("sum({A} / {B} if {B} != 0 else 0)");

    expect(compiled.bucketTerms).toHaveLength(1);
    const term = compiled.bucketTerms[0] as BucketTerm;
    expect(term.formula.hasConditional).toBe(true);
    expect(compiled.hasConditional).toBe(false);
  });

  it("a bucket term folds constants", () => {
    const compiled = compileFormula("sum({A} * (24 * 3600))");

    const tree = (compiled.bucketTerms[0] as BucketTerm).formula.tree;
    expect(tree.kind).toBe("binop");
    const right = tree.kind === "binop" ? tree.right : undefined;
    expect(right).toEqual({ kind: "constant", value: 86400 });
  });
});

describe("compileFormula: invalid bucket calls", () => {
  it("bucket calls cannot be nested", () => {
    expect(() => compileFormula("sum(average({A}))")).toThrow(InvalidFormulaError);
    expect(() => compileFormula("sum(average({A}))")).toThrow(/cannot be nested/);
  });

  it("a bucket call must reference a parameter", () => {
    expect(() => compileFormula("sum(1) + {A}")).toThrow(InvalidFormulaError);
    expect(() => compileFormula("sum(1) + {A}")).toThrow(
      /sum\(\) must reference at least one parameter/,
    );
  });

  it("a bucket call takes one argument", () => {
    expect(() => compileFormula("sum({A}, {B})")).toThrow(InvalidFormulaError);
    expect(() => compileFormula("sum({A}, {B})")).toThrow(/sum\(\) takes 1 argument, got 2/);
  });

  it("a bucket call rejects keyword arguments", () => {
    expect(() => compileFormula("average({A}, window=2)")).toThrow(InvalidFormulaError);
    expect(() => compileFormula("average({A}, window=2)")).toThrow(/keyword arguments/);
  });

  it("a bucket call cannot wrap rolling_average yet", () => {
    expect(() => compileFormula("sum(rolling_average({A}, 3))")).toThrow(InvalidFormulaError);
    expect(() => compileFormula("sum(rolling_average({A}, 3))")).toThrow(
      /sum\(\) cannot wrap rolling_average\(\) yet/,
    );
  });

  it("rolling_average cannot be combined with bucket calls yet", () => {
    expect(() => compileFormula("rolling_average(sum({A}), 3)")).toThrow(InvalidFormulaError);
    expect(() => compileFormula("rolling_average(sum({A}), 3)")).toThrow(
      /rolling_average\(\) cannot be combined with sum\(\) \/ average\(\)/,
    );
  });

  it("the bucket call name is case sensitive", () => {
    expect(() => compileFormula("SUM({A})")).toThrow(InvalidFormulaError);
    expect(() => compileFormula("SUM({A})")).toThrow(/unknown formula function: SUM/);
  });
});

describe("evaluate: bucket formulas", () => {
  it.each(["sum({A})", "sum({A}) / sum({B})"])("rejects %s", (formula) => {
    expect(() => evaluate(formula, { A: [1, 2], B: [1, 2] })).toThrow(InvalidFormulaError);
    expect(() => evaluate(formula, { A: [1, 2], B: [1, 2] })).toThrow(
      /evaluate the formula with Calc/,
    );
  });
});
