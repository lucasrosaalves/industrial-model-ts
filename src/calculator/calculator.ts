import type { CogniteClient } from "@cognite/sdk";
import { type CognitePort, createCogniteAdapter } from "../cognite";
import { DatapointsRetriever } from "./datapoints-retrieval";
import { evaluate, MissingTimeAxisError, ParameterTimestampError } from "./formula-expression";
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

  /** Evaluate a single query over the given time range. */
  async calculate(query: CalculatorQuery, start: Date, end: Date): Promise<CalculationResult> {
    const [result] = await this.calculateMultiples([query], start, end);
    // calculateMultiples returns one result per query, so this is always set.
    return result as CalculationResult;
  }

  /**
   * Evaluate several queries over the given time range, retrieving every
   * parameter's datapoints in a single de-duplicated round trip.
   */
  async calculateMultiples(
    queries: CalculatorQuery[],
    start: Date,
    end: Date,
  ): Promise<CalculationResult[]> {
    validateCalculatorQueries(queries);

    // Constants are never fetched, so a query's slice of the retrieved
    // datapoints is as wide as its time-series parameters, not its parameters.
    const timeSeriesCounts = queries.map(
      (query) => query.parameters.filter(isTimeSeriesParameter).length,
    );
    const timeSeriesParameters = queries.flatMap((query) =>
      query.parameters.filter(isTimeSeriesParameter),
    );
    const leafSeriesByParameter = await this.retriever.retrieveDatapoints(
      timeSeriesParameters,
      start,
      end,
    );

    const results: CalculationResult[] = [];
    let offset = 0;
    queries.forEach((query, index) => {
      const count = timeSeriesCounts[index] as number;
      results.push(this.calculateOne(query, leafSeriesByParameter.slice(offset, offset + count)));
      offset += count;
    });
    return results;
  }

  private calculateOne(
    query: CalculatorQuery,
    leafSeriesByParameter: Series[][],
  ): CalculationResult {
    const aliases: string[] = [];
    let series: Series[] = [];
    let cursor = 0;

    for (const parameter of query.parameters) {
      if (!isTimeSeriesParameter(parameter)) {
        continue;
      }
      const leafSeries = leafSeriesByParameter[cursor] as Series[];
      cursor += 1;
      aliases.push(parameter.alias);
      series.push(this.collapse(parameter, leafSeries));
    }

    if (aliases.length === 0 && query.parameters.length > 0) {
      throw new MissingTimeAxisError(query.parameters.map((parameter) => parameter.alias));
    }

    series = this.alignSeries(query.alignment ?? "intersect", aliases, series);
    const timestamps = (series[0] ?? []).map((point) => point.timestamp);

    const valuesMap: Record<string, number[]> = {};
    aliases.forEach((alias, index) => {
      valuesMap[alias] = (series[index] as Series).map((point) => point.value);
    });
    for (const parameter of query.parameters) {
      if (isConstantParameter(parameter)) {
        valuesMap[parameter.alias] = new Array(timestamps.length).fill(parameter.value);
      }
    }

    const values = evaluate(query.formula, valuesMap);

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

    return {
      query,
      datapoints: timestamps.map((timestamp, index) => ({
        timestamp,
        value: values[index] as number,
      })),
      inputs,
    };
  }

  /** Collapses a parameter's time series down to the single series it stands for. */
  private collapse(parameter: AnyTimeSeriesParameter, leafSeries: Series[]): Series {
    if (parameter.type === "multi_timeseries") {
      return this.seriesReducer.reduce(leafSeries, parameter.reducer);
    }
    return leafSeries[0] ?? [];
  }

  private alignSeries(mode: AlignmentMode, aliases: string[], series: Series[]): Series[] {
    if (mode === "strict") {
      requireAlignedTimestamps(aliases, series);
      return series;
    }
    return this.seriesReducer.align(series);
  }
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
