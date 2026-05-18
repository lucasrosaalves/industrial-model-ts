import type { CogniteClient } from "@cognite/sdk";
import {
  type CognitePort,
  createCogniteAdapter,
  type InstancesQueryRequest,
  type InstancesQueryResponse,
} from "./cognite";
import { DEFAULT_LIMIT, MAX_DEPENDENCY_DEPTH } from "./constants";
import { QueryMapper } from "./mappers/query-mapper";
import { QueryResultMapper } from "./mappers/result-mapper";
import { ViewMapper } from "./mappers/view-mapper";
import type { DataModelId, QueryOptions, QueryResult, QueryResultMap } from "./types";
import {
  appendNodesAndEdges,
  getQueryForDependenciesPagination,
  mapNodesAndEdges,
} from "./utils/query";

export class IndustrialModel {
  private readonly cognite: CognitePort;
  private readonly queryMapper: QueryMapper;
  private readonly resultMapper: QueryResultMapper;

  constructor(client: CogniteClient, dataModelId: DataModelId) {
    const cognite = createCogniteAdapter(client);
    this.cognite = cognite;
    const viewMapper = new ViewMapper(cognite, dataModelId);
    this.queryMapper = new QueryMapper(viewMapper);
    this.resultMapper = new QueryResultMapper(viewMapper);
  }

  async query<T, TRelation = never>(options: QueryOptions<T, TRelation>): Promise<QueryResult> {
    const { viewExternalId, limit = DEFAULT_LIMIT } = options;
    const allPages = options.limit === -1;
    const cogniteQuery = await this.queryMapper.map(options);
    const data: Record<string, unknown>[] = [];

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

      const pageResult = await this.resultMapper.mapNodes(viewExternalId, queryResultData);
      const nextCursor = queryResult.nextCursor[viewExternalId] ?? null;
      data.push(...pageResult);

      const isLastPage = pageResult.length < limit || !nextCursor;
      const resolvedCursor = isLastPage ? null : nextCursor;

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
