/**
 * Shared header for all generated files.
 */

import type { GeneratorConfig } from "../renderer";

export function renderHeader(config: GeneratorConfig): string {
  return `/* eslint-disable */
// DO NOT EDIT — this file is auto-generated
// Data model: ${config.dataModelSpace}/${config.dataModelId} v${config.dataModelVersion}
// Generated at: ${config.generatedAt}
// industrial-model v${config.packageVersion}`;
}
