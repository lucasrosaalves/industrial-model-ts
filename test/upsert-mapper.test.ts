import { describe, expect, it, vi } from "vitest";
import type { IndustrialModel, NodeId } from "../src";
import type { EdgeDefinition, ViewDefinition } from "../src/cognite";
import { UpsertMapper } from "../src/mappers/upsert-mapper";
import { ViewMapper } from "../src/mappers/view-mapper";
import {
  COGNITE_CORE_DATA_MODEL,
  createUpsertMapper,
  makeCogniteMock,
  makeCogniteWithViews,
} from "./fixtures/index.js";

type Asset = IndustrialModel<
  {
    name?: string;
    sourceCreatedTime?: Date;
    parent?: NodeId;
  },
  {
    children?: Asset[];
  }
>;

type Object3D = IndustrialModel<
  {
    name?: string;
  },
  {
    images360?: unknown[];
  }
>;

type InspectableAsset = IndustrialModel<
  {
    name?: string;
  },
  {
    inspections?: NodeId[];
  }
>;

describe("UpsertMapper", () => {
  const mapper = createUpsertMapper();

  it("maps flat node patches to Cognite apply node sources", async () => {
    const request = await mapper.map<Asset>({
      viewExternalId: "CogniteAsset",
      items: [
        {
          space: "asset-space",
          externalId: "pump-1",
          name: "Pump 1",
          parent: { space: "asset-space", externalId: "root" },
        },
      ],
    });

    expect(request).toEqual({
      items: [
        {
          instanceType: "node",
          space: "asset-space",
          externalId: "pump-1",
          sources: [
            {
              source: {
                type: "view",
                space: "cdf_cdm",
                externalId: "CogniteAsset",
                version: "v1",
              },
              properties: {
                name: "Pump 1",
                parent: { space: "asset-space", externalId: "root" },
              },
            },
          ],
        },
      ],
    });
  });

  it("converts Date values before sending to Cognite", async () => {
    const request = await mapper.map<Asset>({
      viewExternalId: "CogniteAsset",
      items: [
        {
          space: "asset-space",
          externalId: "pump-1",
          sourceCreatedTime: new Date("2024-01-02T03:04:05.000Z"),
        },
      ],
    });

    expect(request.items[0]).toMatchObject({
      sources: [
        {
          properties: {
            sourceCreatedTime: "2024-01-02T03:04:05.000Z",
          },
        },
      ],
    });
  });

  it("passes replace through to Cognite apply requests", async () => {
    const request = await mapper.map<Asset>({
      viewExternalId: "CogniteAsset",
      replace: true,
      items: [
        {
          space: "asset-space",
          externalId: "pump-1",
          name: "Pump 1",
        },
      ],
    });

    expect(request.replace).toBe(true);
  });

  it("infers reverse direct relation writes from relation references", async () => {
    const request = await mapper.map<Asset>({
      viewExternalId: "CogniteAsset",
      items: [
        {
          space: "asset-space",
          externalId: "parent-asset",
          children: [{ space: "asset-space", externalId: "child-asset" }],
        },
      ],
    });

    expect(request.items).toEqual([
      {
        instanceType: "node",
        space: "asset-space",
        externalId: "parent-asset",
      },
      {
        instanceType: "node",
        space: "asset-space",
        externalId: "child-asset",
        sources: [
          {
            source: {
              type: "view",
              space: "cdf_cdm",
              externalId: "CogniteAsset",
              version: "v1",
            },
            properties: {
              parent: { space: "asset-space", externalId: "parent-asset" },
            },
          },
        ],
      },
    ]);
  });

  it("infers edge writes from edge connection references", async () => {
    const request = await mapper.map<Object3D>({
      viewExternalId: "Cognite3DObject",
      items: [
        {
          space: "object-space",
          externalId: "object-1",
          images360: [{ space: "image-space", externalId: "image-1" }],
        },
      ],
      onEdgeCreation: {
        images360: ({ startNode, endNode, edgeType }) => ({
          space: startNode.space,
          externalId: `${startNode.externalId}-${edgeType.externalId}-${endNode.externalId}`,
        }),
      },
    });

    expect(request.items).toEqual([
      {
        instanceType: "node",
        space: "object-space",
        externalId: "object-1",
      },
      {
        instanceType: "edge",
        space: "object-space",
        externalId: "object-1-image-360-annotation-image-1",
        type: { space: "cdf_cdm", externalId: "image-360-annotation" },
        startNode: { space: "object-space", externalId: "object-1" },
        endNode: { space: "image-space", externalId: "image-1" },
      },
    ]);
  });

  it("passes normalized edge creation context and strips extra target fields", async () => {
    const createImageEdge = vi.fn(({ startNode, endNode, edgeType }) => ({
      space: "edge-space",
      externalId: `${startNode.externalId}-${edgeType.externalId}-${endNode.externalId}`,
    }));

    const request = await mapper.map<Object3D>({
      viewExternalId: "Cognite3DObject",
      items: [
        {
          space: "object-space",
          externalId: "object-1",
          images360: [{ space: "image-space", externalId: "image-1", name: "Image 1" } as never],
        },
      ],
      onEdgeCreation: {
        images360: createImageEdge,
      },
    });

    expect(createImageEdge).toHaveBeenCalledWith({
      startNode: { space: "object-space", externalId: "object-1" },
      endNode: { space: "image-space", externalId: "image-1" },
      edgeType: { space: "cdf_cdm", externalId: "image-360-annotation" },
    });
    expect(request.items[1]).toMatchObject({
      instanceType: "edge",
      space: "edge-space",
      externalId: "object-1-image-360-annotation-image-1",
      startNode: { space: "object-space", externalId: "object-1" },
      endNode: { space: "image-space", externalId: "image-1" },
    });
  });

  it("uses target-to-root direction for inward edge connections", async () => {
    const inspectionView: ViewDefinition = {
      space: "test_space",
      externalId: "InspectableAsset",
      version: "v1",
      properties: {
        inspections: {
          type: { space: "test_space", externalId: "inspection-edge" },
          source: {
            type: "view",
            space: "test_space",
            externalId: "Inspection",
            version: "v1",
          },
          direction: "inwards",
        },
      },
    };
    const cognite = makeCogniteWithViews([inspectionView]);
    const inwardMapper = new UpsertMapper(
      new ViewMapper(cognite, COGNITE_CORE_DATA_MODEL),
      cognite,
    );

    const request = await inwardMapper.map<InspectableAsset>({
      viewExternalId: "InspectableAsset",
      items: [
        {
          space: "asset-space",
          externalId: "asset-1",
          inspections: [{ space: "inspection-space", externalId: "inspection-1" }],
        },
      ],
      onEdgeCreation: {
        inspections: ({ startNode, endNode, edgeType }) => ({
          space: "edge-space",
          externalId: `${startNode.externalId}-${edgeType.externalId}-${endNode.externalId}`,
        }),
      },
    });

    expect(request.items[1]).toMatchObject({
      instanceType: "edge",
      space: "edge-space",
      externalId: "inspection-1-inspection-edge-asset-1",
      type: { space: "test_space", externalId: "inspection-edge" },
      startNode: { space: "inspection-space", externalId: "inspection-1" },
      endNode: { space: "asset-space", externalId: "asset-1" },
    });
  });

  it("requires onEdgeCreation for edge connection writes", async () => {
    await expect(
      mapper.map<Object3D>({
        viewExternalId: "Cognite3DObject",
        items: [
          {
            space: "object-space",
            externalId: "object-1",
            images360: [{ space: "image-space", externalId: "image-1" }],
          },
        ],
      }),
    ).rejects.toThrow(/onEdgeCreation\.images360/);
  });

  it("requires edge creation callbacks to return NodeId values", async () => {
    await expect(
      mapper.map<Object3D>({
        viewExternalId: "Cognite3DObject",
        items: [
          {
            space: "object-space",
            externalId: "object-1",
            images360: [{ space: "image-space", externalId: "image-1" }],
          },
        ],
        onEdgeCreation: {
          images360: () => ({ space: "object-space" }) as never,
        },
      }),
    ).rejects.toThrow(/onEdgeCreation\(images360\): expected a NodeId/);
  });

  it("does not query existing edges when edgeMode is append", async () => {
    const cognite = makeCogniteMock();
    cognite.queryInstances = vi.fn().mockRejectedValue(new Error("should not query"));
    const appendMapper = new UpsertMapper(
      new ViewMapper(cognite, COGNITE_CORE_DATA_MODEL),
      cognite,
    );

    const request = await appendMapper.map<Object3D>({
      viewExternalId: "Cognite3DObject",
      edgeMode: "append",
      items: [
        {
          space: "object-space",
          externalId: "object-1",
          images360: [{ space: "image-space", externalId: "image-1" }],
        },
      ],
      onEdgeCreation: {
        images360: ({ startNode, endNode, edgeType }) => ({
          space: startNode.space,
          externalId: `${startNode.externalId}-${edgeType.externalId}-${endNode.externalId}`,
        }),
      },
    });

    expect(cognite.queryInstances).not.toHaveBeenCalled();
    expect(request.delete).toBeUndefined();
  });

  it("deletes existing edge-connection edges when edgeMode is replace", async () => {
    const cognite = makeCogniteMock();
    const existingEdge: EdgeDefinition = {
      instanceType: "edge",
      space: "object-space",
      externalId: "old-edge",
      startNode: { space: "object-space", externalId: "object-1" },
      endNode: { space: "image-space", externalId: "old-image" },
    };
    const desiredEdge: EdgeDefinition = {
      instanceType: "edge",
      space: "object-space",
      externalId: "object-1-image-360-annotation-image-1",
      startNode: { space: "object-space", externalId: "object-1" },
      endNode: { space: "image-space", externalId: "image-1" },
    };
    cognite.queryInstances = vi.fn().mockResolvedValue({
      items: { images360Edges: [existingEdge, desiredEdge] },
      nextCursor: {},
    });
    const replaceMapper = new UpsertMapper(
      new ViewMapper(cognite, COGNITE_CORE_DATA_MODEL),
      cognite,
    );

    const request = await replaceMapper.map<Object3D>({
      viewExternalId: "Cognite3DObject",
      edgeMode: "replace",
      items: [
        {
          space: "object-space",
          externalId: "object-1",
          images360: [{ space: "image-space", externalId: "image-1" }],
        },
      ],
      onEdgeCreation: {
        images360: ({ startNode, endNode, edgeType }) => ({
          space: startNode.space,
          externalId: `${startNode.externalId}-${edgeType.externalId}-${endNode.externalId}`,
        }),
      },
    });

    expect(cognite.queryInstances).toHaveBeenCalledWith(
      expect.objectContaining({
        with: expect.objectContaining({
          images360Edges: expect.objectContaining({
            edges: expect.objectContaining({
              direction: "outwards",
              from: "images360Root",
            }),
          }),
        }),
      }),
    );
    expect(request.delete).toEqual([
      { instanceType: "edge", space: "object-space", externalId: "old-edge" },
    ]);
  });

  it("deduplicates replacement deletes across repeated edge replacements", async () => {
    const cognite = makeCogniteMock();
    const existingEdge: EdgeDefinition = {
      instanceType: "edge",
      space: "object-space",
      externalId: "old-edge",
      startNode: { space: "object-space", externalId: "object-1" },
      endNode: { space: "image-space", externalId: "old-image" },
    };
    cognite.queryInstances = vi.fn().mockResolvedValue({
      items: { images360Edges: [existingEdge] },
      nextCursor: {},
    });
    const replaceMapper = new UpsertMapper(
      new ViewMapper(cognite, COGNITE_CORE_DATA_MODEL),
      cognite,
    );

    const request = await replaceMapper.map<Object3D>({
      viewExternalId: "Cognite3DObject",
      edgeMode: "replace",
      items: [
        {
          space: "object-space",
          externalId: "object-1",
          images360: [{ space: "image-space", externalId: "image-1" }],
        },
        {
          space: "object-space",
          externalId: "object-1",
          images360: [{ space: "image-space", externalId: "image-2" }],
        },
      ],
      onEdgeCreation: {
        images360: ({ startNode, endNode, edgeType }) => ({
          space: startNode.space,
          externalId: `${startNode.externalId}-${edgeType.externalId}-${endNode.externalId}`,
        }),
      },
    });

    expect(cognite.queryInstances).toHaveBeenCalledTimes(2);
    expect(request.delete).toEqual([
      { instanceType: "edge", space: "object-space", externalId: "old-edge" },
    ]);
  });

  it("maps replacement deletes beyond Cognite's single-request item limit", async () => {
    const cognite = makeCogniteMock();
    const existingEdges: EdgeDefinition[] = Array.from({ length: 1000 }, (_, index) => ({
      instanceType: "edge",
      space: "object-space",
      externalId: `old-edge-${index}`,
      startNode: { space: "object-space", externalId: "object-1" },
      endNode: { space: "image-space", externalId: `old-image-${index}` },
    }));
    cognite.queryInstances = vi.fn().mockResolvedValue({
      items: { images360Edges: existingEdges },
      nextCursor: {},
    });
    const replaceMapper = new UpsertMapper(
      new ViewMapper(cognite, COGNITE_CORE_DATA_MODEL),
      cognite,
    );

    const request = await replaceMapper.map<Object3D>({
      viewExternalId: "Cognite3DObject",
      edgeMode: "replace",
      items: [
        {
          space: "object-space",
          externalId: "object-1",
          images360: [{ space: "image-space", externalId: "image-1" }],
        },
      ],
      onEdgeCreation: {
        images360: ({ startNode, endNode, edgeType }) => ({
          space: startNode.space,
          externalId: `${startNode.externalId}-${edgeType.externalId}-${endNode.externalId}`,
        }),
      },
    });

    expect(request.items).toHaveLength(2);
    expect(request.delete).toHaveLength(1000);
  });

  it("queries every existing edge page when replacing edge connections", async () => {
    const cognite = makeCogniteMock();
    const page1: EdgeDefinition = {
      instanceType: "edge",
      space: "object-space",
      externalId: "old-edge-1",
      startNode: { space: "object-space", externalId: "object-1" },
      endNode: { space: "image-space", externalId: "old-image-1" },
    };
    const page2: EdgeDefinition = {
      instanceType: "edge",
      space: "object-space",
      externalId: "old-edge-2",
      startNode: { space: "object-space", externalId: "object-1" },
      endNode: { space: "image-space", externalId: "old-image-2" },
    };
    cognite.queryInstances = vi
      .fn()
      .mockResolvedValueOnce({
        items: { images360Edges: [page1] },
        nextCursor: { images360Edges: "next-page" },
      })
      .mockResolvedValueOnce({
        items: { images360Edges: [page2] },
        nextCursor: {},
      });
    const replaceMapper = new UpsertMapper(
      new ViewMapper(cognite, COGNITE_CORE_DATA_MODEL),
      cognite,
    );

    const request = await replaceMapper.map<Object3D>({
      viewExternalId: "Cognite3DObject",
      edgeMode: "replace",
      items: [
        {
          space: "object-space",
          externalId: "object-1",
          images360: [],
        },
      ],
    });

    expect(cognite.queryInstances).toHaveBeenCalledTimes(2);
    expect(cognite.queryInstances).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursors: { images360Edges: "next-page" },
      }),
    );
    expect(request.delete).toEqual([
      { instanceType: "edge", space: "object-space", externalId: "old-edge-1" },
      { instanceType: "edge", space: "object-space", externalId: "old-edge-2" },
    ]);
  });

  it("accepts NodeId-like relation references and strips extra fields", async () => {
    const request = await mapper.map<Asset>({
      viewExternalId: "CogniteAsset",
      items: [
        {
          space: "asset-space",
          externalId: "pump-1",
          children: [{ space: "asset-space", externalId: "child-asset", name: "Child" } as never],
        },
      ],
    });

    expect(request.items[1]).toMatchObject({
      instanceType: "node",
      space: "asset-space",
      externalId: "child-asset",
      sources: [
        {
          properties: {
            parent: { space: "asset-space", externalId: "pump-1" },
          },
        },
      ],
    });
  });

  it("rejects unknown fields", async () => {
    await expect(
      mapper.map<Asset>({
        viewExternalId: "CogniteAsset",
        items: [
          {
            space: "asset-space",
            externalId: "pump-1",
            namme: "Pump 1",
          } as never,
        ],
      }),
    ).rejects.toThrow(/unknown view property/);
  });
});
