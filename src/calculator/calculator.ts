import type { CogniteClient } from "@cognite/sdk";
import { type CognitePort, createCogniteAdapter } from "../cognite";
import { DatapointsRetriever } from "./datapoints-retrieval";
import { BucketGranularityError } from "./exceptions";
import {
  type CompiledFormula,
  compileFormula,
  InvalidFormulaError,
  MissingTimeAxisError,
  ParameterTimestampError,
} from "./formula-expression";
import { evaluateCompiled } from "./formula-expression/runtime";
import {
  aggregateIntoBuckets,
  bucketSpan,
  buildBucketGrid,
  expandSeriesOnGrid,
  formulaUsesRollingAverage,
  minGranularitySeconds,
  sharedAggregateGranularity,
} from "./grid";
import {
  type AlignmentMode,
  type AnyTimeSeriesParameter,
  type CalculationResult,
  type CalculatorQuery,
  isConstantParameter,
  isTimeSeriesParameter,
  type Series,
} from "./models";
import { SeriesReducer } from "./series-reducer";
import { validateCalculatorQueries } from "./validation";

type Window = { start: Date; end: Date };

/** The buckets a `sum(...)` / `average(...)` formula aggregates into. */
type Bucketing = { granularity: string; origin: Date };

/**
 * One query resolved into what to fetch, over which window, and how.
 *
 * `parameters` are the query's time-series parameters, fetched exactly as
 * declared. With `bucketing` set, the window covers the whole buckets of
 * `bucketGranularity` and the results are aggregated by it.
 */
type QueryPlan = {
  query: CalculatorQuery;
  formula: CompiledFormula;
  parameters: AnyTimeSeriesParameter[];
  window: Window;
  bucketing?: Bucketing;
};

/**
 * Evaluates formula-based calculations over Cognite time series datapoints.
 *
 * Each {@link CalculatorQuery} pairs a formula with the parameters its
 * placeholders resolve to. The calculator fetches the required datapoints
 * (de-duplicating shared time series), joins the query's time-series
 * parameters onto a single time axis, and evaluates the formula
 * element-by-element.
 */
export class Calculator {
  private readonly retriever: DatapointsRetriever;
  private readonly seriesReducer = new SeriesReducer();

  constructor(cognite: CogniteClient | CognitePort) {
    const port = isCognitePort(cognite) ? cognite : createCogniteAdapter(cognite);
    this.retriever = new DatapointsRetriever(port);
  }

  /**
   * Evaluate a single query over the given time range.
   *
   * `timeZone` aligns hour-and-longer CDF aggregates to a local calendar;
   * `start` / `end` stay UTC instants.
   */
  async calculate(
    query: CalculatorQuery,
    start: Date,
    end: Date,
    timeZone?: string,
  ): Promise<CalculationResult> {
    const [result] = await this.calculateMultiples([query], start, end, timeZone);
    // calculateMultiples returns one result per query, so this is always set.
    return result as CalculationResult;
  }

  /**
   * Evaluate several queries over the given time range, retrieving every
   * parameter's datapoints in a single de-duplicated round trip.
   *
   * `timeZone` is an IANA id or fixed offset (`America/New_York`,
   * `UTC+05:30`) applied to every hour-and-longer aggregate in the
   * batch. Omit it for UTC calendar buckets. `start` / `end` are
   * not reinterpreted. Raw and sub-hour retrieves are unchanged.
   * The value is forwarded to CDF; invalid ids fail on retrieve.
   *
   * A `sum(...)` / `average(...)` query is fetched over the whole buckets
   * of its `bucketGranularity` that `[start, end)` touches, so it may take
   * one more retrieve than the rest.
   */
  async calculateMultiples(
    queries: CalculatorQuery[],
    start: Date,
    end: Date,
    timeZone?: string,
  ): Promise<CalculationResult[]> {
    validateCalculatorQueries(queries);

    const plans = queries.map((query) => planQuery(query, start, end, timeZone));
    const leafSeriesByPlan = await this.retrieve(plans, timeZone);
    return plans.map((plan, index) =>
      this.calculateOne(plan, leafSeriesByPlan[index] as Series[][], timeZone),
    );
  }

  /**
   * Fetches every plan's parameters, one retrieve per distinct window.
   *
   * Windows are retrieved one after another, never concurrently, so a batch
   * never has more requests in flight than a single retrieve.
   */
  private async retrieve(
    plans: readonly QueryPlan[],
    timeZone: string | undefined,
  ): Promise<Series[][][]> {
    const byWindow = new Map<
      string,
      { window: Window; entries: Array<{ plan: number; parameter: AnyTimeSeriesParameter }> }
    >();
    plans.forEach((plan, index) => {
      const key = `${plan.window.start.getTime()}|${plan.window.end.getTime()}`;
      let group = byWindow.get(key);
      if (group === undefined) {
        group = { window: plan.window, entries: [] };
        byWindow.set(key, group);
      }
      for (const parameter of plan.parameters) {
        group.entries.push({ plan: index, parameter });
      }
    });

    const leafSeriesByPlan: Series[][][] = plans.map(() => []);
    for (const { window, entries } of byWindow.values()) {
      const fetched = await this.retriever.retrieveDatapoints(
        entries.map((entry) => entry.parameter),
        window.start,
        window.end,
        timeZone,
      );
      entries.forEach((entry, index) => {
        (leafSeriesByPlan[entry.plan] as Series[][]).push(fetched[index] as Series[]);
      });
    }
    return leafSeriesByPlan;
  }

