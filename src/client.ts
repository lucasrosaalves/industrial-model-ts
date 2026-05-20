import type { CogniteClient } from "@cognite/sdk";
import {
  type CognitePort,
  createCogniteAdapter,
  type InstancesApplyRequest,
  type InstancesQueryRequest,
  type InstancesQueryResponse,
} from "./cognite";
import { DEFAULT_LIMIT, MAX_DEPENDENCY_DEPTH } from "./constants";
import { AggregateMapper } from "./mappers/aggregate-mapper";
import { AggregateResultMapper } from "./mappers/aggregate-result-mapper";
import { QueryMapper } from "./mappers/query-mapper";
import { QueryResultMapper } from "./mappers/result-mapper";
import { UpsertMapper } from "./mappers/upsert-mapper";
import { ViewMapper } from "./mappers/view-mapper";
import type {
  AggregateExecutor,
  AggregateOptions,
  AggregateResult,
  AggregateResultItem,
  DataModelId,
  DeleteResult,
  IndustrialModelClientOptions,
  NodeId,
  QueryExecutor,
  QueryOptions,
  QueryResult,
  QueryResultItem,
  QueryResultMap,
  QuerySelect,
  UpsertExecutor,
  UpsertOptions,
  UpsertResult,
} from "./types";
import {
  appendNodesAndEdges,
  getQueryForDependenciesPagination,
  mapNodesAndEdges,
} from "./utils/query";
import { QueryResultValidator } from "./validators";

const APPLY_ITEM_LIMIT = 1000;

export class IndustrialModelClient {
  private readonly cognite: CognitePort;
  private readonly queryMapper: QueryMapper;
  private readonly aggregateMapper: AggregateMapper;
  private readonly upsertMapper: UpsertMapper;
  private readonly aggregateResultMapper: AggregateResultMapper;
  private readonly resultMapper: QueryResultMapper;
  private readonly resultValidator: QueryResultValidator;
  private readonly validateResults: boolean;

  constructor(
    client: CogniteClient,
    dataModelId: DataModelId,
    options: IndustrialModelClientOptions = {},
  ) {
    const cognite = createCogniteAdapter(client);
    this.cognite = cognite;
    const viewMapper = new ViewMapper(cognite, dataModelId);
    this.queryMapper = new QueryMapper(viewMapper, cognite);
    this.aggregateMapper = new AggregateMapper(viewMapper, cognite);
    this.upsertMapper = new UpsertMapper(viewMapper, cognite);
    this.aggregateResultMapper = new AggregateResultMapper();
    this.resultMapper = new QueryResultMapper(viewMapper);
    this.resultValidator = new QueryResultValidator(viewMapper);
    this.validateResults = options.validateResults ?? false;
  }

  query<TModel>(): QueryExecutor<TModel> {
    const execute = <const TSelect extends QuerySelect<TModel> | undefined = undefined>(
      options: QueryOptions<TModel, TSelect>,
    ): Promise<QueryResult<QueryResultItem<TModel, TSelect>>> => this.queryInternal(options);

    return execute as unknown as QueryExecutor<TModel>;
  }

  aggregate<TModel>(): AggregateExecutor<TModel> {
    const execute = <const TOptions extends AggregateOptions<TModel>>(
      options: TOptions,
    ): Promise<
      AggregateResult<AggregateResultItem<TModel, TOptions["groupBy"], TOptions["aggregate"]>>
    > => this.aggregateInternal(options);

    return execute as unknown as AggregateExecutor<TModel>;
  }

  upsert<TModel>(): UpsertExecutor<TModel> {
    const execute = (options: UpsertOptions<TModel>): Promise<UpsertResult> =>
      this.upsertInternal(options);

    return execute as unknown as UpsertExecutor<TModel>;
  }

  async delete<TItem extends NodeId>(items: TItem[]): Promise<DeleteResult> {
    const deleteItems = items.map((item) => {
      assertNodeId(item);
      return {
        instanceType: "node" as const,
        space: item.space,
        externalId: item.externalId,
      };
    });

    const response = await this.applyInstancesInChunks({
      items: [],
      delete: deleteItems,
    });
    return { items: response.items as DeleteResult["items"] };
  }

  private async upsertInternal<TModel>(options: UpsertOptions<TModel>): Promise<UpsertResult> {
    const cogniteRequest = await this.upsertMapper.map(options);
    const response = await this.applyInstancesInChunks(cogniteRequest);
    return { items: response.items };
  }

