/**
 * Template: renders index.ts content.
 */

import type { GeneratorConfig } from "../renderer";
import { renderHeader } from "./header";

export function renderIndex(config: GeneratorConfig): string {
  const exports = [
    `export { DATA_MODEL, ${config.clientName}Client, ${config.clientFunctionName} } from "./client";`,
    ...(config.viewMapperCache ? [`export { VIEW_MAPPER_CACHE } from "./view-mapper";`] : []),
    `export type * from "./types";`,
  ].join("\n");

  return `${renderHeader(config)}

${exports}
`;
}
