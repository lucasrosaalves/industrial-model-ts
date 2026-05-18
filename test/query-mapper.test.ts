import { describe, expect, it } from "vitest";
import { createQueryMapper, getCogniteCoreView } from "./fixtures/index.js";

describe("QueryMapper", () => {
  const mapper = createQueryMapper();
  const assetView = getCogniteCoreView("CogniteAsset");

  it("builds a root nodes query with hasData and limit", async () => {
    const query = await mapper.map({
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

  it("includes nested direct-relation select (parent)", async () => {
    type Asset = { name: string; parent?: { name: string } };
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
    type Asset = { name: string; children?: { name: string } };
    const query = await mapper.map<Asset, { children: { name: string } }>({
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
    const query = await mapper.map({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      sortClauses: { name: "ascending", externalId: "descending" },
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
    const query = await mapper.map({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      cursor: "cursor-abc",
    });

    expect(query.cursors).toEqual({ CogniteAsset: "cursor-abc" });
  });

  it("passes empty-string cursor (only null/undefined are omitted)", async () => {
    const query = await mapper.map({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      cursor: "",
    });

    expect(query.cursors).toEqual({ CogniteAsset: "" });
  });

  it("omits cursor when null or undefined", async () => {
    const withNull = await mapper.map({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      cursor: null,
    });
    const withUndefined = await mapper.map({
      viewExternalId: "CogniteAsset",
      select: { name: true },
      cursor: undefined,
    });

    expect(withNull.cursors).toEqual({});
    expect(withUndefined.cursors).toEqual({});
  });

  it("does not reference undefined views from the fixture", async () => {
    await expect(
      mapper.map({
        viewExternalId: "NonExistentView",
        select: { name: true },
      }),
    ).rejects.toThrow(/"NonExistentView"/);

    expect(assetView.externalId).toBe("CogniteAsset");
  });

  describe("complex queries", () => {
    const viewRef = (externalId: string) => ({
      type: "view" as const,
      space: "cdf_cdm",
      externalId,
      version: "v1",
    });

    it("builds two-level nested direct-relation chain (parent.assetClass)", async () => {
      type Asset = {
        name: string;
        parent?: { assetClass?: { name: string; code: string } };
      };
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
      type Asset = { name: string; parent?: { parent?: { name: string } } };
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
      type Asset = { name: string; parent?: unknown };
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
      type Equipment = {
        name: string;
        asset?: { name: string };
        activities?: { name: string };
      };
      const query = await mapper.map<Equipment, { activities: { name: string } }>({
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
      type Object3D = { name: string; images360?: { takenAt: string } };
      const query = await mapper.map<Object3D, { images360: { takenAt: string } }>({
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
      type Asset = {
        name: string;
        parent?: { assetClass?: { code: string } };
      };
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
      type Asset = {
        name: string;
        parent?: { name: string };
      };
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
      type Asset = {
        name: string;
        description: string;
        externalId: string;
        parent?: {
          name: string;
          assetClass?: { name: string };
        };
        children?: { name: string };
      };
      const query = await mapper.map<Asset, { children: { name: string } }>({
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
        sortClauses: { name: "ascending", externalId: "descending" },
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
