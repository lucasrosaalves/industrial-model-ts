import type { NodeDefinition } from "../../src/cognite";
import type { QueryResultMap } from "../../src/types";

const SPACE = "cdf_cdm";
const ASSET_VIEW_KEY = "CogniteAsset/v1";

export function makeCogniteAssetQueryResult(): QueryResultMap {
  const parentNode: NodeDefinition = {
    instanceType: "node",
    space: "test-space",
    externalId: "parent-asset",
    properties: {
      [SPACE]: {
        [ASSET_VIEW_KEY]: { name: "Parent Asset" },
      },
    },
  };

  const assetNode: NodeDefinition = {
    instanceType: "node",
    space: "test-space",
    externalId: "root-asset",
    properties: {
      [SPACE]: {
        [ASSET_VIEW_KEY]: {
          name: "Root Asset",
          parent: { space: "test-space", externalId: "parent-asset" },
        },
      },
    },
  };

  return {
    CogniteAsset: [assetNode],
    "CogniteAsset|parent": [parentNode],
  };
}

export function makeCogniteAssetQueryResultWithProperties(
  properties: Record<string, unknown>,
): QueryResultMap {
  const result = makeCogniteAssetQueryResult();
  const asset = result.CogniteAsset?.[0];
  if (asset?.instanceType === "node") {
    asset.properties = {
      ...asset.properties,
      [SPACE]: {
        ...asset.properties?.[SPACE],
        [ASSET_VIEW_KEY]: {
          ...asset.properties?.[SPACE]?.[ASSET_VIEW_KEY],
          ...properties,
        },
      },
    };
  }
  return result;
}
