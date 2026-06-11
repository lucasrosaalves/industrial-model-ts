import type {
  CogniteDatapointDeleteItem,
  CogniteDatapointInsertItem,
  CogniteDatapointLatestItem,
  CogniteDatapointResultItem,
  CogniteDatapointRetrieveOptions,
  CogniteFileDownloadUrl,
  CogniteFileUploadInfo,
  CogniteFileUploadResult,
  DataModelId,
  DataModelRetrieveItem,
  DataModelRetrieveOptions,
  InstancesAggregateRequest,
  InstancesAggregateResponse,
  InstancesApplyRequest,
  InstancesApplyResponse,
  InstancesQueryRequest,
  InstancesQueryResponse,
  InstancesSearchRequest,
  InstancesSearchResponse,
  ViewDefinition,
} from "./types";

export interface CognitePort {
  retrieveDataModels(
    ids: DataModelId[],
    options?: DataModelRetrieveOptions,
  ): Promise<{ items: DataModelRetrieveItem[] }>;

  retrieveViews(
    ids: Array<{ space: string; externalId: string; version: string }>,
  ): Promise<{ items: ViewDefinition[] }>;

  queryInstances(request: InstancesQueryRequest): Promise<InstancesQueryResponse>;

  searchInstances(request: InstancesSearchRequest): Promise<InstancesSearchResponse>;

  aggregateInstances(request: InstancesAggregateRequest): Promise<InstancesAggregateResponse>;

  applyInstances(request: InstancesApplyRequest): Promise<InstancesApplyResponse>;

  retrieveDatapoints(
    options: CogniteDatapointRetrieveOptions,
  ): Promise<{ items: CogniteDatapointResultItem[] }>;

  retrieveLatestDatapoints(
    items: CogniteDatapointLatestItem[],
    options?: { ignoreUnknownIds?: boolean },
  ): Promise<{ items: CogniteDatapointResultItem[] }>;

  insertDatapoints(items: CogniteDatapointInsertItem[]): Promise<void>;

  deleteDatapoints(items: CogniteDatapointDeleteItem[]): Promise<void>;

  uploadFile(fileInfo: CogniteFileUploadInfo, content?: unknown): Promise<CogniteFileUploadResult>;

  getFileDownloadUrls(
    ids: Array<{ instanceId: { space: string; externalId: string } }>,
  ): Promise<CogniteFileDownloadUrl[]>;
}
