import { describe, expect, it } from "vitest";
import type { InstancesAggregateResponse } from "../src/cognite";
import { AggregateResultMapper } from "../src/mappers/aggregate-result-mapper.js";
import type { NodeId } from "../src/types.js";

describe("AggregateResultMapper", () => {
  const mapper = new AggregateResultMapper();

  it("maps grouped count without property on aggregate", () => {
    const response: InstancesAggregateResponse = {
      items: [
        {
          instanceType: "node",
          group: { name: "Pump A" },
          aggregates: [{ aggregate: "count", value: 5 }],
        },
      ],
    };

    const items = mapper.map(response, {
      groupBy: { name: true },
      aggregates: [{ count: {} }],
    });

    expect(items[0]).toEqual({
      group: { name: "Pump A" },
      aggregates: [{ aggregate: "count", value: 5 }],
      aggregate: { aggregate: "count", value: 5 },
    });
  });

  it("maps numeric aggregate with property", () => {
    const response: InstancesAggregateResponse = {
      items: [
        {
          instanceType: "node",
          group: { volumeType: "Cylinder" },
          aggregates: [{ aggregate: "avg", property: "volume", value: 12.5 }],
        },
      ],
    };

    const items = mapper.map<{ volume: number; volumeType: string }>(response, {
      groupBy: { volumeType: true },
      aggregates: [{ avg: "volume" }],
    });

    expect(items[0]).toEqual({
      group: { volumeType: "Cylinder" },
      aggregates: [{ aggregate: "avg", property: "volume", value: 12.5 }],
      aggregate: { aggregate: "avg", property: "volume", value: 12.5 },
    });
  });

  it("maps multiple aggregate values from Cognite response", () => {
    const response: InstancesAggregateResponse = {
      items: [
        {
          instanceType: "node",
          group: {
            assets: { space: "asset-space", externalId: "asset-1" },
          },
          aggregates: [
            { aggregate: "count", property: "externalId", value: 3 },
            { aggregate: "sum", property: "duration", value: 120 },
          ],
        },
      ],
    };

    const items = mapper.map(response, {
      groupBy: { assets: true },
      aggregates: [{ count: "externalId" }, { sum: "duration" }],
    } as never);

    expect(items[0]).toEqual({
      group: { assets: { space: "asset-space", externalId: "asset-1" } },
      aggregates: [
        { aggregate: "count", property: "externalId", value: 3 },
        { aggregate: "sum", property: "duration", value: 120 },
      ],
      aggregate: { aggregate: "count", property: "externalId", value: 3 },
    });
  });

  it("maps exploded list primitive group values", () => {
    const response: InstancesAggregateResponse = {
      items: [
        {
          instanceType: "node",
          group: { tags: "downtime" },
          aggregates: [{ aggregate: "count", value: 4 }],
        },
      ],
    };

    const items = mapper.map<{ tags: string[] }>(response, {
      groupBy: { tags: true },
      aggregates: [{ count: {} }],
    });

    expect(items[0]?.group).toEqual({ tags: "downtime" });
    expect(items[0]?.aggregates).toEqual([{ aggregate: "count", value: 4 }]);
    expect(items[0]?.aggregate).toEqual({ aggregate: "count", value: 4 });
  });

  it("coerces direct-relation group values to NodeId", () => {
    const response: InstancesAggregateResponse = {
      items: [
        {
          instanceType: "node",
          group: {
            object3D: { space: "cdf_3d", externalId: "obj-1" },
          },
          aggregates: [{ aggregate: "sum", property: "volume", value: 100 }],
        },
      ],
    };

    const items = mapper.map<{ object3D: NodeId; volume: number }>(response, {
      groupBy: { object3D: true },
      aggregates: [{ sum: "volume" }],
    });

    expect(items[0]?.group?.object3D).toEqual({
      space: "cdf_3d",
      externalId: "obj-1",
    });
    expect(items[0]?.aggregates).toEqual([{ aggregate: "sum", property: "volume", value: 100 }]);
    expect(items[0]?.aggregate).toEqual({ aggregate: "sum", property: "volume", value: 100 });
  });

  it("omits group when all grouped values are undefined", () => {
    const response: InstancesAggregateResponse = {
      items: [
        {
          instanceType: "node",
          group: {
            // @ts-expect-error API may return undefined for missing group values at runtime
            sourceId: undefined,
          },
          aggregates: [{ aggregate: "count", value: 1 }],
        },
      ],
    };

    const items = mapper.map(response, {
      groupBy: { sourceId: true },
      aggregates: [{ count: {} }],
    });

    expect(items[0]).toEqual({
      aggregates: [{ aggregate: "count", value: 1 }],
      aggregate: { aggregate: "count", value: 1 },
    });
    expect(items[0]).not.toHaveProperty("group");
  });

  it("returns distinct-value rows without aggregate", () => {
    const response: InstancesAggregateResponse = {
      items: [
        { instanceType: "node", group: { sourceId: "a" }, aggregates: [] },
        { instanceType: "node", group: { sourceId: "b" }, aggregates: [] },
      ],
    };

    const items = mapper.map(response, {
      groupBy: { sourceId: true },
    });

    expect(items).toHaveLength(2);
    expect(items[0]?.group).toEqual({ sourceId: "a" });
    expect(items[0]).not.toHaveProperty("aggregates");
    expect(items[0]).not.toHaveProperty("aggregate");
  });

  it("keeps request-order slots when an earlier Cognite value is missing", () => {
    const response: InstancesAggregateResponse = {
      items: [
        {
          instanceType: "node",
          group: { volumeType: "Cylinder" },
          aggregates: [
            { aggregate: "count", property: "externalId" },
            { aggregate: "sum", property: "volume", value: 120 },
          ],
        },
      ],
    };

    const items = mapper.map(response, {
      groupBy: { volumeType: true },
      aggregates: [{ count: "externalId" }, { sum: "volume" }],
    } as never);

    expect(items[0]?.aggregates).toEqual([
      undefined,
      { aggregate: "sum", property: "volume", value: 120 },
    ]);
    expect(items[0]).not.toHaveProperty("aggregate");
  });
});
