import type {
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
} from "./types";

export interface CognitePort {
  retrieveDataModels(
    ids: DataModelId[],
    options?: DataModelRetrieveOptions,
  ): Promise<{ items: DataModelRetrieveItem[] }>;

  queryInstances(request: InstancesQueryRequest): Promise<InstancesQueryResponse>;

  searchInstances(request: InstancesSearchRequest): Promise<InstancesSearchResponse>;

  aggregateInstances(request: InstancesAggregateRequest): Promise<InstancesAggregateResponse>;

  applyInstances(request: InstancesApplyRequest): Promise<InstancesApplyResponse>;
}
