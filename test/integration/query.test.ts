import { describe, expect, it } from "vitest";
import {
  createIntegrationCoreClient,
  hasIntegrationCredentials,
  listInstanceSpaces,
} from "./setup.js";

const describeIntegration = describe.skipIf(!hasIntegrationCredentials());

describeIntegration("integration query", () => {
  const core = () => createIntegrationCoreClient();

  it("queries CogniteDescribable views", async () => {
    const queries = [
      core().query("CogniteDescribable")({ limit: 10 }),
      core().query("CogniteDescribable")({
        filters: { name: { eq: "test" } },
        limit: 10,
      }),
    ];

    for (const query of queries) {
      const result = await query;
      expect(Array.isArray(result.items)).toBe(true);
      expect(result).toHaveProperty("cursor");
    }
  });

  it("queries Cognite360ImageAnnotation edge views", async () => {
    const result = await core().query("Cognite360ImageAnnotation")({
      select: { confidence: true, polygon: true },
      limit: 10,
    });

    expect(Array.isArray(result.items)).toBe(true);
    for (const item of result.items) {
      expect(item.startNode).toEqual(
        expect.objectContaining({ space: expect.any(String), externalId: expect.any(String) }),
      );
      expect(item.endNode).toEqual(
        expect.objectContaining({ space: expect.any(String), externalId: expect.any(String) }),
      );
    }
  });

  it("queries CogniteAssetType with filters and sort", async () => {
    const result = await core().query("CogniteAssetType")({
      filters: { code: { eq: "TESTING_123" } },
      sort: { code: "ascending" },
      limit: 10,
    });

    expect(Array.isArray(result.items)).toBe(true);
  });

  it("queries CogniteEquipment with relation existence filters", async () => {
    const queries = [
      core().query("CogniteEquipment")({
        filters: { asset: { exists: true } },
        limit: 10,
      }),
      core().query("CogniteEquipment")({
        filters: {
          AND: [{ asset: { exists: true } }, { externalId: { in: ["123"] } } as never],
        },
        limit: 10,
      }),
    ];

    for (const query of queries) {
      const result = await query;
      expect(Array.isArray(result.items)).toBe(true);
    }
  });

  it("queries CogniteAsset with nested and list filters", async () => {
    const spaces = await listInstanceSpaces();

    const queries = [
      core().query("CogniteAsset")({
        filters: {
          AND: [
            { space: { in: spaces } } as never,
            { parent: { externalId: { eq: "PARENT-123" } } as never },
          ],
        },
        limit: 1,
      }),
      core().query("CogniteAsset")({
        filters: {
          AND: [
            { space: { in: spaces } } as never,
            {
              path: {
                containsAny: [{ externalId: "CHILD-456", space: "cdf_cdm" }],
              },
            },
          ],
        },
        limit: 1,
      }),
    ];

    for (const query of queries) {
      const result = await query;
      expect(Array.isArray(result.items)).toBe(true);
    }
  });
});
