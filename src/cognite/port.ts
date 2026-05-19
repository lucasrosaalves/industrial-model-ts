import type {
  DataModelId,
  DataModelRetrieveItem,
  DataModelRetrieveOptions,
  InstancesAggregateRequest,
  InstancesAggregateResponse,
  InstancesQueryRequest,
  InstancesQueryResponse,
} from "./types";

export interface CognitePort {
  retrieveDataModels(
    ids: DataModelId[],
    options?: DataModelRetrieveOptions,
  ): Promise<{ items: DataModelRetrieveItem[] }>;

  queryInstances(request: InstancesQueryRequest): Promise<InstancesQueryResponse>;

  aggregateInstances(request: InstancesAggregateRequest): Promise<InstancesAggregateResponse>;
}
