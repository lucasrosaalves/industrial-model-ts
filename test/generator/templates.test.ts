import { describe, expect, it } from "vitest";
import { renderModels } from "../../src/cli/generator/templates/models";
import { renderClient } from "../../src/cli/generator/templates/client";
import { renderIndex } from "../../src/cli/generator/templates/index";
import type { ViewDefinition } from "../../src/cli/generator/models";
import type { GeneratorConfig } from "../../src/cli/generator/renderer";

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

describe("renderModels", () => {
  it("generates IndustrialModel type aliases", () => {
    const output = renderModels(mockViews, mockConfig);

    expect(output).toContain("// Data model: target_space/MyDataModel v1");
    expect(output).toContain("// industrial-model v0.2.0");
    expect(output).toContain("import type { IndustrialModel, NodeId } from 'industrial-model'");
    expect(output).toContain("export type Equipment = IndustrialModel<{");
    expect(output).toContain("export type User = IndustrialModel<");
    expect(output).toContain("export type Role = IndustrialModel<");
  });

  it("generates props fields correctly", () => {
    const output = renderModels(mockViews, mockConfig);

    expect(output).toContain("name: string");
    expect(output).toContain("temperature?: number");
    expect(output).toContain("role?: NodeId");
    expect(output).toContain("tags: string[]");
  });

  it("generates relations type param for views with relations", () => {
    const output = renderModels(mockViews, mockConfig);

    expect(output).toContain("role?: Role");
    expect(output).toContain("users: User[]");
  });

  it("excludes reverse relations from props", () => {
    const output = renderModels(mockViews, mockConfig);

    // Role's "users" reverse relation should NOT appear in props
    // It should only appear in relations
    const roleSection = output.split("export type Role")[1];
    // The props section shouldn't have "users" with NodeId[]
    expect(roleSection).not.toContain("users: NodeId[]");
  });

  it("does not contain old patterns", () => {
    const output = renderModels(mockViews, mockConfig);

    expect(output).not.toContain("interface");
    expect(output).not.toContain("WhereInput");
    expect(output).not.toContain("SelectPayload");
    expect(output).not.toContain("SortDirection");
  });
});

describe("renderClient", () => {
  it("generates client function with correct name", () => {
    const output = renderClient(mockViews, mockConfig);

    expect(output).toContain("export function createMyDataModelClient(cogniteClient: CogniteClient)");
  });

  it("includes IndustrialModelClient instantiation with data model id", () => {
    const output = renderClient(mockViews, mockConfig);

    expect(output).toContain('space: "target_space"');
    expect(output).toContain('externalId: "MyDataModel"');
    expect(output).toContain('version: "1"');
  });

  it("generates query methods for each view", () => {
    const output = renderClient(mockViews, mockConfig);

    expect(output).toContain('viewExternalId: "Equipment"');
    expect(output).toContain('viewExternalId: "User"');
    expect(output).toContain('viewExternalId: "Role"');
    expect(output).toContain("QuerySelect<Equipment>");
    expect(output).toContain("QuerySelect<User>");
    expect(output).toContain("QuerySelect<Role>");
  });

  it("exports the model instance", () => {
    const output = renderClient(mockViews, mockConfig);
    expect(output).toContain("model,");
  });

  it("uses correct imports", () => {
    const output = renderClient(mockViews, mockConfig);

    expect(output).toContain("IndustrialModelClient");
    expect(output).toContain("QueryOptions");
    expect(output).toContain("QuerySelect");
    expect(output).toContain("CogniteClient");
  });
});

describe("renderIndex", () => {
  it("re-exports models and client", () => {
    const output = renderIndex(mockConfig);

    expect(output).toContain("export * from './models'");
    expect(output).toContain("export { createMyDataModelClient } from './client'");
  });
});
