import { describe, expect, it, vi } from "vitest";
import type { CognitePort } from "../src/cognite";
import { FilesMapper } from "../src/mappers/files-mapper";
import { makeCogniteMock } from "./fixtures/index.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NODE_A = { space: "file-space", externalId: "doc-001" };
const NODE_B = { space: "file-space", externalId: "doc-002" };

const CREATED = new Date("2024-01-01T00:00:00.000Z");
const UPDATED = new Date("2024-01-02T00:00:00.000Z");

function makeUploadResponse(
  overrides: Partial<{
    instanceId: { space?: string; externalId?: string } | undefined;
    name: string;
    uploaded: boolean;
    mimeType: string;
    directory: string;
    source: string;
    uploadedTime: Date;
    uploadUrl: string;
  }> = {},
) {
  return {
    ...("instanceId" in overrides
      ? { instanceId: overrides.instanceId }
      : { instanceId: { space: NODE_A.space, externalId: NODE_A.externalId } }),
    name: overrides.name ?? "document.pdf",
    uploaded: overrides.uploaded ?? false,
    createdTime: CREATED,
    lastUpdatedTime: UPDATED,
    ...(overrides.mimeType !== undefined ? { mimeType: overrides.mimeType } : {}),
    ...(overrides.directory !== undefined ? { directory: overrides.directory } : {}),
    ...(overrides.source !== undefined ? { source: overrides.source } : {}),
    ...(overrides.uploadedTime !== undefined ? { uploadedTime: overrides.uploadedTime } : {}),
    ...(overrides.uploadUrl !== undefined ? { uploadUrl: overrides.uploadUrl } : {}),
  };
}

function makeMapper(cognite: CognitePort): FilesMapper {
  return new FilesMapper(cognite);
}

// ─── upload ───────────────────────────────────────────────────────────────────

describe("FilesMapper.upload", () => {
  it("maps required fields from the upload response to FileUploadResult", async () => {
    const cognite = makeCogniteMock();
    cognite.uploadFile = vi.fn().mockResolvedValue(makeUploadResponse());
    const mapper = makeMapper(cognite);

    const result = await mapper.upload({ ...NODE_A, name: "document.pdf" });

    expect(result).toMatchObject({
      space: NODE_A.space,
      externalId: NODE_A.externalId,
      name: "document.pdf",
      uploaded: false,
      createdTime: CREATED,
      lastUpdatedTime: UPDATED,
    });
  });

  it("wraps space and externalId into instanceId before calling Cognite", async () => {
    const cognite = makeCogniteMock();
    cognite.uploadFile = vi.fn().mockResolvedValue(makeUploadResponse());
    const mapper = makeMapper(cognite);

    await mapper.upload({ ...NODE_A, name: "file.txt", mimeType: "text/plain" });

    expect(cognite.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: { space: NODE_A.space, externalId: NODE_A.externalId },
        name: "file.txt",
        mimeType: "text/plain",
      }),
      undefined,
    );
  });

  it("passes content to Cognite when provided", async () => {
    const cognite = makeCogniteMock();
    cognite.uploadFile = vi.fn().mockResolvedValue(makeUploadResponse());
    const mapper = makeMapper(cognite);

    const content = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
    await mapper.upload({ ...NODE_A, name: "file.txt" }, content);

    expect(cognite.uploadFile).toHaveBeenCalledWith(expect.any(Object), content);
  });

  it("passes undefined as content when not provided", async () => {
    const cognite = makeCogniteMock();
    cognite.uploadFile = vi.fn().mockResolvedValue(makeUploadResponse());
    const mapper = makeMapper(cognite);

    await mapper.upload({ ...NODE_A, name: "file.txt" });

    expect(cognite.uploadFile).toHaveBeenCalledWith(expect.any(Object), undefined);
  });

  it("maps all optional fields when they are present in the response", async () => {
    const uploadedTime = new Date("2024-01-01T12:00:00.000Z");
    const cognite = makeCogniteMock();
    cognite.uploadFile = vi.fn().mockResolvedValue(
      makeUploadResponse({
        mimeType: "application/pdf",
        directory: "/reports",
        source: "sap",
        uploadedTime,
        uploadUrl: "https://storage.example.com/upload",
        uploaded: true,
      }),
    );
    const mapper = makeMapper(cognite);

    const result = await mapper.upload({ ...NODE_A, name: "report.pdf" });

    expect(result.mimeType).toBe("application/pdf");
    expect(result.directory).toBe("/reports");
    expect(result.source).toBe("sap");
    expect(result.uploadedTime).toEqual(uploadedTime);
    expect(result.uploadUrl).toBe("https://storage.example.com/upload");
    expect(result.uploaded).toBe(true);
  });

  it("omits optional fields that are absent in the response", async () => {
    const cognite = makeCogniteMock();
    cognite.uploadFile = vi.fn().mockResolvedValue(makeUploadResponse());
    const mapper = makeMapper(cognite);

    const result = await mapper.upload({ ...NODE_A, name: "file.txt" });

    expect(result).not.toHaveProperty("mimeType");
    expect(result).not.toHaveProperty("directory");
    expect(result).not.toHaveProperty("source");
    expect(result).not.toHaveProperty("uploadedTime");
    expect(result).not.toHaveProperty("uploadUrl");
  });

  it("falls back to the request NodeId when the response has no instanceId", async () => {
    const cognite = makeCogniteMock();
    cognite.uploadFile = vi.fn().mockResolvedValue(makeUploadResponse({ instanceId: undefined }));
    const mapper = makeMapper(cognite);

    const result = await mapper.upload({ ...NODE_A, name: "file.txt" });

    expect(result.space).toBe(NODE_A.space);
    expect(result.externalId).toBe(NODE_A.externalId);
  });

  it("passes metadata through to Cognite without exposing it in the result", async () => {
    const cognite = makeCogniteMock();
    cognite.uploadFile = vi.fn().mockResolvedValue(makeUploadResponse());
    const mapper = makeMapper(cognite);

    await mapper.upload({
      ...NODE_A,
      name: "file.txt",
      metadata: { department: "engineering", project: "alpha" },
    });

    expect(cognite.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { department: "engineering", project: "alpha" } }),
      undefined,
    );
  });
});