  private async applyInstancesInChunks(
    request: InstancesApplyRequest,
  ): Promise<{ items: UpsertResult["items"] }> {
    const deleteItems = request.delete ?? [];
    const totalItems = request.items.length + deleteItems.length;

    if (totalItems === 0) return { items: [] };

    if (totalItems <= APPLY_ITEM_LIMIT) {
      return this.cognite.applyInstances(request);
    }

    const responses: UpsertResult["items"] = [];

    for (const deleteChunk of chunks(deleteItems, APPLY_ITEM_LIMIT)) {
      const response = await this.cognite.applyInstances({
        items: [],
        delete: deleteChunk,
      });
      responses.push(...response.items);
    }

    for (const itemChunk of chunks(request.items, APPLY_ITEM_LIMIT)) {
      const response = await this.cognite.applyInstances({
        items: itemChunk,
        ...(request.replace === true ? { replace: true } : {}),
      });
      responses.push(...response.items);
    }

    return { items: responses };
  }

  private async aggregateInternal<TModel, const TOptions extends AggregateOptions<TModel>>(
    options: TOptions,
  ): Promise<
    AggregateResult<AggregateResultItem<TModel, TOptions["groupBy"], TOptions["aggregate"]>>
  > {
    const cogniteRequest = await this.aggregateMapper.map(options);
    const response = await this.cognite.aggregateInstances(cogniteRequest);
    const items = this.aggregateResultMapper.map<TModel, TOptions["groupBy"]>(
      response,
      options,
    ) as AggregateResultItem<TModel, TOptions["groupBy"], TOptions["aggregate"]>[];
    return { items };
  }

  private async queryInternal<TModel, TSelect extends QuerySelect<TModel> | undefined = undefined>(
    options: QueryOptions<TModel, TSelect>,
  ): Promise<QueryResult<QueryResultItem<TModel, TSelect>>> {
    const { viewExternalId, limit = DEFAULT_LIMIT } = options;
    const allPages = options.limit === -1;
    const cogniteQuery = await this.queryMapper.map(options);
    const data: QueryResultItem<TModel, TSelect>[] = [];

    while (true) {
      const queryResult = await this.cognite.queryInstances(cogniteQuery);

      const dependenciesData = await this.queryDependenciesPages(
        cogniteQuery,
        queryResult,
        viewExternalId,
      );

      const queryResultData = appendNodesAndEdges(
        mapNodesAndEdges(queryResult, cogniteQuery),
        dependenciesData,
      );

      const mappedPageResult = await this.resultMapper.mapNodes(viewExternalId, queryResultData);
      const pageResult = this.validateResults
        ? await this.resultValidator.parseItems(viewExternalId, mappedPageResult, options.select)
        : mappedPageResult;
      const nextCursor = queryResult.nextCursor[viewExternalId] ?? null;
      const isLastPage = pageResult.length < limit || !nextCursor;
      const resolvedCursor = isLastPage ? null : nextCursor;

      data.push(...(pageResult as QueryResultItem<TModel, TSelect>[]));

      if (!isLastPage && resolvedCursor !== null) {
        cogniteQuery.cursors = { [viewExternalId]: resolvedCursor };
      }

      if (!allPages || isLastPage) {
        return { items: data, cursor: resolvedCursor };
      }
    }
  }

  private async queryDependenciesPages(
    cogniteQuery: InstancesQueryRequest,
    queryResult: InstancesQueryResponse,
    viewExternalId: string,
    remainingDepth = MAX_DEPENDENCY_DEPTH,
  ): Promise<QueryResultMap | null> {
    if (remainingDepth <= 0) {
      return null;
    }

    const newQuery = getQueryForDependenciesPagination(cogniteQuery, queryResult, viewExternalId);

    if (!newQuery) return null;

    const newQueryResult = await this.cognite.queryInstances(newQuery);
    const result = mapNodesAndEdges(newQueryResult, newQuery);

    const nestedResults = await this.queryDependenciesPages(
      newQuery,
      newQueryResult,
      viewExternalId,
      remainingDepth - 1,
    );

    return appendNodesAndEdges(result, nestedResults);
  }
}

function chunks<TItem>(items: TItem[], size: number): TItem[][] {
  const result: TItem[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function assertNodeId(value: unknown): asserts value is NodeId {
  if (
    value == null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value as Partial<NodeId>).space !== "string" ||
    (value as Partial<NodeId>).space?.length === 0 ||
    typeof (value as Partial<NodeId>).externalId !== "string" ||
    (value as Partial<NodeId>).externalId?.length === 0
  ) {
    throw new Error("Invalid delete options:\n- items: expected NodeId values");
  }
}
