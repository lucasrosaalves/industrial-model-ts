import { describe, expect, it, vi } from "vitest";
import type { IndustrialModel, NodeId } from "../src/index.js";
import { QueryMapper } from "../src/mappers/query-mapper";
import {
  createQueryMapper,
  createViewMapper,
  getCogniteCoreView,
  makeCogniteMock,
} from "./fixtures/index.js";

type AssetClass = IndustrialModel<{ name: string; code: string }>;
type Asset = IndustrialModel<
  {
    name: string;
    description?: string;
    externalId?: string;
    parent?: NodeId;
    assetClass?: NodeId;
  },
  {
    parent?: Asset;
    assetClass?: AssetClass;
    children?: Asset[];
  }
>;
type Activity = IndustrialModel<{ name: string; equipment?: NodeId[] }>;
type Equipment = IndustrialModel<
  {
    name: string;
    asset?: NodeId;
  },
  {
    asset?: Asset;
    activities?: Activity[];
  }
>;
type Image360 = IndustrialModel<{ takenAt: string }>;
type Object3D = IndustrialModel<
  {
    name: string;
  },
  {
    images360?: Image360[];
  }
>;

describe("QueryMapper", () => {
  const mapper = createQueryMapper();
  const assetView = getCogniteCoreView("CogniteAsset");

  it("builds a root nodes query with hasData and limit", async () => {
    const query = await mapper.map<{ name: string }>({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      limit: 10,
    });

    expect(query.with.CogniteAsset).toEqual({
      nodes: {
        filter: {
          and: [
            {
              hasData: [
                { type: "view", space: "cdf_cdm", externalId: "CogniteAsset", version: "v1" },
              ],
            },
          ],
        },
      },
      sort: [],
      limit: 10,
    });
    expect(query.select.CogniteAsset).toEqual({
      sources: [
        {
          source: { type: "view", space: "cdf_cdm", externalId: "CogniteAsset", version: "v1" },
          properties: ["name"],
        },
      ],
    });
  });

  it("maps filters through FilterMapper using fixture views", async () => {
    const query = await mapper.map<{ name: string }>({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      filters: { name: { eq: "Pump" } },
    });

    const rootWith = query.with.CogniteAsset as { nodes: { filter: { and: unknown[] } } };
    expect(rootWith.nodes.filter.and).toContainEqual({
      equals: { property: ["cdf_cdm", "CogniteAsset/v1", "name"], value: "Pump" },
    });
  });

  it("maps text search filters into instance references on the root query", async () => {
    const cognite = makeCogniteMock();
    cognite.searchInstances = vi.fn().mockResolvedValue({
      items: [{ instanceType: "node", space: "asset-space", externalId: "asset-1" }],
    });
    const searchMapper = new QueryMapper(createViewMapper(), cognite);

    const query = await searchMapper.map<{ name: string }>({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      filters: { name: { search: { query: "pump motor", operator: "AND" } } },
    });

    expect(cognite.searchInstances).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "pump motor",
        operator: "AND",
        properties: ["name"],
      }),
    );
    const rootWith = query.with.CogniteAsset as { nodes: { filter: { and: unknown[] } } };
    expect(rootWith.nodes.filter.and).toContainEqual({
      instanceReferences: [{ space: "asset-space", externalId: "asset-1" }],
    });
  });

  it("allows search filters on text list properties", async () => {
    const cognite = makeCogniteMock();
    cognite.searchInstances = vi.fn().mockResolvedValue({
      items: [{ instanceType: "node", space: "asset-space", externalId: "tagged-asset" }],
    });
    const searchMapper = new QueryMapper(createViewMapper(), cognite);

    const query = await searchMapper.map<{ tags: string[] }>({
      viewExternalId: "CogniteAsset",
      select: { tags: true },
      filters: { tags: { search: { query: "critical" } } },
    });

    expect(cognite.searchInstances).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "critical",
        operator: "OR",
        properties: ["tags"],
      }),
    );
    const rootWith = query.with.CogniteAsset as { nodes: { filter: { and: unknown[] } } };
    expect(rootWith.nodes.filter.and).toContainEqual({
      instanceReferences: [{ space: "asset-space", externalId: "tagged-asset" }],
    });
  });

  it("includes nested direct-relation select (parent)", async () => {
    const query = await mapper.map<Asset>({
      viewExternalId: "CogniteAsset",
      select: {
        name: true,
        parent: { name: true },
      },
    });

    expect(query.with["CogniteAsset|parent"]).toEqual({
      nodes: {
        from: "CogniteAsset",
        direction: "outwards",
        through: {
          view: { type: "view", space: "cdf_cdm", externalId: "CogniteAsset", version: "v1" },
          identifier: "parent",
        },
      },
      limit: 10_000,
    });
    expect(query.select["CogniteAsset|parent"]).toEqual({
      sources: [
        {
          source: { type: "view", space: "cdf_cdm", externalId: "CogniteAsset", version: "v1" },
          properties: ["name"],
        },
      ],
    });
  });

  it("includes reverse direct-relation select (children)", async () => {
    const query = await mapper.map<Asset>({
      viewExternalId: "CogniteAsset",
      select: {
        name: true,
        children: { name: true },
      },
    });

    expect(query.with["CogniteAsset|children"]).toEqual({
      nodes: {
        from: "CogniteAsset",
        direction: "inwards",
        through: {
          source: { type: "view", space: "cdf_cdm", externalId: "CogniteAsset", version: "v1" },
          identifier: "parent",
        },
      },
      limit: 10_000,
    });
  });

  it("applies sort clauses on the root view", async () => {
    const query = await mapper.map<{ name: string; externalId?: string }>({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      sort: { name: "ascending", externalId: "descending" },
    });

    expect(query.with.CogniteAsset).toMatchObject({
      sort: [
        {
          property: ["cdf_cdm", "CogniteAsset/v1", "name"],
          direction: "ascending",
          nullsFirst: false,
        },
        {
          property: ["node", "externalId"],
          direction: "descending",
          nullsFirst: true,
        },
      ],
    });
  });

  it("passes cursor on the root table expression", async () => {
    const query = await mapper.map<{ name: string }>({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      cursor: "cursor-abc",
    });

    expect(query.cursors).toEqual({ CogniteAsset: "cursor-abc" });
  });

  it("passes empty-string cursor (only null/undefined are omitted)", async () => {
    const query = await mapper.map<{ name: string }>({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      cursor: "",
    });

    expect(query.cursors).toEqual({ CogniteAsset: "" });
  });

  it("omits cursor when null or undefined", async () => {
    const withNull = await mapper.map<{ name: string }>({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      cursor: null,
    });
    const withUndefined = await mapper.map<{ name: string }>({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      cursor: undefined as unknown as string,
    });

    expect(withNull.cursors).toEqual({});
    expect(withUndefined.cursors).toEqual({});
  });

  it("does not reference undefined views from the fixture", async () => {
    await expect(
      mapper.map<{ name: string }>({
        viewExternalId: "NonExistentView",
        select: { name: true },
      }),
    ).rejects.toThrow(/"NonExistentView"/);

    expect(assetView.externalId).toBe("CogniteAsset");
  });

  describe("query validation", () => {
    it("rejects unknown select properties", async () => {
      await expect(
        mapper.map<Asset>({
          viewExternalId: "CogniteAsset",
          select: { namme: true } as never,
        }),
      ).rejects.toThrow(/select: Unrecognized key: "namme"/);
    });

    it("rejects unknown nested select properties", async () => {
      await expect(
        mapper.map<Asset>({
          viewExternalId: "CogniteAsset",
          select: { parent: { namme: true } } as never,
        }),
      ).rejects.toThrow(/select\.parent: Unrecognized key: "namme"/);
    });

    it("rejects unknown filter properties", async () => {
      await expect(
        mapper.map<Asset>({
          viewExternalId: "CogniteAsset",
          filters: { namme: { eq: "Pump" } } as never,
        }),
      ).rejects.toThrow(/filters: Unrecognized key: "namme"/);
    });

    it("rejects filter operators that do not match the view property type", async () => {
      await expect(
        mapper.map<Asset>({
          viewExternalId: "CogniteAsset",
          filters: { name: { gt: "Pump" } } as never,
        }),
      ).rejects.toThrow(/filters\.name: Unrecognized key: "gt"/);
    });

    it("rejects filter values that do not match the view property type", async () => {
      await expect(
        mapper.map<Asset>({
          viewExternalId: "CogniteAsset",
          filters: { name: { eq: 42 } } as never,
        }),
      ).rejects.toThrow(/filters\.name\.eq/);
    });

    it("rejects search filters on node metadata properties", async () => {
      await expect(
        mapper.map<Asset>({
          viewExternalId: "CogniteAsset",
          filters: { externalId: { search: { query: "asset" } } } as never,
        }),
      ).rejects.toThrow(/filters\.externalId: Unrecognized key: "search"/);
    });

    it("rejects search filters on non-text properties", async () => {
      await expect(
        mapper.map<Asset>({
          viewExternalId: "CogniteAsset",
          filters: { parent: { search: { query: "asset" } } } as never,
        }),
      ).rejects.toThrow(/filters\.parent: Unrecognized key: "search"/);
    });

    it("rejects search filters with missing query text", async () => {
      await expect(
        mapper.map<Asset>({
          viewExternalId: "CogniteAsset",
          filters: { name: { search: { operator: "AND" } } } as never,
        }),
      ).rejects.toThrow(/filters\.name\.search\.query/);
    });

    it("rejects search filters with unsupported operators", async () => {
      await expect(
        mapper.map<Asset>({
          viewExternalId: "CogniteAsset",
          filters: { name: { search: { query: "asset", operator: "NEAR" } } } as never,
        }),
      ).rejects.toThrow(/filters\.name\.search\.operator/);
    });

    it("rejects unknown sort properties", async () => {
      await expect(
        mapper.map<Asset>({
          viewExternalId: "CogniteAsset",
          sort: { namme: "ascending" } as never,
        }),
      ).rejects.toThrow(/sort: Unrecognized key: "namme"/);
    });
  });

  describe("complex queries", () => {
    const viewRef = (externalId: string) => ({
      type: "view" as const,
      space: "cdf_cdm",
      externalId,
      version: "v1",
    });

    it("builds two-level nested direct-relation chain (parent.assetClass)", async () => {
      const query = await mapper.map<Asset>({
        viewExternalId: "CogniteAsset",
        select: {
          name: true,
          parent: { assetClass: { name: true, code: true } },
        },
      });

      expect(query.with["CogniteAsset|parent"]).toMatchObject({
        nodes: {
          from: "CogniteAsset",
          direction: "outwards",
          through: { view: viewRef("CogniteAsset"), identifier: "parent" },
        },
        limit: 10_000,
      });
      expect(query.with["CogniteAsset|parent|assetClass"]).toMatchObject({
        nodes: {
          from: "CogniteAsset|parent",
          direction: "outwards",
          through: { view: viewRef("CogniteAsset"), identifier: "assetClass" },
        },
        limit: 10_000,
      });
      expect(query.select["CogniteAsset|parent|assetClass"]).toEqual({
        sources: [{ source: viewRef("CogniteAssetClass"), properties: ["name", "code"] }],
      });
    });

    it("builds three-level self-referential chain (parent.parent)", async () => {
      const query = await mapper.map<Asset>({
        viewExternalId: "CogniteAsset",
        select: {
          name: true,
          parent: { parent: { name: true } },
        },
      });

      expect(Object.keys(query.with)).toEqual(
        expect.arrayContaining([
          "CogniteAsset",
          "CogniteAsset|parent",
          "CogniteAsset|parent|parent",
        ]),
      );
      expect(query.with["CogniteAsset|parent|parent"]).toMatchObject({
        nodes: {
          from: "CogniteAsset|parent",
          direction: "outwards",
          through: { view: viewRef("CogniteAsset"), identifier: "parent" },
        },
      });
    });

    it("includes direct relation on select without creating a nested with expression", async () => {
      const query = await mapper.map<Asset>({
        viewExternalId: "CogniteAsset",
        select: { name: true, parent: true },
      });

      expect(query.select.CogniteAsset).toEqual({
        sources: [{ source: viewRef("CogniteAsset"), properties: ["name", "parent"] }],
      });
      expect(query.with["CogniteAsset|parent"]).toBeUndefined();
    });

    it("combines direct and reverse relations on CogniteEquipment", async () => {
      const query = await mapper.map<Equipment>({
        viewExternalId: "CogniteEquipment",
        select: {
          name: true,
          asset: { name: true },
          activities: { name: true },
        },
      });

      expect(query.with["CogniteEquipment|asset"]).toMatchObject({
        nodes: {
          from: "CogniteEquipment",
          direction: "outwards",
          through: { view: viewRef("CogniteEquipment"), identifier: "asset" },
        },
      });
      expect(query.with["CogniteEquipment|activities"]).toMatchObject({
        nodes: {
          from: "CogniteEquipment",
          direction: "inwards",
          through: {
            source: viewRef("CogniteActivity"),
            identifier: "equipment",
          },
        },
      });
      expect(query.select["CogniteEquipment|activities"]).toEqual({
        sources: [
          {
            source: viewRef("CogniteActivity"),
            properties: ["name", "equipment"],
          },
        ],
      });
    });

    it("builds edge connection traversal (Cognite3DObject.images360)", async () => {
      const query = await mapper.map<Object3D>({
        viewExternalId: "Cognite3DObject",
        select: {
          name: true,
          images360: { takenAt: true },
        },
      });

      const edgeKey = "Cognite3DObject|images360|<EdgeMarker>";
      expect(query.with[edgeKey]).toEqual({
        edges: {
          from: "Cognite3DObject",
          maxDistance: 1,
          filter: {
            equals: {
              property: ["edge", "type"],
              value: { space: "cdf_cdm", externalId: "image-360-annotation" },
            },
          },
          direction: "outwards",
        },
        limit: 10_000,
      });
      expect(query.with["Cognite3DObject|images360"]).toEqual({
        nodes: { from: edgeKey },
        limit: 10_000,
      });
      expect(query.select[edgeKey]).toEqual({});
      expect(query.select["Cognite3DObject|images360"]).toEqual({
        sources: [{ source: viewRef("Cognite360Image"), properties: ["takenAt"] }],
      });
    });

    it("maps nested filters through FilterMapper (parent.assetClass.code)", async () => {
      const query = await mapper.map<Asset>({
        viewExternalId: "CogniteAsset",
        select: { name: true },
        filters: {
          parent: { assetClass: { code: { eq: "PUMP" } } },
        },
      });

      const rootWith = query.with.CogniteAsset as { nodes: { filter: { and: unknown[] } } };
      expect(rootWith.nodes.filter.and).toHaveLength(2);
      expect(rootWith.nodes.filter.and[0]).toEqual({ hasData: [viewRef("CogniteAsset")] });
      expect(rootWith.nodes.filter.and[1]).toEqual({
        nested: {
          scope: ["cdf_cdm", "CogniteAsset/v1", "parent"],
          filter: {
            nested: {
              scope: ["cdf_cdm", "CogniteAsset/v1", "assetClass"],
              filter: {
                equals: {
                  property: ["cdf_cdm", "CogniteAssetClass/v1", "code"],
                  value: "PUMP",
                },
              },
            },
          },
        },
      });
    });

    it("combines AND filters on root and nested relations", async () => {
      const query = await mapper.map<Asset>({
        viewExternalId: "CogniteAsset",
        select: { name: true, parent: { name: true } },
        filters: {
          AND: [{ name: { prefix: "Pump" } }, { parent: { name: { eq: "Site Root" } } }],
        },
      });

      const rootWith = query.with.CogniteAsset as { nodes: { filter: { and: unknown[] } } };
      expect(rootWith.nodes.filter.and).toContainEqual({
        hasData: [viewRef("CogniteAsset")],
      });
      expect(rootWith.nodes.filter.and).toContainEqual({
        and: [
          { prefix: { property: ["cdf_cdm", "CogniteAsset/v1", "name"], value: "Pump" } },
          {
            nested: {
              scope: ["cdf_cdm", "CogniteAsset/v1", "parent"],
              filter: {
                equals: {
                  property: ["cdf_cdm", "CogniteAsset/v1", "name"],
                  value: "Site Root",
                },
              },
            },
          },
        ],
      });
    });

    it("maps a full query with nested selects, filters, sort, limit, and cursor", async () => {
      const query = await mapper.map<Asset>({
        viewExternalId: "CogniteAsset",
        select: {
          name: true,
          description: true,
          parent: { name: true, assetClass: { name: true } },
          children: { name: true },
        },
        filters: {
          name: { prefix: "WMT" },
          parent: { name: { exists: true } },
        },
        sort: { name: "ascending", externalId: "descending" },
        limit: 25,
        cursor: "page-2",
      });

      expect(query.cursors).toEqual({ CogniteAsset: "page-2" });
      expect(query.with.CogniteAsset).toMatchObject({ limit: 25 });
      expect(Object.keys(query.with).sort()).toEqual(
        [
          "CogniteAsset",
          "CogniteAsset|children",
          "CogniteAsset|parent",
          "CogniteAsset|parent|assetClass",
        ].sort(),
      );

      const rootWith = query.with.CogniteAsset as { nodes: { filter: { and: unknown[] } } };
      expect(rootWith.nodes.filter.and).toEqual(
        expect.arrayContaining([
          { hasData: [viewRef("CogniteAsset")] },
          { prefix: { property: ["cdf_cdm", "CogniteAsset/v1", "name"], value: "WMT" } },
          {
            nested: {
              scope: ["cdf_cdm", "CogniteAsset/v1", "parent"],
              filter: { exists: { property: ["cdf_cdm", "CogniteAsset/v1", "name"] } },
            },
          },
        ]),
      );

      expect(query.select.CogniteAsset).toEqual({
        sources: [
          { source: viewRef("CogniteAsset"), properties: ["name", "description", "parent"] },
        ],
      });
    });

    it("selects all scalar properties with _all without expanding relations", async () => {
      const query = await mapper.map({
        viewExternalId: "CogniteAsset",
        select: { _all: true },
        limit: 5,
      });

      const rootSelect = query.select.CogniteAsset as { sources: { properties: string[] }[] };
      const properties = rootSelect.sources[0]?.properties ?? [];

      expect(properties).toContain("name");
      expect(properties).toContain("description");
      expect(properties).toContain("parent");
      expect(properties).not.toContain("children");
      expect(query.with["CogniteAsset|parent"]).toBeUndefined();
      expect(query.with["CogniteAsset|children"]).toBeUndefined();
      expect(query.with.CogniteAsset).toMatchObject({ limit: 5 });
    });
  });
});
