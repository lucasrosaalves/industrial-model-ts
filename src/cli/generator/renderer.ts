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
import { renderViewMapperCache } from "./templates/view-mapper";

export interface GeneratorConfig {
  dataModelSpace: string;
  dataModelId: string;
  dataModelVersion: string;
  clientName: string;
  clientFunctionName: string;
  outputPath: string;
  packageVersion: string;
  generatedAt: string;
  /**
   * Embed a `ViewMapperCache` in the generated package so the client does not
   * fetch views from CDF at runtime. Enabled by default.
   */
  viewMapperCache: boolean;
  /** Module specifier used in generated type imports. Defaults to `"industrial-model"`. */
  typesModule?: string;
  /** Module specifier used to import `ViewMapperCache`. Defaults to `"industrial-model"`. */
  runtimeModule?: string;
  /** Skip the `Generated at:` header line so committed output is stable. */
  omitGeneratedAt?: boolean;
  /** Skip the `industrial-model v…` header line so committed output is stable across releases. */
  omitPackageVersion?: boolean;
}

export function createGeneratorConfig(options: {
  dataModelSpace: string;
  dataModelId: string;
  dataModelVersion: string;
  clientName: string | undefined;
  outputPath: string | undefined;
  packageVersion: string;
  viewMapperCache?: boolean;
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
    viewMapperCache: options.viewMapperCache ?? true,
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

  generateFromDefinitions(viewDefinitions, config, jsonTypesConfig, views);
}

function applyJsonTypeOverrides(views: ViewDefinition[], jsonTypesConfig: JsonTypesConfig): void {
  for (const override of jsonTypesConfig.overrides) {
    const view = views.find(
      (v) => v.viewExternalId === override.viewExternalId && v.viewSpace === override.viewSpace,
    );

    if (!view) {
      throw new Error(
        `JSON types config error: view "${override.viewSpace}/${override.viewExternalId}" not found in data model`,
      );
    }

    const field = view.fields.find((f) => f.originalName === override.viewProperty);

    if (!field) {
      throw new Error(
        `JSON types config error: property "${override.viewProperty}" not found in view "${override.viewSpace}/${override.viewExternalId}"`,
      );
    }

    if (field.cogniteType !== "json") {
      throw new Error(
        `JSON types config error: property "${override.viewProperty}" in view "${override.viewSpace}/${override.viewExternalId}" ` +
          `is of type "${field.cogniteType}", not "json"`,
      );
    }

    field.mappedType = override.expectedType;
  }
}

export function generateFromDefinitions(
  viewDefinitions: ViewDefinition[],
  config: GeneratorConfig,
  jsonTypesConfig?: JsonTypesConfig,
  cacheViews?: CogniteViewDefinition[],
): void {
  const outputDir = join(config.outputPath, config.dataModelId);
  const embedViewMapperCache =
    config.viewMapperCache && cacheViews !== undefined && cacheViews.length > 0;
  const fileConfig = { ...config, viewMapperCache: embedViewMapperCache };

  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const customTypeDeclarations = jsonTypesConfig
    ? Array.from(jsonTypesConfig.typeDeclarations.values())
    : [];

  writeFileSync(
    join(outputDir, "types.ts"),
    renderTypes(viewDefinitions, fileConfig, customTypeDeclarations),
  );
  writeFileSync(join(outputDir, "client.ts"), renderClient(viewDefinitions, fileConfig));
  writeFileSync(join(outputDir, "index.ts"), renderIndex(fileConfig));
  if (embedViewMapperCache && cacheViews) {
    writeFileSync(join(outputDir, "view-mapper.ts"), renderViewMapperCache(cacheViews, fileConfig));
  }
}
