import { describe, expect, it } from "vitest";
import { createResultMapper, makeCogniteAssetQueryResult } from "./fixtures/index.js";

describe("QueryResultMapper", () => {
  const mapper = createResultMapper();

  it("maps root nodes and nested direct relations from in-memory query data", async () => {
    const result = await mapper.mapNodes("CogniteAsset", makeCogniteAssetQueryResult());

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      instanceType: "node",
      space: "test-space",
      externalId: "root-asset",
      name: "Root Asset",
      parent: {
        instanceType: "node",
        space: "test-space",
        externalId: "parent-asset",
        name: "Parent Asset",
      },
    });
  });

  it("throws when the root key is missing from the query result", async () => {
    await expect(mapper.mapNodes("CogniteAsset", {})).rejects.toThrow(
      /not available in the query result/,
    );
  });
});
