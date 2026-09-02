import { describe, expect, it, vi } from "vitest";
import { AggregateMapper } from "../src/mappers/aggregate-mapper";
import type { AggregateDefinition } from "../src/types.js";
import {
  COGNITE_CORE_DATA_MODEL,
  createAggregateMapper,
  createViewMapper,
  makeCogniteMock,
} from "./fixtures/index.js";

type Transform = {
  scaleX: number;
  translationX: number;
};

describe("AggregateMapper", () => {
  const mapper = createAggregateMapper();

  it("maps groupBy object and count aggregate to Cognite request", async () => {
    const request = await mapper.map<{ name: string; sourceId: string }>({
      viewExternalId: "CogniteAsset",
      groupBy: { name: true, sourceId: true },
      aggregates: [{ count: {} }],
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
      aggregates: [{ count: {} }],
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
      aggregates: [{ count: {} }],
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
      aggregates: [{ count: {} }],
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
    ["avg", { avg: "scaleX" }, { avg: { property: "scaleX" } }],
    ["min", { min: "scaleX" }, { min: { property: "scaleX" } }],
    ["max", { max: "scaleX" }, { max: { property: "scaleX" } }],
    ["sum", { sum: "scaleX" }, { sum: { property: "scaleX" } }],
  ] as const)("maps %s on a numeric property", async (_label, aggregate, expectedAggregate) => {
    const request = await mapper.map<Transform>({
      viewExternalId: "Cognite3DTransformation",
      aggregates: [aggregate as AggregateDefinition<Transform>],
    });

    expect(request).toMatchObject({
      instanceType: "node",
      limit: 1000,
      aggregates: [expectedAggregate],
      view: expect.objectContaining({ externalId: "Cognite3DTransformation" }),
    });
    expect(request.groupBy).toBeUndefined();
  });

  it("maps count with an empty object as row count", async () => {
    const request = await mapper.map({
      viewExternalId: "CogniteAsset",
      aggregates: [{ count: {} }],
    });

    expect(request.aggregates).toEqual([{ count: {} }]);
  });

  it("maps count on a groupable property", async () => {
    const request = await mapper.map<{ name: string }>({
      viewExternalId: "CogniteAsset",
      aggregates: [{ count: "name" }],
    });

    expect(request.aggregates).toEqual([{ count: { property: "name" } }]);
  });

  it("maps count on node metadata properties", async () => {
    const request = await mapper.map({
      viewExternalId: "CogniteAsset",
      aggregates: [{ count: "externalId" }],
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
        aggregates: [{ avg: "name" }],
      }),
    ).rejects.toThrow(/numeric view property/);
  });

  it("maps list primitive groupBy to Cognite property names", async () => {
    const request = await mapper.map<{ tags: string[] }>({
      viewExternalId: "CogniteAsset",
      groupBy: { tags: true },
      aggregates: [{ count: {} }],
    });

    expect(request.groupBy).toEqual(["tags"]);
    expect(request.aggregates).toEqual([{ count: {} }]);
  });

  it("maps list direct-relation groupBy to Cognite property names", async () => {
    const request = await mapper.map<{ assets: { space: string; externalId: string }[] }>({
      viewExternalId: "CogniteTimeSeries",
      groupBy: { assets: true },
      aggregates: [{ count: "externalId" }],
    });

    expect(request.groupBy).toEqual(["assets"]);
    expect(request.aggregates).toEqual([{ count: { property: "externalId" } }]);
  });

  it("maps multiple aggregates in request order", async () => {
    const request = await mapper.map<Transform>({
      viewExternalId: "Cognite3DTransformation",
      groupBy: { translationX: true },
      aggregates: [{ count: "externalId" }, { sum: "scaleX" }],
    });

    expect(request.groupBy).toEqual(["translationX"]);
    expect(request.aggregates).toEqual([
      { count: { property: "externalId" } },
      { sum: { property: "scaleX" } },
    ]);
  });

  it("maps a single aggregate object without wrapping it in an array", async () => {
    const request = await mapper.map({
      viewExternalId: "CogniteAsset",
      aggregates: { count: {} },
    });

    expect(request.aggregates).toEqual([{ count: {} }]);
  });

  it("maps the legacy aggregate option as a single op", async () => {
    const request = await mapper.map({
      viewExternalId: "CogniteAsset",
      aggregate: { count: {} },
    });

    expect(request.aggregates).toEqual([{ count: {} }]);
  });

  it("rejects setting both aggregate and aggregates", async () => {
    await expect(
      mapper.map({
        viewExternalId: "CogniteAsset",
        aggregate: { count: {} },
        aggregates: [{ count: {} }],
      }),
    ).rejects.toThrow(/cannot set both aggregate and aggregates/);
  });

  it("rejects empty aggregates array", async () => {
    await expect(
      mapper.map({
        viewExternalId: "CogniteAsset",
        aggregates: [],
      }),
    ).rejects.toThrow(/at least one aggregate definition/);
  });

  it("rejects more than five aggregate operations", async () => {
    await expect(
      mapper.map<Transform>({
        viewExternalId: "Cognite3DTransformation",
        aggregates: [
          { count: {} },
          { count: "externalId" },
          { avg: "scaleX" },
          { min: "scaleX" },
          { max: "scaleX" },
          { sum: "scaleX" },
        ],
      }),
    ).rejects.toThrow(/at most 5 operations/);
  });

  it("rejects numeric aggregates on list properties", async () => {
    await expect(
      mapper.map({
        viewExternalId: "CognitePointCloudVolume",
        aggregates: [{ avg: "volume" }],
      }),
    ).rejects.toThrow(/numeric view property/);
  });

  it("rejects count on a list property", async () => {
    await expect(
      mapper.map({
        viewExternalId: "CogniteAsset",
        aggregates: [{ count: "tags" }],
      } as never),
    ).rejects.toThrow(/cannot be counted/);
  });

  it("rejects invalid search filters in aggregate requests", async () => {
    await expect(
      mapper.map<{ name: string }>({
        viewExternalId: "CogniteAsset",
        aggregates: [{ count: {} }],
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
    ).rejects.toThrow(/either groupBy, aggregate, or aggregates must be provided/);
  });
});
