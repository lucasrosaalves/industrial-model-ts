/**
 * Renderer: orchestrates parsing views and writing generated files to disk.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ViewDefinition as CogniteViewDefinition } from "../../cognite";
import type { ViewDefinition } from "./models";
import { parseViews } from "./parser";
import { renderClient } from "./templates/client";
import { renderIndex } from "./templates/index";
import { renderModels } from "./templates/models";
import { toPascal } from "./helpers";

export interface GeneratorConfig {
  dataModelSpace: string;
  dataModelId: string;
  dataModelVersion: string;
  clientName: string;
  clientFunctionName: string;
  outputPath: string;
}

export function createGeneratorConfig(options: {
  dataModelSpace: string;
  dataModelId: string;
  dataModelVersion: string;
  clientName: string | undefined;
  outputPath: string | undefined;
}): GeneratorConfig {
  const clientName = options.clientName || toPascal(options.dataModelId);
  return {
    dataModelSpace: options.dataModelSpace,
    dataModelId: options.dataModelId,
    dataModelVersion: options.dataModelVersion,
    clientName,
    clientFunctionName: `create${clientName}Client`,
    outputPath: options.outputPath || "./generated",
  };
}

export function generate(views: CogniteViewDefinition[], config: GeneratorConfig): void {
  const viewDefinitions = parseViews(views);
  generateFromDefinitions(viewDefinitions, config);
}

export function generateFromDefinitions(
  viewDefinitions: ViewDefinition[],
  config: GeneratorConfig,
): void {
  const outputDir = join(config.outputPath, config.dataModelId);

  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true });
  }
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(join(outputDir, "models.ts"), renderModels(viewDefinitions));
  writeFileSync(join(outputDir, "client.ts"), renderClient(viewDefinitions, config));
  writeFileSync(join(outputDir, "index.ts"), renderIndex(config));
}
