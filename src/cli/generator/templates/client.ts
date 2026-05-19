/**
 * Template: renders client.ts content.
 */

import type { ViewDefinition } from "../models";
import { getClientPropertyName } from "../models";
import type { GeneratorConfig } from "../renderer";

export function renderClient(views: ViewDefinition[], config: GeneratorConfig): string {
  const imports = views.map((v) => `  ${v.viewName},`).join("\n");

  const methods = views.map((view) => {
    const prop = getClientPropertyName(view);
    return `    ${prop}: <const TSelect extends QuerySelect<${view.viewName}> | undefined = undefined>(
      options?: Omit<QueryOptions<${view.viewName}, TSelect>, 'viewExternalId'>
    ) => model.query<${view.viewName}>()({ viewExternalId: "${view.viewExternalId}", ...options }),`;
  }).join("\n");

  return `/* eslint-disable */
// DO NOT EDIT — this file is auto-generated

import type { CogniteClient } from '@cognite/sdk'
import { IndustrialModelClient, type QueryOptions, type QuerySelect } from 'industrial-model'
import type {
${imports}
} from './models'

export function ${config.clientFunctionName}(cogniteClient: CogniteClient) {
  const model = new IndustrialModelClient(cogniteClient, {
    space: "${config.dataModelSpace}",
    externalId: "${config.dataModelId}",
    version: "${config.dataModelVersion}",
  })

  return {
    model,
${methods}
  }
}
`;
}
