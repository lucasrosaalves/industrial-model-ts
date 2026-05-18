import { describe, expect, it } from "vitest";
import { IndustrialModel } from "../src/index.js";
import {
  COGNITE_CORE_DATA_MODEL,
  makeCogniteAssetQueryResult,
  makeCogniteClientMock,
} from "./fixtures/index.js";

describe("IndustrialModel", () => {
  it("is exported", () => {
    expect(IndustrialModel).toBeDefined();
  });

  it("runs query end-to-end with mocked CogniteClient (no API calls)", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetQueryResult(),
    });
    const model = new IndustrialModel(client, COGNITE_CORE_DATA_MODEL);

    type Asset = { name: string; parent?: { name: string } };
    const { items, cursor } = await model.query<Asset>({
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
});
