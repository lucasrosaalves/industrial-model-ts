import type { CallNode, CompareOp, ExprNode } from "./ast";
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

/**
 * Per-call memo of series-argument values at indexes a selected window has
 * already needed. Indexes that are never in a selected window stay unevaluated.
 */
type CallArgCache = WeakMap<CallNode, Map<number, number>>;

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
    const cache: CallArgCache = new WeakMap();
    const result: number[] = new Array(length);
    for (let index = 0; index < length; index += 1) {
      result[index] = evaluateNodeAt(tree, environment, index, cache);
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
  cache: CallArgCache,
): number {
  switch (node.kind) {
    case "name": {
      const series = environment[node.id] as readonly number[];
      return series[index] as number;
    }
    case "constant":
      return node.value;
    case "binop": {
      const left = evaluateNodeAt(node.left, environment, index, cache);
      const right = evaluateNodeAt(node.right, environment, index, cache);
      return BINARY_OPS[node.op](left, right);
    }
    case "unaryop":
      return UNARY_OPS[node.op](evaluateNodeAt(node.operand, environment, index, cache));
    case "compare": {
      let left = evaluateNodeAt(node.left, environment, index, cache);
      for (let i = 0; i < node.ops.length; i += 1) {
        const right = evaluateNodeAt(node.comparators[i] as ExprNode, environment, index, cache);
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
          if (!isTruthy(evaluateNodeAt(value, environment, index, cache))) {
            return 0;
          }
        }
        return 1;
      }
      for (const value of node.values) {
        if (isTruthy(evaluateNodeAt(value, environment, index, cache))) {
          return 1;
        }
      }
      return 0;
    }
    case "ifexp": {
      const test = evaluateNodeAt(node.test, environment, index, cache);
      const branch = isTruthy(test) ? node.body : node.orelse;
      return evaluateNodeAt(branch, environment, index, cache);
    }
    case "call":
      return evaluateCallAt(node, environment, index, cache);
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
 * If index ``i`` selects the call, evaluate the series argument on
 * ``[max(0, i-window+1), i]`` only — including neighbors that would not
 * have selected the call themselves. Short-circuit still applies per
 * neighbor. Overlapping windows reuse already-computed argument values;
 * indexes that are never in a selected window are not evaluated.
 */
function evaluateCallAt(
  node: CallNode,
  environment: Environment,
  index: number,
  cache: CallArgCache,
): number {
  const spec = callSpec(node);
  const window = callWindow(node, environment);
  const start = Math.max(0, index - window + 1);
  const values: number[] = [];
  for (let neighbor = start; neighbor <= index; neighbor += 1) {
    values.push(evaluateCallArgAt(node, environment, neighbor, cache));
  }
  return spec.apply(values, window)[values.length - 1] as number;
}

function evaluateCallArgAt(
  node: CallNode,
  environment: Environment,
  index: number,
  cache: CallArgCache,
): number {
  let byIndex = cache.get(node);
  if (byIndex === undefined) {
    byIndex = new Map();
    cache.set(node, byIndex);
  }
  if (byIndex.has(index)) {
    return byIndex.get(index) as number;
  }
  const value = evaluateNodeAt(node.args[0] as ExprNode, environment, index, cache);
  byIndex.set(index, value);
  return value;
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
