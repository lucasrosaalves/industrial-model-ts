/**
 * Template: renders index.ts content.
 */

import type { GeneratorConfig } from "../renderer";

export function renderIndex(config: GeneratorConfig): string {
  return `/* eslint-disable */
// DO NOT EDIT — this file is auto-generated

export * from './models'
export { ${config.clientFunctionName} } from './client'
`;
}
