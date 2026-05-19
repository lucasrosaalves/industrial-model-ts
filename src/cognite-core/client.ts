import type { CogniteClient } from "@cognite/sdk";
import { IndustrialModelClient } from "../client";
import type {
  AggregateOptions,
  DataModelId,
  IndustrialModelClientOptions,
  QueryOptions,
} from "../types";
import type {
  CogniteCoreAggregateExecutor,
  CogniteCoreModel,
  CogniteCoreQueryExecutor,
  CogniteCoreViewExternalId,
} from "./types";

/** Data model id for Cognite Core v1. */
export const COGNITE_CORE_DATA_MODEL = {
  space: "cdf_cdm",
  externalId: "CogniteCore",
  version: "v1",
} satisfies DataModelId;

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

  aggregate<TView extends CogniteCoreViewExternalId>(
    viewExternalId: TView,
  ): CogniteCoreAggregateExecutor<TView> {
    const aggregate = this.model.aggregate<CogniteCoreModel<TView>>();
    const execute = (
      options: Omit<AggregateOptions<CogniteCoreModel<TView>>, "viewExternalId"> = {},
    ) => aggregate({ ...options, viewExternalId });

    return execute as CogniteCoreAggregateExecutor<TView>;
  }
}
