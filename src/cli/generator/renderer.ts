/**
 * Renderer: orchestrates parsing views and writing generated files to disk.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ViewDefinition as CogniteViewDefinition } from "../../cognite";
import { toPascal } from "./helpers";
import type { JsonTypesConfig } from "./json-types-parser";
import type { ViewDefinition } from "./models";
import { parseViews } from "./parser";
import { renderClient } from "./templates/client";
import { renderIndex } from "./templates/index";
import { renderTypes } from "./templates/types";

export interface GeneratorConfig {
  dataModelSpace: string;
  dataModelId: string;
  dataModelVersion: string;
  clientName: string;
  clientFunctionName: string;
  outputPath: string;
  packageVersion: string;
  generatedAt: string;
}

export function createGeneratorConfig(options: {
  dataModelSpace: string;
  dataModelId: string;
  dataModelVersion: string;
  clientName: string | undefined;
  outputPath: string | undefined;
  packageVersion: string;
}): GeneratorConfig {
  const clientName = options.clientName || toPascal(options.dataModelId);
  return {
    dataModelSpace: options.dataModelSpace,
    dataModelId: options.dataModelId,
    dataModelVersion: options.dataModelVersion,
    clientName,
    clientFunctionName: `create${clientName}Client`,
    outputPath: options.outputPath || "./generated",
    packageVersion: options.packageVersion,
    generatedAt: new Date().toISOString(),
  };
}

export function generate(
  views: CogniteViewDefinition[],
  config: GeneratorConfig,
  jsonTypesConfig?: JsonTypesConfig,
): void {
  const viewDefinitions = parseViews(views);

  // Validate and apply JSON type overrides
  if (jsonTypesConfig) {
    applyJsonTypeOverrides(viewDefinitions, jsonTypesConfig);
  }

  generateFromDefinitions(viewDefinitions, config, jsonTypesConfig);
}

function applyJsonTypeOverrides(views: ViewDefinition[], jsonTypesConfig: JsonTypesConfig): void {
  for (const override of jsonTypesConfig.overrides) {
    const view = views.find(
      (v) => v.viewExternalId === override.view && v.viewSpace === override.space,
    );

    if (!view) {
      throw new Error(
        `JSON types config error: view "${override.space}/${override.view}" not found in data model`,
      );
    }

    const field = view.fields.find((f) => f.originalName === override.property);

    if (!field) {
      throw new Error(
        `JSON types config error: property "${override.property}" not found in view "${override.space}/${override.view}"`,
      );
    }

    if (field.cogniteType !== "json") {
      throw new Error(
        `JSON types config error: property "${override.property}" in view "${override.space}/${override.view}" ` +
          `is of type "${field.cogniteType}", not "json"`,
      );
    }

    field.mappedType = override.type;
  }
}

export function generateFromDefinitions(
  viewDefinitions: ViewDefinition[],
  config: GeneratorConfig,
  jsonTypesConfig?: JsonTypesConfig,
): void {
  const outputDir = join(config.outputPath, config.dataModelId);

  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const customTypeDeclarations = jsonTypesConfig
    ? Array.from(jsonTypesConfig.typeDeclarations.values())
    : [];

  writeFileSync(
    join(outputDir, "types.ts"),
    renderTypes(viewDefinitions, config, customTypeDeclarations),
  );
  writeFileSync(join(outputDir, "client.ts"), renderClient(viewDefinitions, config));
  writeFileSync(join(outputDir, "index.ts"), renderIndex(config));
}
