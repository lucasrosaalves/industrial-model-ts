import type { CogniteClient } from "@cognite/sdk";
import type { CognitePort } from "./port";
import type {
  DataModelId,
  DataModelRetrieveOptions,
  InstancesAggregateRequest,
  InstancesAggregateResponse,
  InstancesQueryRequest,
  InstancesQueryResponse,
  InstancesSearchRequest,
  InstancesSearchResponse,
  ViewDefinition,
} from "./types";

export function createCogniteAdapter(client: CogniteClient): CognitePort {
  return new CogniteSdkAdapter(client);
}

class CogniteSdkAdapter implements CognitePort {
  constructor(private readonly client: CogniteClient) {}

  async retrieveDataModels(ids: DataModelId[], options?: DataModelRetrieveOptions) {
    const response = await this.client.dataModels.retrieve(ids, options);
    return {
      items: response.items.map((item) => ({
        createdTime: item.createdTime,
        views: (item.views ?? []) as ViewDefinition[],
      })),
    };
  }

  async queryInstances(request: InstancesQueryRequest): Promise<InstancesQueryResponse> {
    const response = await this.client.instances.query(
      request as Parameters<CogniteClient["instances"]["query"]>[0],
    );
    return {
      items: response.items as unknown as InstancesQueryResponse["items"],
      nextCursor: response.nextCursor,
    };
  }

  async searchInstances(request: InstancesSearchRequest): Promise<InstancesSearchResponse> {
    const search = (
      this.client.instances as unknown as {
        search: (request: InstancesSearchRequest) => Promise<{ items: unknown[] }>;
      }
    ).search;
    const response = await search(request);
    return {
      items: response.items as unknown as InstancesSearchResponse["items"],
    };
  }

  async aggregateInstances(
    request: InstancesAggregateRequest,
  ): Promise<InstancesAggregateResponse> {
    const response = await this.client.instances.aggregate(
      request as Parameters<CogniteClient["instances"]["aggregate"]>[0],
    );
    return {
      items: response.items as unknown as InstancesAggregateResponse["items"],
    };
  }
}
