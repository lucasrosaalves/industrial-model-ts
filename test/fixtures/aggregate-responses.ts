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
        group: { volumeType: "Cylinder" },
        aggregates: [{ aggregate: "avg", property: "volume", value: 12.5 }],
      },
      {
        instanceType: "node",
        group: { volumeType: "Box" },
        aggregates: [{ aggregate: "avg", property: "volume", value: 8 }],
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
        aggregates: [{ aggregate: op, property: "volume", value }],
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
        aggregates: [{ aggregate: "sum", property: "volume", value: 100 }],
      },
    ],
  };
}