// ─── getDownloadUrls ──────────────────────────────────────────────────────────

describe("FilesMapper.getDownloadUrls", () => {
  it("returns an empty array and does not call Cognite when nodeIds is empty", async () => {
    const cognite = makeCogniteMock();
    cognite.getFileDownloadUrls = vi.fn();
    const mapper = makeMapper(cognite);

    const result = await mapper.getDownloadUrls([]);

    expect(result).toEqual([]);
    expect(cognite.getFileDownloadUrls).not.toHaveBeenCalled();
  });

  it("wraps each node ID in an instanceId object before calling Cognite", async () => {
    const cognite = makeCogniteMock();
    cognite.getFileDownloadUrls = vi.fn().mockResolvedValue([
      {
        instanceId: { space: NODE_A.space, externalId: NODE_A.externalId },
        downloadUrl: "https://example.com/a",
      },
    ]);
    const mapper = makeMapper(cognite);

    await mapper.getDownloadUrls([NODE_A]);

    expect(cognite.getFileDownloadUrls).toHaveBeenCalledWith([
      { instanceId: { space: NODE_A.space, externalId: NODE_A.externalId } },
    ]);
  });

  it("maps response to FileDownloadUrl with space, externalId, and downloadUrl", async () => {
    const cognite = makeCogniteMock();
    cognite.getFileDownloadUrls = vi.fn().mockResolvedValue([
      {
        instanceId: { space: NODE_A.space, externalId: NODE_A.externalId },
        downloadUrl: "https://example.com/doc-001",
      },
    ]);
    const mapper = makeMapper(cognite);

    const result = await mapper.getDownloadUrls([NODE_A]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      space: NODE_A.space,
      externalId: NODE_A.externalId,
      downloadUrl: "https://example.com/doc-001",
    });
  });

  it("maps multiple node IDs preserving response order", async () => {
    const cognite = makeCogniteMock();
    cognite.getFileDownloadUrls = vi.fn().mockResolvedValue([
      {
        instanceId: { space: NODE_A.space, externalId: NODE_A.externalId },
        downloadUrl: "https://example.com/a",
      },
      {
        instanceId: { space: NODE_B.space, externalId: NODE_B.externalId },
        downloadUrl: "https://example.com/b",
      },
    ]);
    const mapper = makeMapper(cognite);

    const result = await mapper.getDownloadUrls([NODE_A, NODE_B]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      space: NODE_A.space,
      externalId: NODE_A.externalId,
      downloadUrl: "https://example.com/a",
    });
    expect(result[1]).toEqual({
      space: NODE_B.space,
      externalId: NODE_B.externalId,
      downloadUrl: "https://example.com/b",
    });
  });

  it("falls back to the request NodeId when the response item has no instanceId", async () => {
    const cognite = makeCogniteMock();
    cognite.getFileDownloadUrls = vi
      .fn()
      .mockResolvedValue([{ downloadUrl: "https://example.com/fallback" }]);
    const mapper = makeMapper(cognite);

    const result = await mapper.getDownloadUrls([NODE_A]);

    expect(result[0]).toEqual({
      space: NODE_A.space,
      externalId: NODE_A.externalId,
      downloadUrl: "https://example.com/fallback",
    });
  });

  it("sends all IDs in a single Cognite call regardless of count", async () => {
    const cognite = makeCogniteMock();
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      space: "file-space",
      externalId: `doc-${i}`,
    }));
    const responses = nodes.map((n) => ({
      instanceId: { space: n.space, externalId: n.externalId },
      downloadUrl: `https://example.com/${n.externalId}`,
    }));
    cognite.getFileDownloadUrls = vi.fn().mockResolvedValue(responses);
    const mapper = makeMapper(cognite);

    const result = await mapper.getDownloadUrls(nodes);

    expect(cognite.getFileDownloadUrls).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(10);
    expect(vi.mocked(cognite.getFileDownloadUrls).mock.calls[0]?.[0]).toHaveLength(10);
  });
});