  private calculateOne(
    plan: QueryPlan,
    leafSeriesByParameter: Series[][],
    timeZone: string | undefined,
  ): CalculationResult {
    const { query } = plan;
    const aliases: string[] = [];
    let series: Series[] = [];

    plan.parameters.forEach((parameter, index) => {
      aliases.push(parameter.alias);
      series.push(this.collapse(parameter, leafSeriesByParameter[index] as Series[]));
    });

    if (aliases.length === 0 && query.parameters.length > 0) {
      throw new MissingTimeAxisError(query.parameters.map((parameter) => parameter.alias));
    }

    const filled = this.alignOrFillGrid(plan, aliases, series, timeZone);
    series = filled.series;
    let timestamps = (series[0] ?? []).map((point) => point.timestamp);

    const valuesMap: Record<string, number[]> = {};
    aliases.forEach((alias, index) => {
      valuesMap[alias] = (series[index] as Series).map((point) => point.value);
    });
    for (const parameter of query.parameters) {
      if (isConstantParameter(parameter)) {
        valuesMap[parameter.alias] = new Array(timestamps.length).fill(parameter.value);
      }
    }

    let datapoints: Series;
    if (plan.bucketing === undefined) {
      let values = evaluateCompiled(plan.formula, valuesMap);
      if (filled.filled) {
        const dropped = dropNanResults(timestamps, values, series);
        timestamps = dropped.timestamps;
        values = dropped.values;
        series = dropped.series;
      }
      datapoints = timestamps.map((timestamp, index) => ({
        timestamp,
        value: values[index] as number,
      }));
    } else {
      datapoints = this.evaluateBuckets(plan, plan.bucketing, timestamps, valuesMap, timeZone);
    }

    const inputs: Record<string, Series> = {};
    aliases.forEach((alias, index) => {
      inputs[alias] = series[index] as Series;
    });
    for (const parameter of query.parameters) {
      if (isConstantParameter(parameter)) {
        inputs[parameter.alias] = timestamps.map((timestamp) => ({
          timestamp,
          value: parameter.value,
        }));
      }
    }

    return { query, datapoints, inputs };
  }

  /**
   * Runs each bucket term per point, aggregates it, then the formula per bucket.
   *
   * A bucket is kept only when every term has a value there, and a `NaN`
   * result is dropped, so an empty bucket is omitted as CDF omits it.
   */
  private evaluateBuckets(
    plan: QueryPlan,
    bucketing: Bucketing,
    timestamps: Date[],
    valuesMap: Record<string, number[]>,
    timeZone: string | undefined,
  ): Series {
    const termBuckets = plan.formula.bucketTerms.map((term) => {
      const values = evaluateCompiled(term.formula, valuesMap);
      return aggregateIntoBuckets(
        timestamps.map((timestamp, index) => ({ timestamp, value: values[index] as number })),
        bucketing.origin,
        bucketing.granularity,
        timeZone,
        term.aggregate,
      );
    });
    const aligned = this.seriesReducer.align(termBuckets);
    const bucketStarts = (aligned[0] ?? []).map((point) => point.timestamp);

    const bucketValues: Record<string, number[]> = {};
    plan.formula.bucketTerms.forEach((term, index) => {
      bucketValues[term.key] = (aligned[index] as Series).map((point) => point.value);
    });
    for (const parameter of plan.query.parameters) {
      if (isConstantParameter(parameter)) {
        bucketValues[parameter.alias] = new Array(bucketStarts.length).fill(parameter.value);
      }
    }

    const values = evaluateCompiled(plan.formula, bucketValues);
    return bucketStarts
      .map((timestamp, index) => ({ timestamp, value: values[index] as number }))
      .filter((point) => !Number.isNaN(point.value));
  }

  /** Collapses a parameter's time series down to the single series it stands for. */
  private collapse(parameter: AnyTimeSeriesParameter, leafSeries: Series[]): Series {
    if (parameter.type === "multi_timeseries") {
      return this.seriesReducer.reduce(leafSeries, parameter.reducer, parameter.fillValue);
    }
    return leafSeries[0] ?? [];
  }

