import type { InstancesAggregateResponse } from "../../src/cognite";

export function makeCogniteAssetAggregateByNameResponse(): InstancesAggregateResponse {
  return {
    items: [
      {
        instanceType: "node",
        group: { name: "Root Asset" },
        aggregates: [{ aggregate: "count", value: 3 }],
      },
      {
        instanceType: "node",
        group: { name: "Parent Asset" },
        aggregates: [{ aggregate: "count", value: 1 }],
      },
    ],
  };
}

export function makeCogniteAssetGlobalCountResponse(): InstancesAggregateResponse {
  return {
    items: [
      {
        instanceType: "node",
        aggregates: [{ aggregate: "count", value: 42 }],
      },
    ],
  };
}

export function makeCogniteAssetDistinctSourceIdsResponse(): InstancesAggregateResponse {
  return {
    items: [
      { instanceType: "node", group: { sourceId: "sap-001" }, aggregates: [] },
      { instanceType: "node", group: { sourceId: "sap-002" }, aggregates: [] },
    ],
  };
}

export function makeCogniteVolumeAggregateByTypeResponse(): InstancesAggregateResponse {
  return {
    items: [
      {
        instanceType: "node",
        group: { translationX: 1 },
        aggregates: [{ aggregate: "avg", property: "scaleX", value: 12.5 }],
      },
      {
        instanceType: "node",
        group: { translationX: 2 },
        aggregates: [{ aggregate: "avg", property: "scaleX", value: 8 }],
      },
    ],
  };
}

export function makeCogniteVolumeNumericAggregateResponse(
  op: "min" | "max" | "sum",
  value: number,
): InstancesAggregateResponse {
  return {
    items: [
      {
        instanceType: "node",
        aggregates: [{ aggregate: op, property: "scaleX", value }],
      },
    ],
  };
}

export function makeCogniteAssetCountByNameResponse(): InstancesAggregateResponse {
  return {
    items: [
      {
        instanceType: "node",
        aggregates: [{ aggregate: "count", property: "name", value: 15 }],
      },
    ],
  };
}

export function makeCogniteVolumeGroupByObject3DResponse(): InstancesAggregateResponse {
  return {
    items: [
      {
        instanceType: "node",
        group: {
          object3D: { space: "cdf_3d_models", externalId: "model-1" },
        },
        aggregates: [{ aggregate: "count", value: 100 }],
      },
    ],
  };
}

export function makeCogniteAssetAggregateByTagResponse(): InstancesAggregateResponse {
  return {
    items: [
      {
        instanceType: "node",
        group: { tags: "critical" },
        aggregates: [{ aggregate: "count", value: 4 }],
      },
    ],
  };
}

export function makeCogniteTimeSeriesAggregateByAssetResponse(): InstancesAggregateResponse {
  return {
    items: [
      {
        instanceType: "node",
        group: { assets: { space: "asset-space", externalId: "pump-1" } },
        aggregates: [{ aggregate: "count", value: 7 }],
      },
    ],
  };
}

export function makeCognite3DTransformationMultiAggregateResponse(): InstancesAggregateResponse {
  return {
    items: [
      {
        instanceType: "node",
        aggregates: [
          { aggregate: "count", value: 10 },
          { aggregate: "avg", property: "scaleX", value: 1.5 },
          { aggregate: "sum", property: "translationX", value: 42 },
        ],
      },
    ],
  };
}
