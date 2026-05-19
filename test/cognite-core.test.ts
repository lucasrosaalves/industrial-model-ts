import { describe, expect, it } from "vitest";
import type { NodeDefinition } from "../src/cognite";
import { COGNITE_CORE_DATA_MODEL, CogniteCoreClient } from "../src/cognite-core/index.js";
import {
  makeCogniteAssetAggregateByNameResponse,
  makeCogniteAssetQueryResult,
  makeCogniteClientMock,
} from "./fixtures/index.js";

const SPACE = "cdf_cdm";
const ASSET_VIEW_KEY = "CogniteAsset/v1";

function makeCogniteAssetWithChildrenQueryResult() {
  const rootAsset: NodeDefinition = {
    instanceType: "node",
    space: "asset-space",
    externalId: "root-asset",
    properties: {
      [SPACE]: {
        [ASSET_VIEW_KEY]: { name: "Root Asset" },
      },
    },
  };

  const childAsset: NodeDefinition = {
    instanceType: "node",
    space: "asset-space",
    externalId: "child-asset",
    properties: {
      [SPACE]: {
        [ASSET_VIEW_KEY]: {
          name: "Child Asset",
          parent: { space: "asset-space", externalId: "root-asset" },
        },
      },
    },
  };

  return {
    CogniteAsset: [rootAsset],
    "CogniteAsset|children": [childAsset],
  };
}

describe("Cognite Core module", () => {
  it("exports the Cognite Core data model id", () => {
    expect(COGNITE_CORE_DATA_MODEL).toEqual({
      space: "cdf_cdm",
      externalId: "CogniteCore",
      version: "v1",
    });
  });

  it("queries Cognite Core views without requiring a viewExternalId option", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetQueryResult(),
    });
    const core = new CogniteCoreClient(client);

    const { items, cursor } = await core.query("CogniteAsset")({
      select: {
        name: true,
        parent: { name: true },
      },
      filters: { name: { eq: "Root Asset" } },
      limit: 10,
    });

    expect(client.dataModels.retrieve).toHaveBeenCalledWith([COGNITE_CORE_DATA_MODEL], {
      inlineViews: true,
    });
    expect(client.instances.query).toHaveBeenCalledWith(
      expect.objectContaining({
        with: expect.objectContaining({
          CogniteAsset: expect.objectContaining({ limit: 10 }),
          "CogniteAsset|parent": expect.objectContaining({
            nodes: expect.objectContaining({
              direction: "outwards",
              from: "CogniteAsset",
            }),
          }),
        }),
        select: expect.objectContaining({
          CogniteAsset: {
            sources: [
              {
                source: {
                  type: "view",
                  space: "cdf_cdm",
                  externalId: "CogniteAsset",
                  version: "v1",
                },
                properties: ["name", "parent"],
              },
            ],
          },
        }),
      }),
    );
    expect(cursor).toBeNull();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: "root-asset",
      name: "Root Asset",
      parent: {
        externalId: "parent-asset",
        name: "Parent Asset",
      },
    });
  });

  it("maps reverse relation results for generated entity relations", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetWithChildrenQueryResult(),
    });
    const core = new CogniteCoreClient(client);

    const { items } = await core.query("CogniteAsset")({
      select: {
        children: { name: true },
      },
    });

    expect(client.instances.query).toHaveBeenCalledWith(
      expect.objectContaining({
        with: expect.objectContaining({
          "CogniteAsset|children": expect.objectContaining({
            nodes: expect.objectContaining({
              direction: "inwards",
              from: "CogniteAsset",
              through: {
                source: {
                  type: "view",
                  space: "cdf_cdm",
                  externalId: "CogniteAsset",
                  version: "v1",
                },
                identifier: "parent",
              },
            }),
          }),
        }),
      }),
    );
    expect(items[0]).toMatchObject({
      externalId: "root-asset",
      children: [
        {
          externalId: "child-asset",
          name: "Child Asset",
        },
      ],
    });
  });

  describe("inward list-direct-relation traversal", () => {
    // timeSeries, files, and activities are removed from the CogniteAsset type because
    // Cognite rejects inward traversal of list direct relations at runtime. These tests
    // verify the runtime guard still fires (via `as never`) and that Cognite is never called.
    it("rejects selecting timeSeries from CogniteAsset before calling Cognite", async () => {
      const client = makeCogniteClientMock();
      const core = new CogniteCoreClient(client);

      await expect(
        core.query("CogniteAsset")({ select: { timeSeries: { name: true } } as never }),
      ).rejects.toThrow(/select\.timeSeries.*list direct relations/);

      expect(client.instances.query).not.toHaveBeenCalled();
    });

    it("rejects selecting files from CogniteAsset before calling Cognite", async () => {
      const client = makeCogniteClientMock();
      const core = new CogniteCoreClient(client);

      await expect(
        core.query("CogniteAsset")({ select: { files: { name: true } } as never }),
      ).rejects.toThrow(/select\.files.*list direct relations/);

      expect(client.instances.query).not.toHaveBeenCalled();
    });

    it("rejects selecting activities from CogniteAsset before calling Cognite", async () => {
      const client = makeCogniteClientMock();
      const core = new CogniteCoreClient(client);

      await expect(
        core.query("CogniteAsset")({ select: { activities: { name: true } } as never }),
      ).rejects.toThrow(/select\.activities.*list direct relations/);

      expect(client.instances.query).not.toHaveBeenCalled();
    });

    it("error message names the view to query and the field to filter on", async () => {
      const client = makeCogniteClientMock();
      const core = new CogniteCoreClient(client);

      await expect(
        core.query("CogniteAsset")({ select: { timeSeries: { name: true } } as never }),
      ).rejects.toThrow(/CogniteTimeSeries.*assets/);
    });

    it("querying CogniteTimeSeries filtered by assets is the correct alternative", async () => {
      const client = makeCogniteClientMock({ queryItems: { CogniteTimeSeries: [] } });
      const core = new CogniteCoreClient(client);

      const { items } = await core.query("CogniteTimeSeries")({
        filters: { assets: { containsAny: [{ space: "my-space", externalId: "my-asset" }] } },
        select: { name: true, type: true },
      });

      expect(client.instances.query).toHaveBeenCalled();
      expect(items).toEqual([]);
    });

    it("children on CogniteAsset is still allowed (single-target inward)", async () => {
      const client = makeCogniteClientMock({
        queryItems: makeCogniteAssetWithChildrenQueryResult(),
      });
      const core = new CogniteCoreClient(client);

      const { items } = await core.query("CogniteAsset")({
        select: { children: { name: true } },
      });

      expect(client.instances.query).toHaveBeenCalled();
      expect(items[0]?.children).toBeDefined();
    });
  });

  it("aggregates Cognite Core views without requiring a viewExternalId option", async () => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCogniteAssetAggregateByNameResponse(),
    });
    const core = new CogniteCoreClient(client);

    const { items } = await core.aggregate("CogniteAsset")({
      groupBy: { name: true },
      aggregate: { count: {} },
      filters: { name: { prefix: "Root" } },
    });

    expect(client.instances.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        view: {
          type: "view",
          space: "cdf_cdm",
          externalId: "CogniteAsset",
          version: "v1",
        },
        instanceType: "node",
        limit: 1000,
        groupBy: ["name"],
        aggregates: [{ count: {} }],
      }),
    );
    expect(items).toEqual([
      { group: { name: "Root Asset" }, aggregate: { value: 3 } },
      { group: { name: "Parent Asset" }, aggregate: { value: 1 } },
    ]);
  });
});
