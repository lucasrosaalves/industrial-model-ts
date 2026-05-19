import { describe, expect, it } from "vitest";
import { type IndustrialModel, IndustrialModelClient, type NodeId } from "../src/index.js";
import {
  COGNITE_CORE_DATA_MODEL,
  makeCogniteAssetQueryResult,
  makeCogniteAssetQueryResultWithProperties,
  makeCogniteClientMock,
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
