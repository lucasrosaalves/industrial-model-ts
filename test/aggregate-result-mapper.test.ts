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
      aggregate: { count: {} },
    });

    expect(items[0]).toEqual({
      group: { name: "Pump A" },
      aggregate: { value: 5 },
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

    const items = mapper.map<{ volume: number; volumeType: string }, { volumeType: true }>(
      response,
      {
        groupBy: { volumeType: true },
        aggregate: { avg: "volume" },
      },
    );

    expect(items[0]).toEqual({
      group: { volumeType: "Cylinder" },
      aggregate: { property: "volume", value: 12.5 },
    });
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

    const items = mapper.map<{ object3D: NodeId; volume: number }, { object3D: true }>(response, {
      groupBy: { object3D: true },
      aggregate: { sum: "volume" },
    });

    expect(items[0]?.group?.object3D).toEqual({
      space: "cdf_3d",
      externalId: "obj-1",
    });
    expect(items[0]?.aggregate).toEqual({ property: "volume", value: 100 });
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
      aggregate: { count: {} },
    });

    expect(items[0]).toEqual({ aggregate: { value: 1 } });
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
    expect(items[0]).not.toHaveProperty("aggregate");
  });
});
