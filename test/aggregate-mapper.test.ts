import { describe, expect, it, vi } from "vitest";
import { AggregateMapper } from "../src/mappers/aggregate-mapper";
import type { AggregateDefinition } from "../src/types.js";
import {
  COGNITE_CORE_DATA_MODEL,
  createAggregateMapper,
  createViewMapper,
  makeCogniteMock,
} from "./fixtures/index.js";

type PointCloudVolume = {
  name: string;
  volume: number;
  volumeType: string;
};

describe("AggregateMapper", () => {
  const mapper = createAggregateMapper();

  it("maps groupBy object and count aggregate to Cognite request", async () => {
    const request = await mapper.map<{ name: string; sourceId: string }>({
      viewExternalId: "CogniteAsset",
      groupBy: { name: true, sourceId: true },
      aggregate: { count: {} },
      filters: { name: { eq: "Pump" } },
    });

    expect(request).toMatchObject({
      instanceType: "node",
      limit: 1000,
      groupBy: ["name", "sourceId"],
      aggregates: [{ count: {} }],
      view: {
        type: "view",
        space: COGNITE_CORE_DATA_MODEL.space,
        externalId: "CogniteAsset",
        version: "v1",
      },
    });
    expect(request.filter).toBeDefined();
  });

  it("omits filter when no filters are provided", async () => {
    const request = await mapper.map({
      viewExternalId: "CogniteAsset",
      aggregate: { count: {} },
    });

    expect(request.filter).toBeUndefined();
  });

  it("uses search filters when building aggregate requests", async () => {
    const cognite = makeCogniteMock();
    cognite.searchInstances = vi.fn().mockResolvedValue({
      items: [{ instanceType: "node", space: "asset-space", externalId: "asset-1" }],
    });
    const searchMapper = new AggregateMapper(createViewMapper(), cognite);

    const request = await searchMapper.map<{ name: string }>({
      viewExternalId: "CogniteAsset",
      aggregate: { count: {} },
      filters: { name: { search: { query: "pump" } } },
    });

    expect(cognite.searchInstances).toHaveBeenCalledWith(
      expect.objectContaining({ query: "pump", properties: ["name"], operator: "OR" }),
    );
    expect(request.filter).toEqual({
      instanceReferences: [{ space: "asset-space", externalId: "asset-1" }],
    });
  });

  it("combines search filters with normal aggregate filters", async () => {
    const cognite = makeCogniteMock();
    cognite.searchInstances = vi.fn().mockResolvedValue({
      items: [{ instanceType: "node", space: "asset-space", externalId: "asset-1" }],
    });
    const searchMapper = new AggregateMapper(createViewMapper(), cognite);

    const request = await searchMapper.map<{ name: string; sourceId: string }>({
      viewExternalId: "CogniteAsset",
      aggregate: { count: {} },
      filters: {
        name: { search: { query: "pump" } },
        sourceId: { eq: "sap" },
      },
    });

    expect(request.filter).toEqual({
      and: [
        { equals: { property: ["cdf_cdm", "CogniteAsset/v1", "sourceId"], value: "sap" } },
        { instanceReferences: [{ space: "asset-space", externalId: "asset-1" }] },
      ],
    });
  });

  it.each([
    ["avg", { avg: "volume" }, { avg: { property: "volume" } }],
    ["min", { min: "volume" }, { min: { property: "volume" } }],
    ["max", { max: "volume" }, { max: { property: "volume" } }],
    ["sum", { sum: "volume" }, { sum: { property: "volume" } }],
  ] as const)("maps %s on a numeric property", async (_label, aggregate, expectedAggregate) => {
    const request = await mapper.map<PointCloudVolume>({
      viewExternalId: "CognitePointCloudVolume",
      aggregate: aggregate as AggregateDefinition<PointCloudVolume>,
    });

    expect(request).toMatchObject({
      instanceType: "node",
      limit: 1000,
      aggregates: [expectedAggregate],
      view: expect.objectContaining({ externalId: "CognitePointCloudVolume" }),
    });
    expect(request.groupBy).toBeUndefined();
  });

  it("maps count with an empty object as row count", async () => {
    const request = await mapper.map({
      viewExternalId: "CogniteAsset",
      aggregate: { count: {} },
    });

    expect(request.aggregates).toEqual([{ count: {} }]);
  });

  it("maps count on a groupable property", async () => {
    const request = await mapper.map<{ name: string }>({
      viewExternalId: "CogniteAsset",
      aggregate: { count: "name" },
    });

    expect(request.aggregates).toEqual([{ count: { property: "name" } }]);
  });

  it("maps count on node metadata properties", async () => {
    const request = await mapper.map({
      viewExternalId: "CogniteAsset",
      aggregate: { count: "externalId" },
    });

    expect(request.aggregates).toEqual([{ count: { property: "externalId" } }]);
  });

  it("maps groupBy-only request without aggregates", async () => {
    const request = await mapper.map<{ name: string; sourceId: string }>({
      viewExternalId: "CogniteAsset",
      groupBy: { sourceId: true },
    });

    expect(request.groupBy).toEqual(["sourceId"]);
    expect(request.aggregates).toBeUndefined();
  });

  it("rejects non-numeric properties for avg", async () => {
    await expect(
      mapper.map({
        viewExternalId: "CogniteAsset",
        aggregate: { avg: "name" },
      }),
    ).rejects.toThrow(/numeric view property/);
  });

  it("rejects list properties in groupBy", async () => {
    await expect(
      mapper.map({
        viewExternalId: "CogniteAsset",
        groupBy: { tags: true },
      }),
    ).rejects.toThrow(/Invalid aggregate options/);
  });

  it("rejects invalid search filters in aggregate requests", async () => {
    await expect(
      mapper.map<{ name: string }>({
        viewExternalId: "CogniteAsset",
        aggregate: { count: {} },
        filters: { name: { search: { query: "pump", operator: "NEAR" } } } as never,
      }),
    ).rejects.toThrow(/filters\.name\.search\.operator/);
  });

  it("rejects more than five groupBy properties", async () => {
    await expect(
      mapper.map({
        viewExternalId: "CogniteAsset",
        groupBy: {
          name: true,
          description: true,
          sourceId: true,
          sourceContext: true,
          parent: true,
          type: true,
        },
      }),
    ).rejects.toThrow(/at most 5 properties/);
  });

  it("rejects when neither groupBy nor aggregate is provided", async () => {
    await expect(
      mapper.map({
        viewExternalId: "CogniteAsset",
      }),
    ).rejects.toThrow(/either groupBy or aggregate must be provided/);
  });
});
