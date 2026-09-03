import type { CallNode, CompareOp, ExprNode } from "./ast";
import { treeHasConditional } from "./ast";
import { ALLOWED_FUNCTIONS, type FunctionSpec } from "./functions";
import { BINARY_OPS, UNARY_OPS } from "./ops";

/** Environment mapping safe identifiers to their aligned numeric series. */
export type Environment = Record<string, readonly number[]>;

/**
 * A value is either a scalar (broadcast across the whole series) or an
 * already-materialized per-element sequence. Keeping constants as scalars
 * avoids allocating length-N arrays for them and skips the element-wise zip
 * whenever one side of an operation is constant.
 */
type Value = number | readonly number[];

/** Memoized ``rolling_average`` (and future window) results for one evaluation. */
type CallCache = WeakMap<CallNode, Value>;

const COMPARE_OPS: Record<CompareOp, (left: number, right: number) => boolean> = {
  eq: (left, right) => left === right,
  ne: (left, right) => left !== right,
  lt: (left, right) => left < right,
  le: (left, right) => left <= right,
  gt: (left, right) => left > right,
  ge: (left, right) => left >= right,
};

/** Formula truthiness for floats: only exactly ``0`` is falsy (``NaN`` is truthy). */
function isTruthy(value: number): boolean {
  return value !== 0;
}

export function evaluateTree(
  tree: ExprNode,
  environment: Environment,
  length: number,
  hasConditional: boolean,
): number[] {
  if (hasConditional) {
    // ``if``/``else`` branches (and their guards) must only run for the
    // elements that select them, so evaluate index-by-index.
    const cache: CallCache = new WeakMap();
    const result: number[] = new Array(length);
    for (let index = 0; index < length; index += 1) {
      result[index] = evaluateNodeAt(tree, environment, index, length, cache);
    }
    return result;
  }

  const value = evaluateNode(tree, environment);
  if (Array.isArray(value)) {
    return value as number[];
  }
  // The compiler guarantees at least one parameter, so a scalar result only
  // happens for degenerate trees; broadcast it to the series length.
  return new Array(length).fill(value as number);
}

function evaluateNode(node: ExprNode, environment: Environment): Value {
  switch (node.kind) {
    case "name": {
      const series = environment[node.id];
      // The runtime guarantees every referenced name is present.
      return series as readonly number[];
    }
    case "constant":
      return node.value;
    case "binop": {
      const left = evaluateNode(node.left, environment);
      const right = evaluateNode(node.right, environment);
      return applyBinary(BINARY_OPS[node.op], left, right);
    }
    case "unaryop": {
      const operand = evaluateNode(node.operand, environment);
      const op = UNARY_OPS[node.op];
      return Array.isArray(operand) ? operand.map(op) : op(operand as number);
    }
    case "call":
      return evaluateCall(node, environment);
    default:
      // Conditional nodes never reach the vectorized path.
      throw new TypeError(`unsupported formula element: ${node.kind}`);
  }
}

function applyBinary(
  op: (left: number, right: number) => number,
  left: Value,
  right: Value,
): Value {
  if (Array.isArray(left)) {
    if (Array.isArray(right)) {
      const result: number[] = new Array(left.length);
      for (let index = 0; index < left.length; index += 1) {
        result[index] = op(left[index] as number, right[index] as number);
      }
      return result;
    }
    const scalar = right as number;
    return left.map((value) => op(value, scalar));
  }
  const scalarLeft = left as number;
  if (Array.isArray(right)) {
    return right.map((value) => op(scalarLeft, value));
  }
  return op(scalarLeft, right as number);
}

