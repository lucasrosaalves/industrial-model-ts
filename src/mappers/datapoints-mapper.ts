import type {
  CogniteAggregateDatapoint,
  CogniteDatapointDeleteItem,
  CogniteDatapointInsertItem,
  CogniteDatapointLatestItem,
  CogniteDatapointResultItem,
  CogniteDatapointRetrieveOptions,
  CognitePort,
} from "../cognite";
import type {
  DatapointAggregate,
  DatapointSeriesResult,
  DatapointsDeleteRange,
  DatapointsInsertItem,
  DatapointsLatestOptions,
  DatapointsResult,
  DatapointsRetrieveOptions,
  NodeId,
  RawDatapoint,
} from "../types";
import { chunks } from "../utils/array";
import { DatapointsValidator } from "../validators";

const CHUNK_SIZE = 100;

export class DatapointsMapper {
  private readonly validator = new DatapointsValidator();

  constructor(private readonly cognite: CognitePort) {}

  async retrieve(options: DatapointsRetrieveOptions): Promise<DatapointsResult> {
    this.validator.validateRetrieve(options);
    const cogniteOptions = this.toCogniteOptions(options);
    const allPages = options.limit === -1;

    if (!allPages) {
      const result = await this.cognite.retrieveDatapoints(cogniteOptions);
      return this.mapResult(result.items, cogniteOptions.items, options.aggregate);
    }

    // Auto-paginate: keep fetching until no series returns a nextCursor.
    // Track accumulated datapoints keyed by "space:externalId".
    const accumulated = new Map<string, CogniteDatapointResultItem>();
    const itemByKey = new Map(cogniteOptions.items.map((item) => [this.toKey(item), item]));
    let currentItems = cogniteOptions.items;

    while (currentItems.length > 0) {
      const result = await this.cognite.retrieveDatapoints({
        ...cogniteOptions,
        items: currentItems,
      });
      const nextItems = [];

      for (const resultItem of result.items) {
        const key = this.toKey(resultItem);

        let acc = accumulated.get(key);
        if (!acc) {
          acc = { ...resultItem, datapoints: [] };
          accumulated.set(key, acc);
        }

        acc.datapoints.push(...resultItem.datapoints);
        if (resultItem.nextCursor) {
          acc.nextCursor = resultItem.nextCursor;
        } else {
          delete acc.nextCursor;
        }

        if (resultItem.nextCursor) {
          const original = itemByKey.get(key);
          nextItems.push({
            ...original,
            space: resultItem.space ?? original?.space ?? "",
            externalId: resultItem.externalId ?? original?.externalId ?? "",
            cursor: resultItem.nextCursor,
          });
        }
      }

      currentItems = nextItems;
    }

    return this.mapResult(
      Array.from(accumulated.values()),
      cogniteOptions.items,
      options.aggregate,
    );
  }

  async retrieveLatest(options: DatapointsLatestOptions): Promise<DatapointsResult> {
    const items: CogniteDatapointLatestItem[] = options.timeSeries.map(
      ({ space, externalId, before }) => ({
        space,
        externalId,
        ...(before !== undefined ? { before } : {}),
      }),
    );
    const latestOptions =
      options.ignoreUnknownIds !== undefined
        ? { ignoreUnknownIds: options.ignoreUnknownIds }
        : undefined;
    const result = await this.cognite.retrieveLatestDatapoints(items, latestOptions);
    return this.mapResult(result.items, items);
  }

  async insert(items: DatapointsInsertItem[]): Promise<void> {
    const cogniteItems = items.map<CogniteDatapointInsertItem>(({ timeSeries, datapoints }) => ({
      space: timeSeries.space,
      externalId: timeSeries.externalId,
      datapoints,
    }));

    for (const chunk of chunks(cogniteItems, CHUNK_SIZE)) {
      await this.cognite.insertDatapoints(chunk);
    }
  }

  async delete(ranges: DatapointsDeleteRange[]): Promise<void> {
    this.validator.validateDelete(ranges);
    const cogniteItems = ranges.map<CogniteDatapointDeleteItem>(({ timeSeries, start, end }) => ({
      space: timeSeries.space,
      externalId: timeSeries.externalId,
      inclusiveBegin: start,
      ...(end !== undefined ? { exclusiveEnd: end } : {}),
    }));

    for (const chunk of chunks(cogniteItems, CHUNK_SIZE)) {
      await this.cognite.deleteDatapoints(chunk);
    }
  }

  private toKey(item: { space?: string; externalId?: string }): string {
    return `${item.space ?? ""}:${item.externalId ?? ""}`;
  }

  private toCogniteOptions(options: DatapointsRetrieveOptions): CogniteDatapointRetrieveOptions {
    const { timeSeries, aggregate, ...rest } = options;
    return {
      ...rest,
      ...(aggregate !== undefined ? { aggregates: [aggregate] } : {}),
      items: timeSeries.map(({ space, externalId }) => ({ space, externalId })),
    };
  }

  private mapResult(
    items: CogniteDatapointResultItem[],
    requestedItems: NodeId[],
    aggregate?: DatapointAggregate,
  ): DatapointsResult {
    const requestedByKey = new Map(requestedItems.map((item) => [this.toKey(item), item]));
    const mappedItems = items
      .filter((item) => !item.isString)
      .map<DatapointSeriesResult>((item) => {
        const requested = requestedByKey.get(this.toKey(item));

        const datapoints: RawDatapoint[] =
          aggregate !== undefined
            ? item.datapoints.map((dp) => ({
                timestamp: dp.timestamp,
                value: (dp as CogniteAggregateDatapoint)[aggregate] ?? 0,
              }))
            : (item.datapoints as unknown as RawDatapoint[]);

        return {
          timeSeries: {
            space: item.space ?? requested?.space ?? "",
            externalId: item.externalId ?? requested?.externalId ?? "",
          },
          ...(item.unit !== undefined ? { unit: item.unit } : {}),
          datapoints,
          cursor: item.nextCursor ?? null,
        };
      });

    return { items: mappedItems };
  }
}
