import { describe, expect, it } from "vitest";
import type { ViewDefinition } from "../../src/cli/generator/models";
import type { GeneratorConfig } from "../../src/cli/generator/renderer";
import { renderClient } from "../../src/cli/generator/templates/client";
import { renderIndex } from "../../src/cli/generator/templates/index";
import { renderTypes } from "../../src/cli/generator/templates/types";

const mockViews: ViewDefinition[] = [
  {
    viewName: "Equipment",
    viewExternalId: "Equipment",
    viewSpace: "target_space",
    viewVersion: "1",
    fields: [
      {
        fieldName: "name",
        originalName: "name",
        cogniteType: "text",
        mappedType: "string",
        isNullable: false,
        isList: false,
        isRelation: false,
        isEdge: false,
        isReverseRelation: false,
        isListDirectRelation: false,
        relationTarget: null,
        relationTargetSpace: null,
        relationTargetExternalId: null,
      },
      {
        fieldName: "temperature",
        originalName: "temperature",
        cogniteType: "float64",
        mappedType: "number",
        isNullable: true,
        isList: false,
        isRelation: false,
        isEdge: false,
        isReverseRelation: false,
        isListDirectRelation: false,
        relationTarget: null,
        relationTargetSpace: null,
        relationTargetExternalId: null,
      },
    ],
  },
  {
    viewName: "User",
    viewExternalId: "User",
    viewSpace: "target_space",
    viewVersion: "2",
    fields: [
      {
        fieldName: "name",
        originalName: "name",
        cogniteType: "text",
        mappedType: "string",
        isNullable: false,
        isList: false,
        isRelation: false,
        isEdge: false,
        isReverseRelation: false,
        isListDirectRelation: false,
        relationTarget: null,
        relationTargetSpace: null,
        relationTargetExternalId: null,
      },
      {
        fieldName: "role",
        originalName: "role",
        cogniteType: "direct",
        mappedType: "NodeId",
        isNullable: true,
        isList: false,
        isRelation: true,
        isEdge: false,
        isReverseRelation: false,
        isListDirectRelation: false,
        relationTarget: "Role",
        relationTargetSpace: "imported_space",
        relationTargetExternalId: "Role",
      },
      {
        fieldName: "tags",
        originalName: "tags",
        cogniteType: "text",
        mappedType: "string",
        isNullable: false,
        isList: true,
        isRelation: false,
        isEdge: false,
        isReverseRelation: false,
        isListDirectRelation: false,
        relationTarget: null,
        relationTargetSpace: null,
        relationTargetExternalId: null,
      },
    ],
  },
  {
    viewName: "Role",
    viewExternalId: "Role",
    viewSpace: "imported_space",
    viewVersion: "1",
    fields: [
      {
        fieldName: "name",
        originalName: "name",
        cogniteType: "text",
        mappedType: "string",
        isNullable: false,
        isList: false,
        isRelation: false,
        isEdge: false,
        isReverseRelation: false,
        isListDirectRelation: false,
        relationTarget: null,
        relationTargetSpace: null,
        relationTargetExternalId: null,
      },
      {
        fieldName: "users",
        originalName: "users",
        cogniteType: "reverse_direct",
        mappedType: "NodeId",
        isNullable: false,
        isList: true,
        isRelation: true,
        isEdge: false,
        isReverseRelation: true,
        isListDirectRelation: false,
        relationTarget: "User",
        relationTargetSpace: "target_space",
        relationTargetExternalId: "User",
      },
    ],
  },
];

const mockConfig: GeneratorConfig = {
  dataModelSpace: "target_space",
  dataModelId: "MyDataModel",
  dataModelVersion: "1",
  clientName: "MyDataModel",
  clientFunctionName: "createMyDataModelClient",
  outputPath: "./generated",
  packageVersion: "0.2.0",
  generatedAt: "2026-01-01T00:00:00.000Z",
};

