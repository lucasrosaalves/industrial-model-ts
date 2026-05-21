import type { CogniteClient } from "@cognite/sdk";
import type { CognitePort } from "./port";
import type {
  CogniteDatapointDeleteItem,
  CogniteDatapointInsertItem,
  CogniteDatapointLatestItem,
  CogniteDatapointResponse,
  CogniteDatapointResultItem,
  CogniteDatapointRetrieveOptions,
  CogniteFileDownloadUrl,
  CogniteFileUploadInfo,
  CogniteFileUploadResult,
  DataModelId,
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

  async applyInstances(request: InstancesApplyRequest): Promise<InstancesApplyResponse> {
    const apply = (
      this.client.instances as unknown as {
        apply: (request: InstancesApplyRequest) => Promise<{ items: unknown[] }>;
      }
    ).apply;
    const response = await apply(request);
    return {
      items: response.items as unknown as InstancesApplyResponse["items"],
    };
  }

  async retrieveDatapoints(
    options: CogniteDatapointRetrieveOptions,
  ): Promise<{ items: CogniteDatapointResultItem[] }> {
    const { items, ...rest } = options;
    const sdkItems = items.map(({ space, externalId, ...itemRest }) => ({
      ...itemRest,
      instanceId: { space, externalId },
    }));
    const response = await this.client.datapoints.retrieve({
      ...rest,
      items: sdkItems,
    } as Parameters<typeof this.client.datapoints.retrieve>[0]);
    return { items: (response as unknown as CogniteDatapointResponse[]).map(mapDatapointResult) };
  }

  async retrieveLatestDatapoints(
    items: CogniteDatapointLatestItem[],
    options?: { ignoreUnknownIds?: boolean },
  ): Promise<{ items: CogniteDatapointResultItem[] }> {
    const sdkItems = items.map(({ space, externalId, before }) => ({
      instanceId: { space, externalId },
      ...(before !== undefined ? { before } : {}),
    }));
    const response = await this.client.datapoints.retrieveLatest(
      sdkItems as Parameters<typeof this.client.datapoints.retrieveLatest>[0],
      options,
    );
    return { items: (response as unknown as CogniteDatapointResponse[]).map(mapDatapointResult) };
  }

  async insertDatapoints(items: CogniteDatapointInsertItem[]): Promise<void> {
    const sdkItems = items.map(({ space, externalId, datapoints }) => ({
      instanceId: { space, externalId },
      datapoints,
    }));
    await this.client.datapoints.insert(
      sdkItems as Parameters<typeof this.client.datapoints.insert>[0],
    );
  }

  async deleteDatapoints(items: CogniteDatapointDeleteItem[]): Promise<void> {
    const sdkItems = items.map(({ space, externalId, inclusiveBegin, exclusiveEnd }) => ({
      instanceId: { space, externalId },
      inclusiveBegin,
      ...(exclusiveEnd !== undefined ? { exclusiveEnd } : {}),
    }));
    await this.client.datapoints.delete(
      sdkItems as Parameters<typeof this.client.datapoints.delete>[0],
    );
  }

  async uploadFile(
    fileInfo: CogniteFileUploadInfo,
    content?: unknown,
  ): Promise<CogniteFileUploadResult> {
    const { instanceId, ...rest } = fileInfo;
    const response = await this.client.files.upload(
      { ...rest, instanceId } as Parameters<typeof this.client.files.upload>[0],
      content as Parameters<typeof this.client.files.upload>[1],
      false,
      content !== undefined,
    );
    return mapFileResult(response as SdkFileInfo);
  }

  async getFileDownloadUrls(
    ids: Array<{ instanceId: { space: string; externalId: string } }>,
  ): Promise<CogniteFileDownloadUrl[]> {
    const response = await this.client.files.getDownloadUrls(
      ids as Parameters<typeof this.client.files.getDownloadUrls>[0],
    );
    return (
      response as Array<{
        instanceId?: { space?: string; externalId?: string };
        downloadUrl: string;
      }>
    ).map((item) => ({
      ...(item.instanceId !== undefined ? { instanceId: item.instanceId } : {}),
      downloadUrl: item.downloadUrl,
    }));
  }
}

type SdkFileInfo = {
  instanceId?: { space?: string; externalId?: string };
  name: string;
  uploaded: boolean;
  uploadedTime?: Date;
  createdTime: Date;
  lastUpdatedTime: Date;
  mimeType?: string;
  directory?: string;
  source?: string;
  uploadUrl?: string;
};

function mapFileResult(item: SdkFileInfo): CogniteFileUploadResult {
  return {
    ...(item.instanceId !== undefined ? { instanceId: item.instanceId } : {}),
    name: item.name,
    uploaded: item.uploaded,
    createdTime: item.createdTime,
    lastUpdatedTime: item.lastUpdatedTime,
    ...(item.uploadedTime !== undefined ? { uploadedTime: item.uploadedTime } : {}),
    ...(item.mimeType !== undefined ? { mimeType: item.mimeType } : {}),
    ...(item.directory !== undefined ? { directory: item.directory } : {}),
    ...(item.source !== undefined ? { source: item.source } : {}),
    ...(item.uploadUrl !== undefined ? { uploadUrl: item.uploadUrl } : {}),
  };
}

function mapDatapointResult(item: CogniteDatapointResponse): CogniteDatapointResultItem {
  return {
    ...(item.instanceId?.space !== undefined ? { space: item.instanceId.space } : {}),
    ...(item.instanceId?.externalId !== undefined
      ? { externalId: item.instanceId.externalId }
      : {}),
    isString: item.isString ?? false,
    ...(item.unit !== undefined ? { unit: item.unit } : {}),
    datapoints: item.datapoints ?? [],
    ...(item.nextCursor !== undefined ? { nextCursor: item.nextCursor } : {}),
  };
}
