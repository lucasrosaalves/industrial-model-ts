/**
 * Template: renders index.ts content.
 */

import type { GeneratorConfig } from "../renderer";
import { renderHeader } from "./header";

export function renderIndex(config: GeneratorConfig): string {
  return `${renderHeader(config)}

export * from "./models";
export { ${config.clientFunctionName} } from "./client";
`;
}
