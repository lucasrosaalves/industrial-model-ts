/**
 * Generate in-repo Cognite Core types from a view fixture.
 *
 * `src/cognite-core/client.ts` is hand-maintained (custom data-model constant and
 * datapoints) and must not be overwritten by the CLI client template.
 */

import type { ViewDefinition as CogniteViewDefinition } from "../../cognite";
import { COGNITE_CORE_DATA_MODEL } from "../../cognite-core/data-model";
import { parseViews } from "./parser";
import { createGeneratorConfig, type GeneratorConfig } from "./renderer";
import { renderTypes } from "./templates/types";

export function createCogniteCoreGeneratorConfig(): GeneratorConfig {
  return {
    ...createGeneratorConfig({
      dataModelSpace: COGNITE_CORE_DATA_MODEL.space,
      dataModelId: COGNITE_CORE_DATA_MODEL.externalId,
      dataModelVersion: COGNITE_CORE_DATA_MODEL.version,
      clientName: "CogniteCore",
      outputPath: "src/cognite-core",
      packageVersion: "",
    }),
    typesModule: "../types",
    omitGeneratedAt: true,
    omitPackageVersion: true,
  };
}

export function renderCogniteCoreTypes(views: CogniteViewDefinition[]): string {
  return renderTypes(parseViews(views), createCogniteCoreGeneratorConfig());
}