describe("renderTypes", () => {
  it("generates IndustrialModel type aliases", () => {
    const output = renderTypes(mockViews, mockConfig);

    expect(output).toContain("// Data model: target_space/MyDataModel v1");
    expect(output).toContain("// industrial-model v0.2.0");
    expect(output).toContain("IndustrialModel,");
    expect(output).toContain('} from "industrial-model";');
    expect(output).toContain("export type Equipment = IndustrialModel<{");
    expect(output).toContain("export type User = IndustrialModel<");
    expect(output).toContain("export type Role = IndustrialModel<");
  });

  it("generates props and relation fields correctly", () => {
    const output = renderTypes(mockViews, mockConfig);

    expect(output).toContain("name: string");
    expect(output).toContain("temperature?: number");
    expect(output).toContain("role?: NodeId");
    expect(output).toContain("tags: string[]");
    expect(output).toContain("role?: Role");
    expect(output).toContain("users: User[]");
  });

  it("generates view union, model map, and executor aliases", () => {
    const output = renderTypes(mockViews, mockConfig);

    expect(output).toContain("export type MyDataModelViewExternalId =");
    expect(output).toContain('| "Equipment"');
    expect(output).toContain('| "User"');
    expect(output).toContain('  "Equipment": Equipment;');
    expect(output).toContain("export interface MyDataModelModelByView");
    expect(output).toContain(
      "export type MyDataModelModel<TView extends MyDataModelViewExternalId>",
    );
    expect(output).toContain("export type MyDataModelQueryExecutor");
    expect(output).toContain("export type MyDataModelAggregateExecutor");
    expect(output).toContain("export type MyDataModelUpsertExecutor");
  });

  it("excludes reverse relations from props", () => {
    const output = renderTypes(mockViews, mockConfig);
    const roleSection = output.split("export type Role")[1];

    expect(roleSection).not.toContain("users: NodeId[]");
  });
});

describe("renderClient", () => {
  it("generates DATA_MODEL and the core-like client class", () => {
    const output = renderClient(mockViews, mockConfig);

    expect(output).toContain("export const DATA_MODEL = {");
    expect(output).toContain('space: "target_space"');
    expect(output).toContain('externalId: "MyDataModel"');
    expect(output).toContain('version: "1"');
    expect(output).toContain("export class MyDataModelClient");
    expect(output).toContain("query<TView extends MyDataModelViewExternalId>");
    expect(output).toContain("aggregate<TView extends MyDataModelViewExternalId>");
    expect(output).toContain("upsert<TView extends MyDataModelViewExternalId>");
    expect(output).toContain("delete<TItem extends NodeId>");
  });

  it("imports generated types and runtime APIs from the right modules", () => {
    const output = renderClient(mockViews, mockConfig);

    expect(output).toContain('from "industrial-model";');
    expect(output).toContain('} from "./types";');
    expect(output).not.toContain('from "../');
    expect(output).not.toContain('from "./models"');
  });

  it("generates a factory with per-view operation shortcuts backed by the generated client", () => {
    const output = renderClient(mockViews, mockConfig);

    expect(output).toContain(
      "export function createMyDataModelClient(\n  cogniteClient: CogniteClient,",
    );
    expect(output).toContain("const model = new MyDataModelClient(cogniteClient, options);");
    expect(output).toContain("equipment: {");
    expect(output).toContain('query: model.query("Equipment")');
    expect(output).toContain('aggregate: model.aggregate("Equipment")');
    expect(output).toContain('upsert: model.upsert("Equipment")');
    expect(output).toContain("user: {");
    expect(output).toContain('query: model.query("User")');
    expect(output).toContain("role: {");
    expect(output).toContain('aggregate: model.aggregate("Role")');
    expect(output).toContain(
      "delete: <TItem extends NodeId>(items: TItem[]) => model.delete(items)",
    );
  });
});

describe("renderIndex", () => {
  it("exports client, factory, data model id, and generated types", () => {
    const output = renderIndex(mockConfig);

    expect(output).toContain(
      'export { DATA_MODEL, MyDataModelClient, createMyDataModelClient } from "./client";',
    );
    expect(output).toContain('export type * from "./types";');
    expect(output).not.toContain("./models");
  });
});
