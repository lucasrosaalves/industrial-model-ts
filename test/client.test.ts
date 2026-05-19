import { describe, expect, it, vi } from "vitest";
import {
  type AggregateDefinition,
  type IndustrialModel,
  IndustrialModelClient,
  type NodeId,
} from "../src/index.js";
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
