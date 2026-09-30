import type {
  CogniteAggregateDatapoint,
  CogniteDatapointResultItem,
  CogniteDatapointRetrieveItem,
  CogniteNumericDatapoint,
  CognitePort,
} from "../cognite";
import type { DatapointAggregate } from "../types";
import { chunks } from "../utils/array";
import { DatapointsRetrievalError } from "./exceptions";
import { type AnyTimeSeriesParameter, instanceIdsOf, type Series } from "./models";

// Cognite's datapoints retrieve endpoint accepts at most 100 items per request,
// and returns at most 10_000 aggregate and 100_000 raw points per request,
// shared by the items of each kind. Exposed so tests can shrink them without
// provisioning 100+ series or 10_000+ points.
export const retrievalLimits = {
  maxTimeSeriesPerRequest: 100,
  aggregatePointsPerRequest: 10_000,
  rawPointsPerRequest: 100_000,
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
   *
   * Every item is sent with an explicit `limit` (its share of the request's
   * point budget). A series whose page is full is requested again from just
   * after its last point until a page comes back short or brings nothing
   * new, so a long window is never silently truncated to one page.
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
      chunks(requests, retrievalLimits.maxTimeSeriesPerRequest).map((items) =>
        this.retrievePaged(items, start, end),
      ),
    );
    const items = responses.flat();

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

  /**
   * Retrieves one chunk, asking again for every series whose page was full.
   *
   * CDF may round an advanced `start` down to the aggregate bucket that was
   * already returned; {@link appendDatapoints} drops that overlap.
   */
  private async retrievePaged(
    items: CogniteDatapointRetrieveItem[],
    start: Date,
    end: Date,
  ): Promise<CogniteDatapointResultItem[]> {
    const pending = [...items];
    const merged: Array<CogniteDatapointResultItem | undefined> = items.map(() => undefined);
    let open = items.map((_item, index) => index);

    while (open.length > 0) {
      const batch = withPageLimits(
        open.map((index) => pending[index] as CogniteDatapointRetrieveItem),
      );
      const response = await this.cognite.retrieveDatapoints({ items: batch, start, end });
      if (response.items.length !== batch.length) {
        throw new DatapointsRetrievalError(
          `expected ${batch.length} datapoint series from CDF, got ${response.items.length}`,
        );
      }

      const stillOpen: number[] = [];
      open.forEach((index, position) => {
        const page = response.items[position] as CogniteDatapointResultItem;
        let stored = merged[index];
        if (stored === undefined) {
          stored = blankResultItem(page);
          merged[index] = stored;
        }
        const added = appendDatapoints(stored, page);
        const limit = (batch[position] as CogniteDatapointRetrieveItem).limit as number;
        if (added === 0 || page.datapoints.length < limit) {
          return;
        }
        const last = stored.datapoints[stored.datapoints.length - 1] as CogniteNumericDatapoint;
        pending[index] = {
          ...(pending[index] as CogniteDatapointRetrieveItem),
          start: last.timestamp.getTime() + 1,
        };
        stillOpen.push(index);
      });
      open = stillOpen;
    }

    return merged as CogniteDatapointResultItem[];
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
 * Gives every item its share of the request's point budget.
 *
 * Aggregate and raw items draw on separate budgets, split evenly among the
 * items of each kind, so a page that comes back at `limit` may be truncated.
 */
function withPageLimits(items: CogniteDatapointRetrieveItem[]): CogniteDatapointRetrieveItem[] {
  const aggregates = items.filter(isAggregateRequest).length;
  const raws = items.length - aggregates;
  const aggregateLimit = pageLimit(retrievalLimits.aggregatePointsPerRequest, aggregates);
  const rawLimit = pageLimit(retrievalLimits.rawPointsPerRequest, raws);
  return items.map((item) => ({
    ...item,
    limit: isAggregateRequest(item) ? aggregateLimit : rawLimit,
  }));
}

function pageLimit(budget: number, count: number): number {
  return Math.max(1, Math.floor(budget / Math.max(1, count)));
}

function isAggregateRequest(item: CogniteDatapointRetrieveItem): boolean {
  return item.granularity !== undefined;
}

function blankResultItem(page: CogniteDatapointResultItem): CogniteDatapointResultItem {
  const { nextCursor: _nextCursor, datapoints: _datapoints, ...rest } = page;
  return { ...rest, datapoints: [] };
}

/**
 * Appends the points of `page` that come after the last stored one.
 *
 * Returns how many were added; zero means the page brought nothing new.
 */
function appendDatapoints(
  stored: CogniteDatapointResultItem,
  page: CogniteDatapointResultItem,
): number {
  const incoming = page.datapoints;
  const last = stored.datapoints[stored.datapoints.length - 1];
  let first = 0;
  if (last !== undefined) {
    const cutoff = last.timestamp.getTime();
    while (
      first < incoming.length &&
      (incoming[first] as CogniteNumericDatapoint).timestamp.getTime() <= cutoff
    ) {
      first += 1;
    }
  }
  for (let index = first; index < incoming.length; index += 1) {
    stored.datapoints.push(incoming[index] as CogniteNumericDatapoint);
  }
  return incoming.length - first;
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
