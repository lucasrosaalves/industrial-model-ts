import { describe, expect, it } from "vitest";
import {
  createResultMapper,
  makeCogniteAssetQueryResult,
  makeCogniteAssetQueryResultWithProperties,
} from "./fixtures/index.js";

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

  it("maps root edges with properties from an edge view", async () => {
    const result = await mapper.mapNodes("Cognite360ImageAnnotation", {
      Cognite360ImageAnnotation: [
        {
          instanceType: "edge",
          space: "annotation-space",
          externalId: "annotation-1",
          startNode: { space: "object-space", externalId: "object-1" },
          endNode: { space: "image-space", externalId: "image-1" },
          properties: {
            cdf_cdm: {
              "Cognite360ImageAnnotation/v1": {
                confidence: 0.92,
                polygon: [0.1, 0.2, 0.3, 0.4],
              },
            },
          },
        },
      ],
    });

    expect(result).toEqual([
      {
        instanceType: "edge",
        space: "annotation-space",
        externalId: "annotation-1",
        startNode: { space: "object-space", externalId: "object-1" },
        endNode: { space: "image-space", externalId: "image-1" },
        confidence: 0.92,
        polygon: [0.1, 0.2, 0.3, 0.4],
      },
    ]);
  });

  it("coerces Cognite timestamp properties on edge views to Date", async () => {
    const result = await mapper.mapNodes("Cognite360ImageAnnotation", {
      Cognite360ImageAnnotation: [
        {
          instanceType: "edge",
          space: "annotation-space",
          externalId: "annotation-1",
          startNode: { space: "object-space", externalId: "object-1" },
          endNode: { space: "image-space", externalId: "image-1" },
          properties: {
            cdf_cdm: {
              "Cognite360ImageAnnotation/v1": {
                sourceCreatedTime: "2024-01-02T03:04:05.000Z",
                formatVersion: "1",
              },
            },
          },
        },
      ],
    });

    const item = result[0];
    expect(item).toBeDefined();
    expect(item?.sourceCreatedTime).toBeInstanceOf(Date);
    expect((item?.sourceCreatedTime as Date).toISOString()).toBe("2024-01-02T03:04:05.000Z");
    expect(item?.formatVersion).toBe("1");
  });

  it("coerces Cognite timestamp properties to Date", async () => {
    const result = await mapper.mapNodes(
      "CogniteAsset",
      makeCogniteAssetQueryResultWithProperties({
        sourceCreatedTime: "2024-01-02T03:04:05.000Z",
        pathLastUpdatedTime: "2024-06-01T12:00:00.000Z",
      }),
    );

    const item = result[0];
    expect(item).toBeDefined();
    if (item === undefined) {
      return;
    }
    expect(item.sourceCreatedTime).toBeInstanceOf(Date);
    expect((item.sourceCreatedTime as Date).toISOString()).toBe("2024-01-02T03:04:05.000Z");
    expect(item.pathLastUpdatedTime).toBeInstanceOf(Date);
    expect((item.pathLastUpdatedTime as Date).toISOString()).toBe("2024-06-01T12:00:00.000Z");
  });

  it("leaves invalid Cognite timestamp strings unchanged", async () => {
    const result = await mapper.mapNodes(
      "CogniteAsset",
      makeCogniteAssetQueryResultWithProperties({
        sourceCreatedTime: "not-a-date",
      }),
    );

    expect(result[0]?.sourceCreatedTime).toBe("not-a-date");
  });

  it("throws when the root key is missing from the query result", async () => {
    await expect(mapper.mapNodes("CogniteAsset", {})).rejects.toThrow(
      /not available in the query result/,
    );
  });
});
