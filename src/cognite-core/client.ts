import type { CogniteClient } from "@cognite/sdk";
import { IndustrialModelClient } from "../client";
import type {
  AggregateOptions,
  DatapointsExecutor,
  DeleteResult,
  IndustrialModelClientOptions,
  NodeId,
  QueryOptions,
  UpsertOptions,
} from "../types";
import { COGNITE_CORE_DATA_MODEL } from "./data-model";
import type {
  CogniteCoreAggregateExecutor,
  CogniteCoreModel,
  CogniteCoreNodeViewExternalId,
  CogniteCoreQueryExecutor,
  CogniteCoreUpsertExecutor,
  CogniteCoreViewExternalId,
} from "./types";

export class CogniteCoreClient {
  private readonly model: IndustrialModelClient;

  constructor(client: CogniteClient, options: IndustrialModelClientOptions = {}) {
    this.model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL, options);
  }

  query<TView extends CogniteCoreViewExternalId>(
    viewExternalId: TView,
  ): CogniteCoreQueryExecutor<TView> {
    const query = this.model.query<CogniteCoreModel<TView>>();
    const queryWithView = query as unknown as (
      options: QueryOptions<CogniteCoreModel<TView>>,
    ) => unknown;
    const execute = (options: Omit<QueryOptions<CogniteCoreModel<TView>>, "viewExternalId"> = {}) =>
      queryWithView({ ...options, viewExternalId });

    return execute as CogniteCoreQueryExecutor<TView>;
  }

  aggregate<TView extends CogniteCoreNodeViewExternalId>(
    viewExternalId: TView,
  ): CogniteCoreAggregateExecutor<TView> {
    const aggregate = this.model.aggregate<CogniteCoreModel<TView>>();
    const execute = (
      options: Omit<AggregateOptions<CogniteCoreModel<TView>>, "viewExternalId"> = {},
    ) => aggregate({ ...options, viewExternalId });

    // Executor options omit viewExternalId; the executor type adds it back for result inference.
    return execute as unknown as CogniteCoreAggregateExecutor<TView>;
  }

  upsert<TView extends CogniteCoreNodeViewExternalId>(
    viewExternalId: TView,
  ): CogniteCoreUpsertExecutor<TView> {
    const upsert = this.model.upsert<CogniteCoreModel<TView>>();
    const execute = (options: Omit<UpsertOptions<CogniteCoreModel<TView>>, "viewExternalId">) =>
      upsert({ ...options, viewExternalId });

    return execute as CogniteCoreUpsertExecutor<TView>;
  }

  delete<TItem extends NodeId>(items: TItem[]): Promise<DeleteResult> {
    return this.model.delete(items);
  }

  get datapoints(): DatapointsExecutor {
    return this.model.datapoints;
  }
}
