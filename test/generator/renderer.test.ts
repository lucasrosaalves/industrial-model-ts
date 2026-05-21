import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ViewDefinition } from "../../src/cli/generator/models";
import { type GeneratorConfig, generateFromDefinitions } from "../../src/cli/generator/renderer";

const viewDefinitions: ViewDefinition[] = [
  {
    viewName: "Equipment",
    viewExternalId: "Equipment",
    viewSpace: "target_space",
    viewVersion: "1",
    fields: [],
  },
];

let outputPath: string | null = null;

function makeConfig(): GeneratorConfig {
  outputPath = mkdtempSync(join(tmpdir(), "industrial-model-generator-"));
  return {
    dataModelSpace: "target_space",
    dataModelId: "MyDataModel",
    dataModelVersion: "1",
    clientName: "MyDataModel",
    clientFunctionName: "createMyDataModelClient",
    outputPath,
    packageVersion: "0.2.0",
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("generateFromDefinitions", () => {
  afterEach(() => {
    if (outputPath) {
      rmSync(outputPath, { recursive: true, force: true });
      outputPath = null;
    }
  });

  it("writes types, client, and index files", () => {
    const config = makeConfig();

    generateFromDefinitions(viewDefinitions, config);

    const outputDir = join(config.outputPath, config.dataModelId);
    expect(existsSync(join(outputDir, "types.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "client.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "index.ts"))).toBe(true);
    expect(existsSync(join(outputDir, "models.ts"))).toBe(false);
  });
});
