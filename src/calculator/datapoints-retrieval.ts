import type {
  CogniteAggregateDatapoint,
  CogniteDatapointResultItem,
  CogniteDatapointRetrieveItem,
  CogniteDatapointRetrieveOptions,
  CogniteNumericDatapoint,
  CognitePort,
} from "../cognite";
import type { DatapointAggregate } from "../types";
import { chunks } from "../utils/array";
import { DatapointsRetrievalError } from "./exceptions";
import { type AnyTimeSeriesParameter, instanceIdsOf, type Series } from "./models";

// Cognite's datapoints retrieve endpoint accepts at most 100 items per request.
// Exposed so integration tests can shrink the chunk size without provisioning
// 100+ series to prove responses stay in request order across chunks.
export const retrievalLimits = {
  maxTimeSeriesPerRequest: 100,
};

type BuiltRequests = {
  requests: CogniteDatapointRetrieveItem[];
  /**
   * For each parameter (by index), the index of the request serving each of
   * its time series, in the order the parameter declares them.
   */
  indexMapping: number[][];
};

/**
 * Retrieves and de-duplicates the datapoints needed by a set of calculator
 * parameters. Time series that are shared (along with granularity, for
 * aggregates) are folded into a single Cognite request; aggregate requests
 * accumulate every aggregate their parameters ask for.
 */
export class DatapointsRetriever {
  constructor(private readonly cognite: CognitePort) {}

  /**
   * Fetches datapoints for every parameter's time series, unreduced.
   *
   * Returns one entry per parameter, each holding one series per time series
   * it references, in that order. Combining a parameter's series (when it
   * references more than one) is the caller's responsibility — this class only
   * retrieves and parses data.
   *
   * `timeZone` is applied to every aggregate request in this retrieve
   * and omitted from the query when unset.
   */
  async retrieveDatapoints(
    parameters: AnyTimeSeriesParameter[],
    start: Date,
    end: Date,
    timeZone?: string,
  ): Promise<Series[][]> {
    const { requests, indexMapping } = this.buildRequests(parameters, timeZone);

    if (requests.length === 0) {
      return parameters.map(() => []);
    }

    const responses = await Promise.all(
      chunks(requests, retrievalLimits.maxTimeSeriesPerRequest).map(async (items) => {
        const options: CogniteDatapointRetrieveOptions = { items, start, end };
        const response = await this.cognite.retrieveDatapoints(options);
        if (response.items.length !== items.length) {
          throw new DatapointsRetrievalError(
            `expected ${items.length} datapoint series from CDF, got ${response.items.length}`,
          );
        }
        return response;
      }),
    );
    const items = responses.flatMap((response) => response.items);

    return parameters.map((parameter, index) =>
      (indexMapping[index] as number[]).map((requestIndex) => {
        const item = items[requestIndex];
        if (item === undefined) {
          throw new DatapointsRetrievalError(
            `missing datapoints response for parameter '${parameter.alias}'`,
          );
        }
        return parseDatapoints(item, parameter);
      }),
    );
  }

  private buildRequests(parameters: AnyTimeSeriesParameter[], timeZone?: string): BuiltRequests {
    const rawRequestIndex = new Map<string, number>();
    const aggregateRequestIndex = new Map<string, number>();
    const requests: CogniteDatapointRetrieveItem[] = [];
    const indexMapping: number[][] = [];

    for (const parameter of parameters) {
      const parameterIndices: number[] = [];

      for (const { space, externalId } of instanceIdsOf(parameter)) {
        const tsKey = `${space}:${externalId}`;

        if (parameter.aggregateType === undefined) {
          let requestIndex = rawRequestIndex.get(tsKey);
          if (requestIndex === undefined) {
            requestIndex = requests.length;
            rawRequestIndex.set(tsKey, requestIndex);
            requests.push({ space, externalId });
          }
          parameterIndices.push(requestIndex);
          continue;
        }

        const granularity = requireGranularity(parameter);
        const aggregateKey = `${tsKey}|${granularity}`;
        let requestIndex = aggregateRequestIndex.get(aggregateKey);
        if (requestIndex === undefined) {
          requestIndex = requests.length;
          aggregateRequestIndex.set(aggregateKey, requestIndex);
          requests.push({
            space,
            externalId,
            aggregates: [parameter.aggregateType],
            granularity,
            ...(timeZone !== undefined ? { timeZone } : {}),
          });
        } else {
          const entry = requests[requestIndex] as CogniteDatapointRetrieveItem;
          const aggregates = entry.aggregates as DatapointAggregate[];
          if (!aggregates.includes(parameter.aggregateType)) {
            aggregates.push(parameter.aggregateType);
          }
        }
        parameterIndices.push(requestIndex);
      }

      indexMapping.push(parameterIndices);
    }

    return { requests, indexMapping };
  }
}

/**
 * Returns the granularity that `aggregateType` needs.
 *
 * `validateCalculatorQuery` already rejects an aggregate without a
 * granularity, so this only fires for a parameter that skipped validation. It
 * also narrows `string | undefined` down to `string`.
 */
function requireGranularity(parameter: AnyTimeSeriesParameter): string {
  if (parameter.granularity === undefined) {
    throw new DatapointsRetrievalError(
      `Missing granularity for '${parameter.alias}' with aggregate '${parameter.aggregateType}'`,
    );
  }
  return parameter.granularity;
}

function parseDatapoints(
  item: CogniteDatapointResultItem,
  parameter: AnyTimeSeriesParameter,
): Series {
  if (item.isString) {
    throw new DatapointsRetrievalError("expected numeric datapoints, got string");
  }

  const result: Series = [];
  for (const datapoint of item.datapoints) {
    const value = readValue(datapoint, parameter.aggregateType);
    if (value === undefined || value === null) {
      continue;
    }
    result.push({ timestamp: datapoint.timestamp, value });
  }
  return result;
}

function readValue(
  datapoint: CogniteNumericDatapoint,
  aggregateType: DatapointAggregate | undefined,
): number | undefined {
  if (aggregateType === undefined) {
    return (datapoint as { value?: number }).value;
  }
  return (datapoint as CogniteAggregateDatapoint)[aggregateType];
}
