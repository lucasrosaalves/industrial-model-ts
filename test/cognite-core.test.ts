import { describe, expect, it } from "vitest";
import type { NodeDefinition } from "../src/cognite";
import { COGNITE_CORE_DATA_MODEL, CogniteCoreClient } from "../src/cognite-core/index.js";
import {
  makeCognite3DTransformationMultiAggregateResponse,
  makeCogniteAssetAggregateByNameResponse,
  makeCogniteAssetAggregateByTagResponse,
  makeCogniteAssetQueryResult,
  makeCogniteClientMock,
  makeCogniteTimeSeriesAggregateByAssetResponse,
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

  it("deletes Cognite Core nodes without requiring a view name", async () => {
    const client = makeCogniteClientMock({
      applyResponse: {
        items: [{ instanceType: "node", space: "asset-space", externalId: "pump-1" }],
      },
    });
    const core = new CogniteCoreClient(client);

    const result = await core.delete([{ space: "asset-space", externalId: "pump-1" }]);

    expect(client.instances.delete).toHaveBeenCalledWith([
      { instanceType: "node", space: "asset-space", externalId: "pump-1" },
    ]);
    expect(result.items).toEqual([
      { instanceType: "node", space: "asset-space", externalId: "pump-1" },
    ]);
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

  it("exposes a datapoints executor that delegates retrieve to the underlying Cognite client", async () => {
    const client = makeCogniteClientMock({
      datapointsRetrieveResponse: [
        {
          instanceId: { space: "ts-space", externalId: "temperature" },
          isString: false,
          datapoints: [{ timestamp: new Date("2024-06-01T00:00:00.000Z"), value: 21 }],
        },
      ],
    });
    const core = new CogniteCoreClient(client);

    const result = await core.datapoints.retrieve({
      timeSeries: [{ space: "ts-space", externalId: "temperature" }],
    });

    expect(client.datapoints.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ instanceId: { space: "ts-space", externalId: "temperature" } }],
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      timeSeries: { space: "ts-space", externalId: "temperature" },
      datapoints: [{ timestamp: new Date("2024-06-01T00:00:00.000Z"), value: 21 }],
    });
  });

  it("aggregates Cognite Core views without requiring a viewExternalId option", async () => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCogniteAssetAggregateByNameResponse(),
    });
    const core = new CogniteCoreClient(client);

    const { items } = await core.aggregate("CogniteAsset")({
      groupBy: { name: true },
      aggregates: [{ count: {} }],
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
      {
        group: { name: "Root Asset" },
        aggregates: [{ aggregate: "count", value: 3 }],
        aggregate: { aggregate: "count", value: 3 },
      },
      {
        group: { name: "Parent Asset" },
        aggregates: [{ aggregate: "count", value: 1 }],
        aggregate: { aggregate: "count", value: 1 },
      },
    ]);
  });

  it("groups CogniteAsset by tags with list-primitive explode", async () => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCogniteAssetAggregateByTagResponse(),
    });
    const core = new CogniteCoreClient(client);

    const { items } = await core.aggregate("CogniteAsset")({
      groupBy: { tags: true },
      aggregates: [{ count: {} }],
    });

    expect(client.instances.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        groupBy: ["tags"],
        aggregates: [{ count: {} }],
      }),
    );
    expect(items).toEqual([
      {
        group: { tags: "critical" },
        aggregates: [{ aggregate: "count", value: 4 }],
        aggregate: { aggregate: "count", value: 4 },
      },
    ]);
  });

  it("groups CogniteTimeSeries by assets with list-direct-relation explode", async () => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCogniteTimeSeriesAggregateByAssetResponse(),
    });
    const core = new CogniteCoreClient(client);

    const { items } = await core.aggregate("CogniteTimeSeries")({
      groupBy: { assets: true },
      aggregates: [{ count: {} }],
    });

    expect(client.instances.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        view: {
          type: "view",
          space: "cdf_cdm",
          externalId: "CogniteTimeSeries",
          version: "v1",
        },
        groupBy: ["assets"],
        aggregates: [{ count: {} }],
      }),
    );
    expect(items[0]?.group).toEqual({ assets: { space: "asset-space", externalId: "pump-1" } });
    expect(items[0]?.aggregates).toEqual([{ aggregate: "count", value: 7 }]);
  });

  it("runs multiple aggregates on Cognite3DTransformation", async () => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCognite3DTransformationMultiAggregateResponse(),
    });
    const core = new CogniteCoreClient(client);

    const { items } = await core.aggregate("Cognite3DTransformation")({
      aggregates: [{ count: {} }, { avg: "scaleX" }, { sum: "translationX" }],
    });

    expect(client.instances.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregates: [
          { count: {} },
          { avg: { property: "scaleX" } },
          { sum: { property: "translationX" } },
        ],
      }),
    );
    expect(items[0]?.aggregates).toEqual([
      { aggregate: "count", value: 10 },
      { aggregate: "avg", property: "scaleX", value: 1.5 },
      { aggregate: "sum", property: "translationX", value: 42 },
    ]);
    expect(items[0]?.aggregate).toEqual({ aggregate: "count", value: 10 });
  });

  it("accepts object-form aggregates on generated Core views", async () => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCogniteAssetAggregateByNameResponse(),
    });
    const core = new CogniteCoreClient(client);

    await core.aggregate("CogniteAsset")({
      groupBy: { name: true },
      aggregates: { count: {} },
    });

    expect(client.instances.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        groupBy: ["name"],
        aggregates: [{ count: {} }],
      }),
    );
  });

  it("accepts the legacy aggregate alias on generated Core views", async () => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCogniteAssetAggregateByNameResponse(),
    });
    const core = new CogniteCoreClient(client);

    await core.aggregate("CogniteAsset")({
      groupBy: { name: true },
      aggregate: { count: {} },
    });

    expect(client.instances.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregates: [{ count: {} }],
      }),
    );
  });

  it("upserts Cognite Core views without requiring a viewExternalId option", async () => {
    const client = makeCogniteClientMock({
      applyResponse: {
        items: [{ instanceType: "node", space: "asset-space", externalId: "pump-1" }],
      },
    });
    const core = new CogniteCoreClient(client);

    const result = await core.upsert("CogniteAsset")({
      items: [
        {
          space: "asset-space",
          externalId: "pump-1",
          name: "Pump 1",
        },
      ],
    });

    expect(client.instances.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            instanceType: "node",
            space: "asset-space",
            externalId: "pump-1",
          }),
        ],
      }),
    );
    expect(result.items).toEqual([
      { instanceType: "node", space: "asset-space", externalId: "pump-1" },
    ]);
  });
});
