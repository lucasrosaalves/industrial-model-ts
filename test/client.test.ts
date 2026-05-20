import { describe, expect, it, vi } from "vitest";
import { type IndustrialModel, IndustrialModelClient, type NodeId } from "../src/index.js";
import type { AggregateDefinition } from "../src/types.js";
import {
  COGNITE_CORE_DATA_MODEL,
  makeCogniteAssetAggregateByNameResponse,
  makeCogniteAssetCountByNameResponse,
  makeCogniteAssetDistinctSourceIdsResponse,
  makeCogniteAssetGlobalCountResponse,
  makeCogniteAssetQueryResult,
  makeCogniteAssetQueryResultWithProperties,
  makeCogniteClientMock,
  makeCogniteVolumeAggregateByTypeResponse,
  makeCogniteVolumeGroupByObject3DResponse,
  makeCogniteVolumeNumericAggregateResponse,
} from "./fixtures/index.js";

describe("IndustrialModelClient", () => {
  it("is exported", () => {
    expect(IndustrialModelClient).toBeDefined();
  });

  it("runs query end-to-end with mocked CogniteClient (no API calls)", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetQueryResult(),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type ParentAsset = IndustrialModel<{ name: string }>;
    type Asset = IndustrialModel<{ name: string; parent?: NodeId }, { parent?: ParentAsset }>;
    const { items, cursor } = await model.query<Asset>()({
      viewExternalId: "CogniteAsset",
      select: {
        name: true,
        parent: { name: true },
      },
      filters: { name: { eq: "Root Asset" } },
      limit: 10,
    });

    expect(client.dataModels.retrieve).toHaveBeenCalledOnce();
    expect(client.instances.query).toHaveBeenCalledOnce();
    expect(cursor).toBeNull();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: "root-asset",
      name: "Root Asset",
      parent: { externalId: "parent-asset", name: "Parent Asset" },
    });
  });

  it("runs query with text search filters through the Cognite search API", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetQueryResult(),
      searchResponse: {
        items: [{ instanceType: "node", space: "asset-space", externalId: "root-asset" }],
      },
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type Asset = IndustrialModel<{ name: string }>;
    const { items } = await model.query<Asset>()({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      filters: { name: { search: { query: "root asset", operator: "AND" } } },
    });

    const search = (client.instances as unknown as { search: unknown }).search;
    expect(search).toHaveBeenCalledWith({
      view: { type: "view", space: "cdf_cdm", externalId: "CogniteAsset", version: "v1" },
      query: "root asset",
      instanceType: "node",
      properties: ["name"],
      operator: "AND",
      limit: 1_000,
    });
    expect(client.instances.query).toHaveBeenCalledWith(
      expect.objectContaining({
        with: expect.objectContaining({
          CogniteAsset: expect.objectContaining({
            nodes: {
              filter: {
                and: expect.arrayContaining([
                  { instanceReferences: [{ space: "asset-space", externalId: "root-asset" }] },
                ]),
              },
            },
          }),
        }),
      }),
    );
    expect(items).toHaveLength(1);
  });

  it("preserves Cognite timestamp strings when result validation is disabled", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetQueryResultWithProperties({
        sourceCreatedTime: "2024-01-02T03:04:05.000Z",
      }),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type Asset = IndustrialModel<{ name: string; sourceCreatedTime: string }>;
    const { items } = await model.query<Asset>()({
      viewExternalId: "CogniteAsset",
      select: { name: true, sourceCreatedTime: true },
    });

    expect(items[0]?.sourceCreatedTime).toBe("2024-01-02T03:04:05.000Z");
  });

  it("validates results and converts Cognite timestamps to Date when enabled", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetQueryResultWithProperties({
        sourceCreatedTime: "2024-01-02T03:04:05.000Z",
      }),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL, {
      validateResults: true,
    });

    type Asset = IndustrialModel<{ name: string; sourceCreatedTime: Date }>;
    const { items } = await model.query<Asset>()({
      viewExternalId: "CogniteAsset",
      select: { name: true, sourceCreatedTime: true },
    });

    expect(items[0]?.sourceCreatedTime).toBeInstanceOf(Date);
    expect(items[0]?.sourceCreatedTime.toISOString()).toBe("2024-01-02T03:04:05.000Z");
  });

  it("preserves selected nested direct-relation properties when validating results", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetQueryResult(),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL, {
      validateResults: true,
    });

    type ParentAsset = IndustrialModel<{ description: string }>;
    type Asset = IndustrialModel<
      { description?: string; parent?: NodeId },
      { parent?: ParentAsset }
    >;
    const { items } = await model.query<Asset>()({
      viewExternalId: "CogniteAsset",
      select: { description: true, parent: { description: true } },
    });

    expect(items[0]).toMatchObject({
      parent: {
        externalId: "parent-asset",
        description: "Parent Description",
      },
    });
  });

  it("validates only selected result properties when enabled", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetQueryResultWithProperties({
        sourceCreatedTime: "not-a-date",
      }),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL, {
      validateResults: true,
    });

    type Asset = IndustrialModel<{ name: string; sourceCreatedTime: Date }>;
    const { items } = await model.query<Asset>()({
      viewExternalId: "CogniteAsset",
      select: { name: true },
    });

    expect(items[0]).toMatchObject({ name: "Root Asset" });
    expect(items[0]).not.toHaveProperty("sourceCreatedTime");
  });

  it("runs upsert end-to-end with mocked CogniteClient", async () => {
    const client = makeCogniteClientMock({
      applyResponse: {
        items: [
          {
            instanceType: "node",
            space: "asset-space",
            externalId: "pump-1",
            version: 1,
            wasModified: true,
          },
        ],
      },
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type Asset = IndustrialModel<{ name?: string; parent?: NodeId }>;
    const result = await model.upsert<Asset>()({
      viewExternalId: "CogniteAsset",
      items: [
        {
          space: "asset-space",
          externalId: "pump-1",
          name: "Pump 1",
          parent: { space: "asset-space", externalId: "root" },
        },
      ],
    });

    const apply = (client.instances as unknown as { apply: ReturnType<typeof vi.fn> }).apply;
    expect(apply).toHaveBeenCalledWith({
      items: [
        {
          instanceType: "node",
          space: "asset-space",
          externalId: "pump-1",
          sources: [
            {
              source: {
                type: "view",
                space: "cdf_cdm",
                externalId: "CogniteAsset",
                version: "v1",
              },
              properties: {
                name: "Pump 1",
                parent: { space: "asset-space", externalId: "root" },
              },
            },
          ],
        },
      ],
    });
    expect(result.items).toEqual([
      {
        instanceType: "node",
        space: "asset-space",
        externalId: "pump-1",
        version: 1,
        wasModified: true,
      },
    ]);
  });

  it("splits root upserts above Cognite's single-request item limit", async () => {
    const client = makeCogniteClientMock({
      applyResponse: { items: [] },
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);
    const items = Array.from({ length: 1001 }, (_, index) => ({
      space: "asset-space",
      externalId: `pump-${index}`,
      name: `Pump ${index}`,
    }));

    type Asset = IndustrialModel<{ name?: string }>;
    await model.upsert<Asset>()({
      viewExternalId: "CogniteAsset",
      items,
    });

    const apply = (client.instances as unknown as { apply: ReturnType<typeof vi.fn> }).apply;
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[0]?.[0].items).toHaveLength(1000);
    expect(apply.mock.calls[1]?.[0].items).toHaveLength(1);
  });

  it("splits edge writes above Cognite's single-request item limit", async () => {
    const client = makeCogniteClientMock({
      applyResponse: { items: [] },
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);
    const images360 = Array.from({ length: 1001 }, (_, index) => ({
      space: "image-space",
      externalId: `image-${index}`,
    }));

    type Object3D = IndustrialModel<{ name?: string }, { images360?: NodeId[] }>;
    await model.upsert<Object3D>()({
      viewExternalId: "Cognite3DObject",
      items: [
        {
          space: "object-space",
          externalId: "object-1",
          images360,
        },
      ],
      onEdgeCreation: {
        images360: ({ startNode, endNode, edgeType }) => ({
          space: startNode.space,
          externalId: `${startNode.externalId}-${edgeType.externalId}-${endNode.externalId}`,
        }),
      },
    });

    const apply = (client.instances as unknown as { apply: ReturnType<typeof vi.fn> }).apply;
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[0]?.[0].items).toHaveLength(1000);
    expect(apply.mock.calls[1]?.[0].items).toHaveLength(2);
  });

  it("splits large edge replacement upserts into multiple Cognite apply calls", async () => {
    const existingEdges = Array.from({ length: 1000 }, (_, index) => ({
      instanceType: "edge" as const,
      space: "object-space",
      externalId: `old-edge-${index}`,
      startNode: { space: "object-space", externalId: "object-1" },
      endNode: { space: "image-space", externalId: `old-image-${index}` },
    }));
    const client = makeCogniteClientMock({
      queryItems: { images360Edges: existingEdges },
      applyResponse: { items: [] },
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type Object3D = IndustrialModel<{ name?: string }, { images360?: NodeId[] }>;
    await model.upsert<Object3D>()({
      viewExternalId: "Cognite3DObject",
      edgeMode: "replace",
      items: [
        {
          space: "object-space",
          externalId: "object-1",
          images360: [],
        },
      ],
    });

    const apply = (client.instances as unknown as { apply: ReturnType<typeof vi.fn> }).apply;
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      items: [],
      delete: expect.arrayContaining([
        { instanceType: "edge", space: "object-space", externalId: "old-edge-0" },
      ]),
    });
    expect(apply.mock.calls[0]?.[0].delete).toHaveLength(1000);
    expect(apply.mock.calls[1]?.[0]).toEqual({
      items: [{ instanceType: "node", space: "object-space", externalId: "object-1" }],
    });
  });

  it("deletes nodes end-to-end with mocked CogniteClient", async () => {
    const client = makeCogniteClientMock({
      applyResponse: {
        items: [
          {
            instanceType: "node",
            space: "asset-space",
            externalId: "pump-1",
            version: 2,
            wasModified: true,
          },
        ],
      },
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    const result = await model.delete([
      { space: "asset-space", externalId: "pump-1", name: "Pump 1" },
    ]);

    const apply = (client.instances as unknown as { apply: ReturnType<typeof vi.fn> }).apply;
    expect(apply).toHaveBeenCalledWith({
      items: [],
      delete: [{ instanceType: "node", space: "asset-space", externalId: "pump-1" }],
    });
    expect(result.items).toEqual([
      {
        instanceType: "node",
        space: "asset-space",
        externalId: "pump-1",
        version: 2,
        wasModified: true,
      },
    ]);
  });

  it("splits delete requests above Cognite's single-request item limit", async () => {
    const client = makeCogniteClientMock();
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);
    const items = Array.from({ length: 1001 }, (_, index) => ({
      space: "asset-space",
      externalId: `pump-${index}`,
    }));

    await model.delete(items);

    const apply = (client.instances as unknown as { apply: ReturnType<typeof vi.fn> }).apply;
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[0]?.[0].delete).toHaveLength(1000);
    expect(apply.mock.calls[1]?.[0].delete).toHaveLength(1);
  });

  it("rejects malformed delete node identities before calling Cognite", async () => {
    const client = makeCogniteClientMock();
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    await expect(model.delete([{ space: "asset-space" } as never])).rejects.toThrow(
      /expected NodeId values/,
    );

    const apply = (client.instances as unknown as { apply: ReturnType<typeof vi.fn> }).apply;
    expect(apply).not.toHaveBeenCalled();
  });

  it("runs aggregate end-to-end with grouped count", async () => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCogniteAssetAggregateByNameResponse(),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type Asset = IndustrialModel<{ name: string }>;
    const { items } = await model.aggregate<Asset>()({
      viewExternalId: "CogniteAsset",
      groupBy: { name: true },
      aggregate: { count: {} },
      filters: { name: { prefix: "Root" } },
    });

    expect(client.dataModels.retrieve).toHaveBeenCalledOnce();
    expect(client.instances.aggregate).toHaveBeenCalledOnce();
    expect(client.instances.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceType: "node",
        limit: 1000,
        groupBy: ["name"],
        aggregates: [{ count: {} }],
      }),
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      group: { name: "Root Asset" },
      aggregate: { value: 3 },
    });
  });

  it("runs aggregate with text search filters through the Cognite search API", async () => {
    const client = makeCogniteClientMock({
      searchResponse: {
        items: [{ instanceType: "node", space: "asset-space", externalId: "root-asset" }],
      },
      aggregateResponse: makeCogniteAssetGlobalCountResponse(),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type Asset = IndustrialModel<{ name: string }>;
    const { items } = await model.aggregate<Asset>()({
      viewExternalId: "CogniteAsset",
      aggregate: { count: {} },
      filters: { name: { search: { query: "root asset" } } },
    });

    const search = (client.instances as unknown as { search: unknown }).search;
    expect(search).toHaveBeenCalledWith({
      view: { type: "view", space: "cdf_cdm", externalId: "CogniteAsset", version: "v1" },
      query: "root asset",
      instanceType: "node",
      properties: ["name"],
      operator: "OR",
      limit: 1_000,
    });
    expect(client.instances.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          instanceReferences: [{ space: "asset-space", externalId: "root-asset" }],
        },
      }),
    );
    expect(items[0]?.aggregate?.value).toBe(42);
  });

  it("runs aggregate with a global count", async () => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCogniteAssetGlobalCountResponse(),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type Asset = IndustrialModel<{ name: string }>;
    const { items } = await model.aggregate<Asset>()({
      viewExternalId: "CogniteAsset",
      aggregate: { count: {} },
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.aggregate?.value).toBe(42);
    expect(items[0]).not.toHaveProperty("group");
  });

  it("runs aggregate with distinct values (groupBy only)", async () => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCogniteAssetDistinctSourceIdsResponse(),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type Asset = IndustrialModel<{ sourceId: string }>;
    const { items } = await model.aggregate<Asset>()({
      viewExternalId: "CogniteAsset",
      groupBy: { sourceId: true },
    });

    const aggregateRequest = vi.mocked(client.instances.aggregate).mock.calls[0]?.[0];
    expect(aggregateRequest).toMatchObject({ groupBy: ["sourceId"] });
    expect(aggregateRequest).not.toHaveProperty("aggregates");
    expect(items).toHaveLength(2);
    expect(items[0]?.group?.sourceId).toBe("sap-001");
    expect(items[0]).not.toHaveProperty("aggregate");
  });

  it("runs aggregate with avg grouped by volumeType", async () => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCogniteVolumeAggregateByTypeResponse(),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type Volume = IndustrialModel<{ volume: number; volumeType: string }>;
    const { items } = await model.aggregate<Volume>()({
      viewExternalId: "CognitePointCloudVolume",
      groupBy: { volumeType: true },
      aggregate: { avg: "volume" },
    });

    expect(client.instances.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregates: [{ avg: { property: "volume" } }],
        groupBy: ["volumeType"],
      }),
    );
    expect(items[0]).toMatchObject({
      group: { volumeType: "Cylinder" },
      aggregate: { property: "volume", value: 12.5 },
    });
  });

  it.each([
    ["min", 1.5],
    ["max", 99],
    ["sum", 250],
  ] as const)("runs aggregate with %s on a numeric property", async (op, value) => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCogniteVolumeNumericAggregateResponse(op, value),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type Volume = IndustrialModel<{ volume: number }>;
    const aggregate: AggregateDefinition<Volume> =
      op === "min" ? { min: "volume" } : op === "max" ? { max: "volume" } : { sum: "volume" };
    const { items } = await model.aggregate<Volume>()({
      viewExternalId: "CognitePointCloudVolume",
      aggregate,
    });

    expect(client.instances.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregates: [{ [op]: { property: "volume" } }],
      }),
    );
    expect(items[0]?.aggregate).toEqual({ property: "volume", value });
  });

  it("runs aggregate with count on a property", async () => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCogniteAssetCountByNameResponse(),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type Asset = IndustrialModel<{ name: string }>;
    const { items } = await model.aggregate<Asset>()({
      viewExternalId: "CogniteAsset",
      aggregate: { count: "name" },
    });

    expect(client.instances.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregates: [{ count: { property: "name" } }],
      }),
    );
    expect(items[0]?.aggregate).toEqual({ property: "name", value: 15 });
  });

  it("maps direct-relation values in groupBy results", async () => {
    const client = makeCogniteClientMock({
      aggregateResponse: makeCogniteVolumeGroupByObject3DResponse(),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type Volume = IndustrialModel<{ volume: number; object3D?: NodeId }>;
    const { items } = await model.aggregate<Volume>()({
      viewExternalId: "CognitePointCloudVolume",
      groupBy: { object3D: true },
      aggregate: { sum: "volume" },
    });

    expect(items[0]?.group?.object3D).toEqual({
      space: "cdf_3d_models",
      externalId: "model-1",
    });
    expect(items[0]?.aggregate?.value).toBe(100);
  });

  it("throws when aggregate options are invalid", async () => {
    const client = makeCogniteClientMock();
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    type Asset = IndustrialModel<{ name: string }>;
    await expect(
      model.aggregate<Asset>()({
        viewExternalId: "CogniteAsset",
      }),
    ).rejects.toThrow(/Invalid aggregate options/);
  });

  it("throws when result validation finds an invalid Cognite timestamp", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetQueryResultWithProperties({
        sourceCreatedTime: "not-a-date",
      }),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL, {
      validateResults: true,
    });

    type Asset = IndustrialModel<{ name: string; sourceCreatedTime: Date }>;
    await expect(
      model.query<Asset>()({
        viewExternalId: "CogniteAsset",
        select: { name: true, sourceCreatedTime: true },
      }),
    ).rejects.toThrow(/Invalid query result/);
  });
});
