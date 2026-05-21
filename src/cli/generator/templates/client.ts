/**
 * Template: renders client.ts content.
 */

import type { ViewDefinition } from "../models";
import { getClientPropertyName } from "../models";
import type { GeneratorConfig } from "../renderer";
import { renderHeader } from "./header";

export function renderClient(views: ViewDefinition[], config: GeneratorConfig): string {
  const imports = [
    `  ${config.clientName}AggregateExecutor,`,
    `  ${config.clientName}Model,`,
    `  ${config.clientName}QueryExecutor,`,
    `  ${config.clientName}UpsertExecutor,`,
    `  ${config.clientName}ViewExternalId,`,
  ].join("\n");

  const viewShortcuts = views
    .map((view) => {
      const prop = getClientPropertyName(view);
      return `    ${prop}: {
      query: model.query("${view.viewExternalId}"),
      aggregate: model.aggregate("${view.viewExternalId}"),
      upsert: model.upsert("${view.viewExternalId}"),
      delete: <TItem extends NodeId>(items: TItem[]) => model.delete(items),
    },`;
    })
    .join("\n");

  return `${renderHeader(config)}

import type { CogniteClient } from "@cognite/sdk";
import {
  IndustrialModelClient,
  type AggregateOptions,
  type DataModelId,
  type DeleteResult,
  type IndustrialModelClientOptions,
  type NodeId,
  type QueryOptions,
  type UpsertOptions,
} from "industrial-model";
import type {
${imports}
} from "./types";

export const DATA_MODEL = {
  space: "${config.dataModelSpace}",
  externalId: "${config.dataModelId}",
  version: "${config.dataModelVersion}",
} satisfies DataModelId;

export class ${config.clientName}Client {
  private readonly model: IndustrialModelClient;

  constructor(client: CogniteClient, options: IndustrialModelClientOptions = {}) {
    this.model = new IndustrialModelClient(client, DATA_MODEL, options);
  }

  query<TView extends ${config.clientName}ViewExternalId>(
    viewExternalId: TView,
  ): ${config.clientName}QueryExecutor<TView> {
    const query = this.model.query<${config.clientName}Model<TView>>();
    const queryWithView = query as unknown as (
      options: QueryOptions<${config.clientName}Model<TView>>,
    ) => unknown;
    const execute = (options: Omit<QueryOptions<${config.clientName}Model<TView>>, "viewExternalId"> = {}) =>
      queryWithView({ ...options, viewExternalId });

    return execute as ${config.clientName}QueryExecutor<TView>;
  }

  aggregate<TView extends ${config.clientName}ViewExternalId>(
    viewExternalId: TView,
  ): ${config.clientName}AggregateExecutor<TView> {
    const aggregate = this.model.aggregate<${config.clientName}Model<TView>>();
    const execute = (
      options: Omit<AggregateOptions<${config.clientName}Model<TView>>, "viewExternalId"> = {},
    ) => aggregate({ ...options, viewExternalId });

    return execute as ${config.clientName}AggregateExecutor<TView>;
  }

  upsert<TView extends ${config.clientName}ViewExternalId>(
    viewExternalId: TView,
  ): ${config.clientName}UpsertExecutor<TView> {
    const upsert = this.model.upsert<${config.clientName}Model<TView>>();
    const execute = (options: Omit<UpsertOptions<${config.clientName}Model<TView>>, "viewExternalId">) =>
      upsert({ ...options, viewExternalId });

    return execute as ${config.clientName}UpsertExecutor<TView>;
  }

  delete<TItem extends NodeId>(items: TItem[]): Promise<DeleteResult> {
    return this.model.delete(items);
  }
}

export function ${config.clientFunctionName}(
  cogniteClient: CogniteClient,
  options: IndustrialModelClientOptions = {},
) {
  const model = new ${config.clientName}Client(cogniteClient, options);

  return {
    model,
${viewShortcuts}
  };
}
`;
}
