import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonTypesConfig } from "../../src/cli/generator/json-types-parser";
import type { ViewDefinition } from "../../src/cli/generator/models";
import {
  type GeneratorConfig,
  generate,
  generateFromDefinitions,
} from "../../src/cli/generator/renderer";

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
    viewMapperCache: true,
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
    expect(existsSync(join(outputDir, "view-mapper.ts"))).toBe(false);
  });

  it("includes custom type declarations in generated types.ts", () => {
    const config = makeConfig();
    const views: ViewDefinition[] = [
      {
        viewName: "Sensor",
        viewExternalId: "Sensor",
        viewSpace: "my_space",
        viewVersion: "1",
        fields: [
          {
            fieldName: "metadata",
            originalName: "metadata",
            cogniteType: "json",
            mappedType: "SensorMetadata",
            isNullable: true,
            isList: false,
            isRelation: false,
            isEdge: false,
            isReverseRelation: false,
            isListDirectRelation: false,
            relationTarget: null,
            relationTargetSpace: null,
            relationTargetExternalId: null,
            enumValues: null,
          },
        ],
      },
    ];

    const jsonTypesConfig: JsonTypesConfig = {
      typeDeclarations: new Map([
        ["SensorMetadata", "export type SensorMetadata = { unit: string; precision: number };"],
      ]),
      overrides: [
        {
          viewSpace: "my_space",
          viewExternalId: "Sensor",
          viewProperty: "metadata",
          expectedType: "SensorMetadata",
        },
      ],
    };

    generateFromDefinitions(views, config, jsonTypesConfig);

    const outputDir = join(config.outputPath, config.dataModelId);
    const typesContent = readFileSync(join(outputDir, "types.ts"), "utf-8");
    expect(typesContent).toContain(
      "export type SensorMetadata = { unit: string; precision: number }",
    );
    expect(typesContent).toContain("metadata?: SensorMetadata");
    expect(typesContent).not.toContain("unknown");
  });
});

const cacheViews = [
  {
    space: "target_space",
    externalId: "Equipment",
    version: "1",
    properties: {
      name: {
        container: {},
        containerPropertyIdentifier: "name",
        type: { type: "text" as const },
      },
    },
  },
];

describe("generate", () => {
  afterEach(() => {
    if (outputPath) {
      rmSync(outputPath, { recursive: true, force: true });
      outputPath = null;
    }
  });

  it("embeds a ViewMapperCache by default", () => {
    const config = makeConfig();

    generate(cacheViews, config);

    const outputDir = join(config.outputPath, config.dataModelId);
    expect(existsSync(join(outputDir, "view-mapper.ts"))).toBe(true);
    const viewMapper = readFileSync(join(outputDir, "view-mapper.ts"), "utf-8");
    expect(viewMapper).toContain("ViewMapperCache.fromViews");
    expect(viewMapper).toContain('"externalId": "Equipment"');
    const client = readFileSync(join(outputDir, "client.ts"), "utf-8");
    expect(client).toContain('import { VIEW_MAPPER_CACHE } from "./view-mapper";');
    expect(client).toContain("viewMapperCache: VIEW_MAPPER_CACHE");
    const index = readFileSync(join(outputDir, "index.ts"), "utf-8");
    expect(index).toContain('export { VIEW_MAPPER_CACHE } from "./view-mapper";');
  });

  it("skips ViewMapperCache when viewMapperCache is false", () => {
    const config = { ...makeConfig(), viewMapperCache: false };

    generate(cacheViews, config);

    const outputDir = join(config.outputPath, config.dataModelId);
    expect(existsSync(join(outputDir, "view-mapper.ts"))).toBe(false);
    const client = readFileSync(join(outputDir, "client.ts"), "utf-8");
    expect(client).not.toContain("VIEW_MAPPER_CACHE");
    const index = readFileSync(join(outputDir, "index.ts"), "utf-8");
    expect(index).not.toContain("VIEW_MAPPER_CACHE");
  });
});
