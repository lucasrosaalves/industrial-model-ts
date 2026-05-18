import type {
  DataModelId,
  DataModelRetrieveItem,
  DataModelRetrieveOptions,
  InstancesQueryRequest,
  InstancesQueryResponse,
} from "./types";

export interface CognitePort {
  retrieveDataModels(
    ids: DataModelId[],
    options?: DataModelRetrieveOptions,
  ): Promise<{ items: DataModelRetrieveItem[] }>;

  queryInstances(request: InstancesQueryRequest): Promise<InstancesQueryResponse>;
}
