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
    const asset = parseViews([assetView])[0];
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
          fieldName: "class_",
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
});
