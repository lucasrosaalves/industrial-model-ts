/**
 * Shared header for all generated files.
 */

import type { GeneratorConfig } from "../renderer";

export function renderHeader(config: GeneratorConfig): string {
  const versionLabel = config.dataModelVersion.startsWith("v")
    ? config.dataModelVersion
    : `v${config.dataModelVersion}`;
  const lines = [
    "/* eslint-disable */",
    "// DO NOT EDIT — this file is auto-generated",
    `// Data model: ${config.dataModelSpace}/${config.dataModelId} ${versionLabel}`,
  ];
  if (config.omitGeneratedAt !== true) {
    lines.push(`// Generated at: ${config.generatedAt}`);
  }
  if (config.omitPackageVersion !== true) {
    lines.push(`// industrial-model v${config.packageVersion}`);
  }
  return lines.join("\n");
}
