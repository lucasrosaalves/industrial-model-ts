/**
 * Template: renders index.ts content.
 */

import type { GeneratorConfig } from "../renderer";
import { renderHeader } from "./header";

export function renderIndex(config: GeneratorConfig): string {
  return `${renderHeader(config)}

export { DATA_MODEL, ${config.clientName}Client, ${config.clientFunctionName} } from "./client";
export type * from "./types";
`;
}
