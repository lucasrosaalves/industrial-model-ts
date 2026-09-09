/**
 * Template: renders view-mapper.ts content.
 */

import type { ViewDefinition as CogniteViewDefinition } from "../../../cognite";
import type { GeneratorConfig } from "../renderer";
import { renderHeader } from "./header";

export function renderViewMapperCache(
  views: CogniteViewDefinition[],
  config: GeneratorConfig,
): string {
  return `${renderHeader(config)}

import { ViewMapperCache } from "${config.runtimeModule ?? "industrial-model"}";

const VIEW_DUMPS = ${JSON.stringify(views, null, 2)};

export const VIEW_MAPPER_CACHE = ViewMapperCache.fromViews(VIEW_DUMPS);
`;
}
