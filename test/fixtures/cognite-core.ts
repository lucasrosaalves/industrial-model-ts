import type { CogniteClient } from "@cognite/sdk";
import { vi } from "vitest";
import type {
  CognitePort,
  DataModelRetrieveItem,
  InstancesSearchResponse,
  ViewDefinition,
} from "../../src/cognite";
import type { DataModelId, QueryResultMap } from "../../src/types";
import cogniteCoreDataModelJson from "./cognite-core-data-model.json";

export const COGNITE_CORE_DATA_MODEL: DataModelId = {
  space: "cdf_cdm",
  externalId: "CogniteCore",
  version: "v1",
};

export interface RetrieveDataModelsResponse {
  items: DataModelRetrieveItem[];
}

const cogniteCoreDataModelResponse = cogniteCoreDataModelJson as RetrieveDataModelsResponse;

export function getCogniteCoreDataModelResponse(): RetrieveDataModelsResponse {
  return cogniteCoreDataModelResponse;
}

export function getCogniteCoreViews(): ViewDefinition[] {
  return getCogniteCoreDataModelResponse().items[0]?.views ?? [];
}

export function getCogniteCoreView(externalId: string): ViewDefinition {
  const view = getCogniteCoreViews().find((v) => v.externalId === externalId);
  if (!view) {
    throw new Error(`View "${externalId}" not found in Cognite Core fixture`);
  }
  return view;
}

export function makeCogniteMock(
  response: RetrieveDataModelsResponse = getCogniteCoreDataModelResponse(),
): CognitePort {
  return {
    retrieveDataModels: vi.fn().mockResolvedValue(response),
    queryInstances: vi.fn(),
    searchInstances: vi.fn(),
    aggregateInstances: vi.fn(),
    applyInstances: vi.fn(),
    retrieveDatapoints: vi.fn(),
    retrieveLatestDatapoints: vi.fn(),
    insertDatapoints: vi.fn(),
    deleteDatapoints: vi.fn(),
    uploadFile: vi.fn(),
    getFileDownloadUrls: vi.fn(),
  };
}

/** Minimal retrieveDataModels payload for isolated unit tests. */
export function makeRetrieveDataModelsResponse(
  views: ViewDefinition[],
  createdTime = 1000,
): RetrieveDataModelsResponse {
  return { items: [{ views, createdTime }] };
}

export function makeCogniteWithViews(views: ViewDefinition[], createdTime = 1000): CognitePort {
  return makeCogniteMock(makeRetrieveDataModelsResponse(views, createdTime));
}

/** Mock CogniteClient backed by in-memory fixture data (no network calls). */
export function makeCogniteClientMock(options?: {
  queryItems?: QueryResultMap;
  nextCursor?: Record<string, string>;
  searchResponse?: InstancesSearchResponse;
  aggregateResponse?: import("../../src/cognite").InstancesAggregateResponse;
  applyResponse?: import("../../src/cognite").InstancesApplyResponse;
  datapointsRetrieveResponse?: unknown[];
  datapointsLatestResponse?: unknown[];
  fileUploadResponse?: unknown;
  fileDownloadUrlsResponse?: unknown[];
}): CogniteClient {
  return {
    dataModels: {
      retrieve: vi.fn().mockResolvedValue(cogniteCoreDataModelJson),
    },
    instances: {
      query: vi.fn().mockResolvedValue({
        items: options?.queryItems ?? {},
        nextCursor: options?.nextCursor ?? {},
      }),
      search: vi.fn().mockResolvedValue(options?.searchResponse ?? { items: [] }),
      aggregate: vi.fn().mockResolvedValue(options?.aggregateResponse ?? { items: [] }),
      apply: vi.fn().mockResolvedValue(options?.applyResponse ?? { items: [] }),
    },
    datapoints: {
      retrieve: vi.fn().mockResolvedValue(options?.datapointsRetrieveResponse ?? []),
      retrieveLatest: vi.fn().mockResolvedValue(options?.datapointsLatestResponse ?? []),
      insert: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    files: {
      upload: vi.fn().mockResolvedValue(
        options?.fileUploadResponse ?? {
          name: "file.txt",
          uploaded: false,
          createdTime: new Date(0),
          lastUpdatedTime: new Date(0),
        },
      ),
      getDownloadUrls: vi.fn().mockResolvedValue(options?.fileDownloadUrlsResponse ?? []),
    },
  } as unknown as CogniteClient;
}
