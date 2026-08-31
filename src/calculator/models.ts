import type { DatapointAggregate, NodeId } from "../types";

/**
 * A timestamped numeric value. Used both for the formula result
 * (`datapoints`) and for each aligned input series (`inputs`).
 */
export type DataPoint = {
  timestamp: Date;
  value: number;
};

/** How several time series behind one parameter are combined into one. */
export type ReducerType = "min" | "max" | "sum" | "average";

/** How the time-series parameters of a query are joined on time. */
export type AlignmentMode = "intersect" | "strict";

/** One time series' datapoints, ascending by timestamp once normalized. */
export type Series = DataPoint[];

/**
 * A fixed scalar input to a calculation, broadcast across every timestamp in
 * the result. No datapoints are fetched for it.
 */
export type ConstantParameter = {
  type: "constant";
  /** The placeholder name used to reference this parameter in the formula. */
  alias: string;
  value: number;
};

/** Fields shared by every parameter that reads datapoints from Cognite. */
type TimeSeriesParameterBase = {
  /** The placeholder name used to reference this parameter in the formula. */
  alias: string;
  /** Optional aggregate to apply; requires `granularity` when set. */
  aggregateType?: DatapointAggregate;
  /** Aggregate granularity (e.g. `"1h"`); required when `aggregateType` is set. */
  granularity?: string;
};

/**
 * A single time series input to a calculation.
 *
 * When `aggregateType` is set the datapoints are fetched as aggregates and a
 * `granularity` is required; otherwise raw datapoints are used.
 */
export type TimeSeriesParameter = TimeSeriesParameterBase & {
  type: "single_timeseries";
  /** The time series instance to read datapoints from. */
  timeSeries: NodeId;
};

/**
 * Two or more time series combined into a single input by `reducer`.
 *
 * The series are combined by intersecting on timestamp, so prefer
 * `aggregateType` + `granularity` here: raw datapoints from independent
 * series rarely share exact timestamps.
 */
export type MultiTimeSeriesParameter = TimeSeriesParameterBase & {
  type: "multi_timeseries";
  /** The time series instances to read datapoints from; at least two, unique. */
  timeSeries: NodeId[];
  reducer: ReducerType;
};

/** Any input a formula placeholder can resolve to. */
export type CalculatorParameter =
  | ConstantParameter
  | TimeSeriesParameter
  | MultiTimeSeriesParameter;

/** A parameter that reads datapoints from Cognite. */
export type AnyTimeSeriesParameter = TimeSeriesParameter | MultiTimeSeriesParameter;

/** A formula plus the parameters its placeholders resolve to. */
export type CalculatorQuery = {
  /** Formula referencing parameters by ``{alias}`` (see `evaluate`). */
  formula: string;
  parameters: CalculatorParameter[];
  /** How time-series parameters are joined on time; defaults to `"intersect"`. */
  alignment?: AlignmentMode;
};

/**
 * The datapoints produced by evaluating a `CalculatorQuery`, plus the aligned
 * parameter series the formula actually evaluated.
 *
 * `inputs[alias][i]` is the point used to compute `datapoints[i]`. These
 * series are already in memory at evaluation time (after retrieval, any
 * multi-series reduction, timestamp alignment, and constant broadcast), so
 * returning them does not refetch from CDF.
 */
export type CalculationResult = {
  query: CalculatorQuery;
  datapoints: DataPoint[];
  /** Aligned series used by the formula, keyed by parameter alias. */
  inputs: Record<string, DataPoint[]>;
};

export function isConstantParameter(
  parameter: CalculatorParameter,
): parameter is ConstantParameter {
  return parameter.type === "constant";
}

export function isTimeSeriesParameter(
  parameter: CalculatorParameter,
): parameter is AnyTimeSeriesParameter {
  return parameter.type === "single_timeseries" || parameter.type === "multi_timeseries";
}

/** The time series a parameter reads, in declaration order. */
export function instanceIdsOf(parameter: AnyTimeSeriesParameter): NodeId[] {
  return parameter.type === "multi_timeseries" ? parameter.timeSeries : [parameter.timeSeries];
}
