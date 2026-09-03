import { compileFormula } from "./compiler";
import { evaluateCompiled } from "./runtime";
import type { EvaluationResult, Parameters } from "./types";

/**
 * Evaluate a formula over aligned numeric parameter sequences.
 *
 * Placeholders are written as ``{name}`` and each resolves to the matching
 * entry in `parameters`. The following operators are supported:
 *
 * - arithmetic: ``+`` ``-`` ``*`` ``/`` ``**`` ``%`` (binary) and ``+`` ``-`` (unary)
 * - comparisons: ``==`` ``!=`` ``<`` ``<=`` ``>`` ``>=``
 * - boolean: ``and`` ``or``
 * - conditional: ``{A} / {B} if {B} != 0 else 0``
 * - functions: ``rolling_average({A}, N)`` — same-length simple moving
 *   average. The window ``N`` must be a positive integer constant.
 *   Incomplete windows at the start of a series average whatever points
 *   exist so far, so the result stays aligned with the inputs. Put
 *   value-dependent guards *inside* the series argument: an outer
 *   ``if`` does not protect neighbors in the window of a selected index.
 *
 * Structural problems (bad syntax, unknown identifiers, missing parameters,
 * mismatched lengths, non-numeric values) throw a subclass of `FormulaError`.
 *
 * When every referenced parameter is an empty sequence the result is an empty
 * array — there is nothing to compute over, so this is treated as a valid
 * (empty) result rather than an error. A *mix* of empty and non-empty
 * parameters is still a length mismatch and throws `ParameterLengthError`.
 *
 * Arithmetic failures that depend on the parameter *values* are surfaced as
 * arithmetic errors (subclasses of `ArithmeticError`) rather than
 * `FormulaError`: dividing or taking a modulo by zero throws
 * `ZeroDivisionError` and an overflowing exponentiation throws `OverflowError`.
 *
 * Conditional expressions, comparisons and boolean operators are evaluated
 * element-by-element: for each series element only the selected branch is
 * evaluated, so a division-by-zero (or other value-dependent failure) in the
 * branch that is *not* selected for a given element never throws. If an
 * index selects ``rolling_average``, the series argument is also evaluated
 * on that index's window (including neighbors that would not have selected
 * the call). A call that is never selected, and indexes that are not in any
 * selected window, are not evaluated.
 */
export function evaluate(formula: string, parameters: Parameters = {}): EvaluationResult {
  return evaluateCompiled(compileFormula(formula), parameters);
}
