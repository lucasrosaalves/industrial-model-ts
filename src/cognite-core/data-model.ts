import type { DataModelId } from "../types";

/** Data model id for Cognite Core v1. */
export const COGNITE_CORE_DATA_MODEL = {
  space: "cdf_cdm",
  externalId: "CogniteCore",
  version: "v1",
} as const satisfies DataModelId;
