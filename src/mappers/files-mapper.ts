import type { CogniteFileDownloadUrl, CogniteFileUploadResult, CognitePort } from "../cognite";
import type { FileDownloadUrl, FileUploadInfo, FileUploadResult, NodeId } from "../types";

export class FilesMapper {
  constructor(private readonly cognite: CognitePort) {}

  async upload(fileInfo: FileUploadInfo, content?: unknown): Promise<FileUploadResult> {
    const { space, externalId, ...rest } = fileInfo;
    const result = await this.cognite.uploadFile(
      { instanceId: { space, externalId }, ...rest },
      content,
    );
    return this.mapUploadResult(result, { space, externalId });
  }

  async getDownloadUrls(nodeIds: NodeId[]): Promise<FileDownloadUrl[]> {
    if (nodeIds.length === 0) return [];
    const ids = nodeIds.map(({ space, externalId }) => ({ instanceId: { space, externalId } }));
    const result = await this.cognite.getFileDownloadUrls(ids);
    return result.map((item, i) =>
      this.mapDownloadUrl(item, nodeIds[i] ?? { space: "", externalId: "" }),
    );
  }

  private toNodeId(
    item: Pick<CogniteFileUploadResult | CogniteFileDownloadUrl, "instanceId">,
    fallback: NodeId,
  ): NodeId {
    return {
      space: item.instanceId?.space ?? fallback.space,
      externalId: item.instanceId?.externalId ?? fallback.externalId,
    };
  }

  private mapUploadResult(item: CogniteFileUploadResult, fallback: NodeId): FileUploadResult {
    const nodeId = this.toNodeId(item, fallback);
    return {
      ...nodeId,
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

  private mapDownloadUrl(item: CogniteFileDownloadUrl, fallback: NodeId): FileDownloadUrl {
    return {
      ...this.toNodeId(item, fallback),
      downloadUrl: item.downloadUrl,
    };
  }
}