function evaluateNodeAt(
  node: ExprNode,
  environment: Environment,
  index: number,
  length: number,
  cache: CallCache,
): number {
  switch (node.kind) {
    case "name": {
      const series = environment[node.id] as readonly number[];
      return series[index] as number;
    }
    case "constant":
      return node.value;
    case "binop": {
      const left = evaluateNodeAt(node.left, environment, index, length, cache);
      const right = evaluateNodeAt(node.right, environment, index, length, cache);
      return BINARY_OPS[node.op](left, right);
    }
    case "unaryop":
      return UNARY_OPS[node.op](evaluateNodeAt(node.operand, environment, index, length, cache));
    case "compare": {
      let left = evaluateNodeAt(node.left, environment, index, length, cache);
      for (let i = 0; i < node.ops.length; i += 1) {
        const right = evaluateNodeAt(
          node.comparators[i] as ExprNode,
          environment,
          index,
          length,
          cache,
        );
        if (!COMPARE_OPS[node.ops[i] as CompareOp](left, right)) {
          return 0;
        }
        left = right;
      }
      return 1;
    }
    case "boolop": {
      if (node.op === "and") {
        for (const value of node.values) {
          if (!isTruthy(evaluateNodeAt(value, environment, index, length, cache))) {
            return 0;
          }
        }
        return 1;
      }
      for (const value of node.values) {
        if (isTruthy(evaluateNodeAt(value, environment, index, length, cache))) {
          return 1;
        }
      }
      return 0;
    }
    case "ifexp": {
      const test = evaluateNodeAt(node.test, environment, index, length, cache);
      const branch = isTruthy(test) ? node.body : node.orelse;
      return evaluateNodeAt(branch, environment, index, length, cache);
    }
    case "call":
      return evaluateCallAt(node, environment, index, length, cache);
    default:
      throw new TypeError("unsupported formula element");
  }
}

function evaluateCall(node: CallNode, environment: Environment): Value {
  const spec = callSpec(node);
  const window = callWindow(node, environment);
  const series = evaluateNode(node.args[0] as ExprNode, environment);
  if (!Array.isArray(series)) {
    return series;
  }
  return spec.apply(series, window);
}

/**
 * Window functions need neighboring values, so a per-index lookback would be
 * ``O(n × window)`` and would re-evaluate inner conditionals on every visit.
 *
 * Instead, the first time a given call runs we materialize the whole series
 * (vectorized when the argument has no ``if``/compare, element-wise when it
 * does) and cache it. Later indexes are ``O(1)`` lookups.
 *
 * Once any element selects the call, the series argument is evaluated at
 * every index — an outer ``if`` does not protect unguarded arithmetic inside
 * the window. A call that is never selected still does not run.
 */
function evaluateCallAt(
  node: CallNode,
  environment: Environment,
  index: number,
  length: number,
  cache: CallCache,
): number {
  let cached = cache.get(node);
  if (cached === undefined) {
    cached = materializeCall(node, environment, length, cache);
    cache.set(node, cached);
  }
  return Array.isArray(cached) ? (cached[index] as number) : (cached as number);
}

function materializeCall(
  node: CallNode,
  environment: Environment,
  length: number,
  cache: CallCache,
): Value {
  const spec = callSpec(node);
  const window = callWindow(node, environment);
  const arg = node.args[0] as ExprNode;
  const series = treeHasConditional(arg)
    ? materializeSeriesAt(arg, environment, length, cache)
    : evaluateNode(arg, environment);
  if (!Array.isArray(series)) {
    return series;
  }
  return spec.apply(series, window);
}

function materializeSeriesAt(
  node: ExprNode,
  environment: Environment,
  length: number,
  cache: CallCache,
): number[] {
  const values: number[] = new Array(length);
  for (let index = 0; index < length; index += 1) {
    values[index] = evaluateNodeAt(node, environment, index, length, cache);
  }
  return values;
}

function callSpec(node: CallNode): FunctionSpec & { readonly windowArg: number } {
  const spec = ALLOWED_FUNCTIONS[node.name];
  if (spec === undefined || spec.windowArg === null) {
    throw new TypeError("unsupported formula element");
  }
  return spec as FunctionSpec & { readonly windowArg: number };
}

function callWindow(node: CallNode, environment: Environment): number {
  const spec = callSpec(node);
  const windowValue = evaluateNode(node.args[spec.windowArg] as ExprNode, environment);
  return windowValue as number;
}
