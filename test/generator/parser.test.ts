import { describe, expect, it } from "vitest";
import { parseViews } from "../../src/cli/generator/parser";
import type { ViewDefinition } from "../../src/cognite";

const assetView: ViewDefinition = {
  space: "asset_space",
  externalId: "Asset",
  version: "1",
  properties: {
    name: {
      container: {},
      containerPropertyIdentifier: "name",
      type: { type: "text" },
    },
    tags: {
      container: {},
      containerPropertyIdentifier: "tags",
      type: { type: "text", list: true },
    },
    class: {
      container: {},
      containerPropertyIdentifier: "class",
      type: {
        type: "direct",
        source: {
          type: "view",
          space: "type_space",
          externalId: "AssetClass",
          version: "1",
        },
      },
    },
    children: {
      through: {
        source: { type: "view", space: "asset_space", externalId: "Asset", version: "1" },
        identifier: "parent",
      },
      source: { type: "view", space: "asset_space", externalId: "Asset", version: "1" },
      connectionType: "multi_reverse_direct_relation",
    },
    equipment: {
      type: { space: "edge_space", externalId: "equipment" },
      source: { type: "view", space: "equip_space", externalId: "Equipment", version: "1" },
      direction: "outwards",
    },
  },
};

const equipmentView: ViewDefinition = {
  space: "equip_space",
  externalId: "Equipment",
  version: "1",
  properties: {},
};

const assetClassView: ViewDefinition = {
  space: "type_space",
  externalId: "AssetClass",
  version: "1",
  properties: {},
};

const enumView: ViewDefinition = {
  space: "test_space",
  externalId: "WidgetInput",
  version: "1",
  properties: {
    dataType: {
      container: {},
      containerPropertyIdentifier: "dataType",
      type: {
        type: "enum",
        values: {
          STRING: { name: "STRING" },
          NUMBER: { name: "NUMBER" },
          BOOLEAN: { name: "BOOLEAN" },
        },
      },
    },
  },
};

describe("parseViews", () => {
  it("projects core view definitions into generator view definitions", () => {
    const views = parseViews([equipmentView, assetView]);

    expect(views.map((view) => view.viewName)).toEqual(["Asset", "Equipment"]);
    expect(views[0]).toMatchObject({
      viewName: "Asset",
      viewExternalId: "Asset",
      viewSpace: "asset_space",
      viewVersion: "1",
    });
  });

  it("maps scalar, list, direct, reverse, and edge properties", () => {
    const asset = parseViews([assetView, equipmentView, assetClassView])[0];
    if (asset == null) {
      throw new Error("Expected parsed Asset view");
    }

    expect(asset.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: "name",
          originalName: "name",
          cogniteType: "text",
          mappedType: "string",
          isList: false,
          isRelation: false,
        }),
        expect.objectContaining({
          fieldName: "tags",
          originalName: "tags",
          cogniteType: "text",
          mappedType: "string",
          isList: true,
          isRelation: false,
        }),
        expect.objectContaining({
          fieldName: "class",
          originalName: "class",
          cogniteType: "direct",
          mappedType: "NodeId",
          isRelation: true,
          isListDirectRelation: false,
          relationTarget: "AssetClass",
          relationTargetSpace: "type_space",
          relationTargetExternalId: "AssetClass",
        }),
        expect.objectContaining({
          fieldName: "children",
          cogniteType: "reverse_direct",
          isRelation: true,
          isReverseRelation: true,
          isList: true,
          relationTarget: "Asset",
        }),
        expect.objectContaining({
          fieldName: "equipment",
          cogniteType: "edge",
          isEdge: true,
          isList: true,
          relationTarget: "Equipment",
          relationTargetSpace: "equip_space",
          relationTargetExternalId: "Equipment",
        }),
      ]),
    );
  });

  it("extracts enum values from properties with type 'enum'", () => {
    const views = parseViews([enumView]);
    const widget = views[0];
    const dataTypeField = widget?.fields.find((f) => f.fieldName === "dataType");

    expect(dataTypeField).toMatchObject({
      fieldName: "dataType",
      cogniteType: "enum",
      mappedType: "string",
      enumValues: ["STRING", "NUMBER", "BOOLEAN"],
    });
  });

  it("nulls out relationTarget for direct relations whose target view is not in the set", () => {
    const viewWithMissingTarget: ViewDefinition = {
      space: "sp",
      externalId: "Equipment",
      version: "1",
      properties: {
        location: {
          container: {},
          containerPropertyIdentifier: "location",
          type: {
            type: "direct",
            source: { type: "view", space: "sp", externalId: "Location", version: "1" },
          },
        },
      },
    };

    const views = parseViews([viewWithMissingTarget]);
    const equipment = views[0];
    const locationField = equipment?.fields.find((f) => f.fieldName === "location");

    expect(locationField).toMatchObject({
      isRelation: true,
      relationTarget: null,
      relationTargetSpace: null,
      relationTargetExternalId: null,
    });
  });

  it("keeps relationTarget intact when the target view is present in the set", () => {
    const views = parseViews([assetView, equipmentView, assetClassView]);
    const asset = views.find((v) => v.viewName === "Asset");
    const classField = asset?.fields.find((f) => f.fieldName === "class");

    expect(classField?.relationTarget).toBe("AssetClass");
  });

  it("nulls out relationTarget for edge connections whose target view is not in the set", () => {
    const viewWithMissingEdgeTarget: ViewDefinition = {
      space: "sp",
      externalId: "Asset",
      version: "1",
      properties: {
        equipment: {
          type: { space: "edge_space", externalId: "equipment" },
          source: { type: "view", space: "equip_space", externalId: "Equipment", version: "1" },
          direction: "outwards",
        },
      },
    };

    const views = parseViews([viewWithMissingEdgeTarget]);
    const asset = views[0];
    const equipmentField = asset?.fields.find((f) => f.fieldName === "equipment");

    expect(equipmentField).toMatchObject({
      isEdge: true,
      relationTarget: null,
      relationTargetSpace: null,
      relationTargetExternalId: null,
    });
  });
});