  private alignOrFillGrid(
    plan: QueryPlan,
    aliases: string[],
    series: Series[],
    timeZone: string | undefined,
  ): { series: Series[]; filled: boolean } {
    const { query } = plan;
    const fillValues = plan.parameters.map((parameter) => parameter.fillValue);
    const granularity = sharedAggregateGranularity(plan.parameters);
    if (
      granularity !== undefined &&
      series.length > 0 &&
      series.every((item) => item.length > 0) &&
      formulaUsesRollingAverage(query.formula)
    ) {
      const references = series.flatMap((item) => item.map((point) => point.timestamp));
      const grid = buildBucketGrid(
        plan.window.start,
        plan.window.end,
        granularity,
        timeZone,
        references,
      );
      if (grid.length > 0) {
        if (query.alignment === "strict") {
          requireAlignedTimestamps(aliases, series);
        }
        return {
          series: series.map((item, index) => expandSeriesOnGrid(item, grid, fillValues[index])),
          filled: true,
        };
      }
    }
    return {
      series: this.alignSeries(query.alignment ?? "intersect", aliases, series, fillValues),
      filled: false,
    };
  }

  private alignSeries(
    mode: AlignmentMode,
    aliases: string[],
    series: Series[],
    fillValues: Array<number | undefined>,
  ): Series[] {
    if (mode === "strict") {
      requireAlignedTimestamps(aliases, series);
      return series;
    }
    if (fillValues.some((fill) => fill !== undefined)) {
      return this.seriesReducer.alignFilled(series, fillValues);
    }
    return this.seriesReducer.align(series);
  }
}

function planQuery(
  query: CalculatorQuery,
  start: Date,
  end: Date,
  timeZone: string | undefined,
): QueryPlan {
  const formula = compileFormula(query.formula);
  const parameters = query.parameters.filter(isTimeSeriesParameter);
  if (formula.bucketTerms.length === 0) {
    // A plain formula ignores bucketGranularity, so callers can always pass
    // their granularity.
    return { query, formula, parameters, window: { start, end } };
  }

  if (parameters.length === 0) {
    throw new MissingTimeAxisError(query.parameters.map((parameter) => parameter.alias));
  }
  // Outside sum() / average() the formula runs per bucket, where only
  // constants have a value.
  const perBucket = new Set(formula.variables);
  const outside = parameters
    .filter((parameter) => perBucket.has(parameter.alias))
    .map((parameter) => parameter.alias);
  if (outside.length > 0) {
    throw new InvalidFormulaError(
      `time-series parameters must be inside sum() / average(): ${outside.join(", ")}`,
    );
  }
  const granularity = requireBucketGranularity(query.bucketGranularity, parameters);
  const window = bucketSpan(start, end, granularity, timeZone);
  return {
    query,
    formula,
    parameters,
    window,
    bucketing: { granularity, origin: window.start },
  };
}

/** Validates the granularity a bucketed query's results are aggregated by. */
function requireBucketGranularity(
  bucketGranularity: string | undefined,
  parameters: readonly AnyTimeSeriesParameter[],
): string {
  if (bucketGranularity === undefined) {
    throw new BucketGranularityError(
      "a formula with sum() / average() needs bucketGranularity on the query " +
        "(the granularity the results are aggregated by, e.g. '1d')",
    );
  }
  const bucketSeconds = minGranularitySeconds(bucketGranularity);
  if (bucketSeconds === undefined) {
    throw new BucketGranularityError(`unsupported bucketGranularity: '${bucketGranularity}'`);
  }
  const coarser = parameters
    .filter(
      (parameter) =>
        parameter.aggregateType !== undefined &&
        parameter.granularity !== undefined &&
        (minGranularitySeconds(parameter.granularity) ?? 0) > bucketSeconds,
    )
    .map((parameter) => `${parameter.alias} (${parameter.granularity})`);
  if (coarser.length > 0) {
    throw new BucketGranularityError(
      `parameter granularity is coarser than bucketGranularity '${bucketGranularity}': ` +
        coarser.join(", "),
    );
  }
  return bucketGranularity;
}

function dropNanResults(
  timestamps: Date[],
  values: number[],
  series: Series[],
): { timestamps: Date[]; values: number[]; series: Series[] } {
  const keep = values.map((value) => !Number.isNaN(value));
  return {
    timestamps: timestamps.filter((_timestamp, index) => keep[index]),
    values: values.filter((_value, index) => keep[index]),
    series: series.map((item) => item.filter((_point, index) => keep[index])),
  };
}

function requireAlignedTimestamps(aliases: string[], series: Series[]): void {
  const reference = series[0];
  if (reference === undefined) {
    return;
  }

  const mismatched = aliases.slice(1).filter((_alias, index) => {
    const candidate = series[index + 1] as Series;
    return (
      candidate.length !== reference.length ||
      candidate.some(
        (point, pointIndex) =>
          point.timestamp.getTime() !==
          (reference[pointIndex] as Series[number]).timestamp.getTime(),
      )
    );
  });

  if (mismatched.length > 0) {
    throw new ParameterTimestampError([aliases[0] as string, ...mismatched]);
  }
}

function isCognitePort(value: CogniteClient | CognitePort): value is CognitePort {
  return typeof (value as CognitePort).retrieveDatapoints === "function";
}
