import { describe, expectTypeOf, it } from "vitest";
import type { CogniteCoreClient, CogniteCoreModel } from "../src/cognite-core/index.js";
import type {
  DeleteResult,
  IndustrialModel,
  IndustrialModelClient,
  NodeId,
  QueryResult,
  QueryResultItem,
  QuerySelect,
} from "../src/index.js";

type AssetClass = IndustrialModel<{
  code: string;
  name: string;
}>;

type Asset = IndustrialModel<
  {
    name: string;
    description?: string;
    score: number;
    active: boolean;
    parent?: NodeId;
    path?: Array<NodeId & { name?: string }>;
    tags: string[];
    sourceCreatedTime: Date;
  },
  {
    parent?: Asset;
    children?: Asset[];
    assetClass?: AssetClass;
  }
>;

function typecheckOnly(callback: () => void): void {
  void callback;
}

describe("public type contracts", () => {
  it("accepts supported query inputs and infers selected result shapes", () => {
    typecheckOnly(() => {
      const query = (null as unknown as IndustrialModelClient).query<Asset>();
      const select = {
        name: true,
        parent: { name: true },
        children: { name: true, score: true },
        assetClass: { code: true },
      } as const satisfies QuerySelect<Asset>;

      const result = query({
        viewExternalId: "CogniteAsset",
        select,
        filters: {
          AND: [
            { name: { prefix: "Pump" } },
            { name: { search: { query: "booster pump", operator: "AND" } } },
            { score: { gte: 10 } },
            { active: { eq: true } },
            { parent: { name: { eq: "Root Asset" } } },
            { tags: { containsAny: ["critical", "pump"] } },
            { tags: { search: { query: "critical" } } },
            { sourceCreatedTime: { gt: "2024-01-01T00:00:00.000Z" } },
          ],
          OR: [{ assetClass: { code: { eq: "PUMP" } } }, { description: { exists: false } }],
        },
        sort: {
          name: "ascending",
          score: "descending",
          parent: "ascending",
          sourceCreatedTime: "descending",
        },
        limit: 25,
        cursor: null,
      });

      expectTypeOf(result).toEqualTypeOf<
        Promise<QueryResult<QueryResultItem<Asset, typeof select>>>
      >();
      expectTypeOf<Awaited<typeof result>["items"][number]["name"]>().toEqualTypeOf<string>();
      expectTypeOf<Awaited<typeof result>["items"][number]["parent"]>().toEqualTypeOf<
        QueryResultItem<Asset, { readonly name: true }> | undefined
      >();
      expectTypeOf<Awaited<typeof result>["items"][number]["children"]>().toEqualTypeOf<
        QueryResultItem<Asset, { readonly name: true; readonly score: true }>[] | undefined
      >();
    });
  });

  it("provides generated Cognite Core entity relations", () => {
    typecheckOnly(() => {
      const core = null as unknown as CogniteCoreClient;
      const query = core.query("CogniteAsset");
      const select = {
        name: true,
        tags: true,
        parent: { name: true },
        children: { name: true },
        equipment: {
          name: true,
          equipmentType: { code: true },
        },
      } as const;

      const result = query({
        select,
        filters: {
          tags: { search: { query: "critical" } },
          parent: { name: { eq: "Root Asset" } },
          equipment: { equipmentType: { code: { eq: "pump" } } },
        },
      });

      type Item = Awaited<typeof result>["items"][number];

      expectTypeOf<Item["name"]>().toEqualTypeOf<string | undefined>();
      expectTypeOf<Item["tags"]>().toEqualTypeOf<string[] | undefined>();
      expectTypeOf<Item["parent"]>().toEqualTypeOf<
        QueryResultItem<CogniteCoreModel<"CogniteAsset">, { readonly name: true }> | undefined
      >();
      expectTypeOf<Item["children"]>().toEqualTypeOf<
        QueryResultItem<CogniteCoreModel<"CogniteAsset">, { readonly name: true }>[] | undefined
      >();

      const deleteResult = core.delete([{ space: "asset-space", externalId: "pump-1" }]);
      expectTypeOf(deleteResult).toEqualTypeOf<Promise<DeleteResult>>();

      // @ts-expect-error view names are constrained to Cognite Core views.
      core.query("CogniteMissingView");
    });
  });

  it("returns all model properties when no select is provided", () => {
    typecheckOnly(() => {
      const query = (null as unknown as IndustrialModelClient).query<Asset>();
      const result = query({
        viewExternalId: "CogniteAsset",
        filters: { parent: { eq: { space: "cdf_cdm", externalId: "root" } } },
        cursor: "next-page",
      });

      expectTypeOf(result).toEqualTypeOf<Promise<QueryResult<QueryResultItem<Asset>>>>();
      expectTypeOf<Awaited<typeof result>["items"][number]["name"]>().toEqualTypeOf<string>();
      expectTypeOf<Awaited<typeof result>["items"][number]["parent"]>().toEqualTypeOf<
        NodeId | undefined
      >();
      expectTypeOf<Awaited<typeof result>["cursor"]>().toEqualTypeOf<string | null>();
    });
  });

  it("rejects query inputs that do not match the model", () => {
    typecheckOnly(() => {
      const query = (null as unknown as IndustrialModelClient).query<Asset>();

      // @ts-expect-error unknown select property
      void query({
        viewExternalId: "CogniteAsset",
        select: {
          namme: true,
        },
      });

      // @ts-expect-error unknown nested select property
      void query({
        viewExternalId: "CogniteAsset",
        select: {
          parent: {
            namme: true,
          },
        },
      });

      // @ts-expect-error scalar properties cannot be expanded
      void query({
        viewExternalId: "CogniteAsset",
        select: {
          name: { code: true },
        },
      });

      // @ts-expect-error reverse relations require a nested selection
      void query({
        viewExternalId: "CogniteAsset",
        select: {
          children: true,
        },
      });

      void query({
        viewExternalId: "CogniteAsset",
        filters: {
          // @ts-expect-error unknown filter property
          namme: { eq: "Pump" },
        },
      });

      void query({
        viewExternalId: "CogniteAsset",
        filters: {
          name: {
            // @ts-expect-error string filters do not support numeric operators
            gt: "Pump",
          },
        },
      });

      void query({
        viewExternalId: "CogniteAsset",
        filters: {
          name: {
            search: {
              query: "Pump",
              // @ts-expect-error search operator must be OR or AND
              operator: "NEAR",
            },
          },
        },
      });

      void query({
        viewExternalId: "CogniteAsset",
        filters: {
          score: {
            // @ts-expect-error number filters require number values
            gte: "10",
          },
        },
      });

      void query({
        viewExternalId: "CogniteAsset",
        filters: {
          score: {
            // @ts-expect-error search is only available on string fields and string-list fields
            search: { query: "10" },
          },
        },
      });

      void query({
        viewExternalId: "CogniteAsset",
        filters: {
          tags: {
            // @ts-expect-error list filters require array values
            containsAny: "critical",
          },
        },
      });

      void query({
        viewExternalId: "CogniteAsset",
        sort: {
          // @ts-expect-error unknown sort property
          namme: "ascending",
        },
      });

      void query({
        viewExternalId: "CogniteAsset",
        sort: {
          // @ts-expect-error invalid sort direction
          name: "asc",
        },
      });

      void query({
        viewExternalId: "CogniteAsset",
        sort: {
          // @ts-expect-error array properties are not sortable
          tags: "ascending",
        },
      });

      void query({
        viewExternalId: "CogniteAsset",
        sort: {
          // @ts-expect-error relation-only fields are not sortable
          children: "ascending",
        },
      });

      void query({
        viewExternalId: "CogniteAsset",
        // @ts-expect-error cursor must be a string or null
        cursor: 123,
      });

      void query({
        viewExternalId: "CogniteAsset",
        // @ts-expect-error limit must be a number
        limit: "10",
      });
    });
  });

  it("accepts typed upsert patches and relation references", () => {
    typecheckOnly(() => {
      const upsert = (null as unknown as IndustrialModelClient).upsert<Asset>();
      const result = upsert({
        viewExternalId: "CogniteAsset",
        items: [
          {
            space: "asset-space",
            externalId: "pump-1",
            name: "Pump 1",
            parent: { space: "asset-space", externalId: "root" },
            path: [{ space: "asset-space", externalId: "root", name: "Root" }],
            children: [{ space: "asset-space", externalId: "child-1" }],
          },
        ],
        replace: true,
        edgeMode: "append",
        onEdgeCreation: {
          path: ({ startNode, endNode }) => ({
            space: startNode.space,
            externalId: `${startNode.externalId}:${endNode.externalId}`,
          }),
          children: ({ startNode, endNode, edgeType }) => ({
            space: edgeType.space,
            externalId: `${startNode.externalId}:${endNode.externalId}`,
          }),
        },
      });

      expectTypeOf<Awaited<typeof result>["items"][number]["externalId"]>().toEqualTypeOf<string>();
    });
  });

  it("rejects upsert inputs that do not match the model", () => {
    typecheckOnly(() => {
      const upsert = (null as unknown as IndustrialModelClient).upsert<Asset>();

      void upsert({
        viewExternalId: "CogniteAsset",
        items: [
          // @ts-expect-error space is required
          {
            externalId: "pump-1",
            name: "Pump 1",
          },
        ],
      });

      void upsert({
        viewExternalId: "CogniteAsset",
        items: [
          {
            space: "asset-space",
            externalId: "pump-1",
            // @ts-expect-error unknown upsert property
            namme: "Pump 1",
          },
        ],
      });

      void upsert({
        viewExternalId: "CogniteAsset",
        items: [
          {
            space: "asset-space",
            externalId: "pump-1",
            // @ts-expect-error relation fields accept NodeId references, not nested mutations
            children: [{ space: "asset-space", externalId: "child-1", name: "Child" }],
          },
        ],
      });

      void upsert({
        viewExternalId: "CogniteAsset",
        items: [{ space: "asset-space", externalId: "pump-1" }],
        // @ts-expect-error delete is not part of the public upsert API
        delete: [{ space: "asset-space", externalId: "old-pump" }],
      });

      void upsert({
        viewExternalId: "CogniteAsset",
        items: [{ space: "asset-space", externalId: "pump-1" }],
        // @ts-expect-error Cognite apply flags are intentionally not exposed
        skipOnVersionConflict: false,
      });

      void upsert({
        viewExternalId: "CogniteAsset",
        items: [{ space: "asset-space", externalId: "pump-1" }],
        // @ts-expect-error edgeMode must be append or replace
        edgeMode: "merge",
      });

      void upsert({
        viewExternalId: "CogniteAsset",
        items: [{ space: "asset-space", externalId: "pump-1" }],
        onEdgeCreation: {
          // @ts-expect-error single NodeId properties do not create edges
          parent: ({ startNode }) => startNode,
        },
      });

      void upsert({
        viewExternalId: "CogniteAsset",
        items: [{ space: "asset-space", externalId: "pump-1" }],
        onEdgeCreation: {
          // @ts-expect-error edge callbacks are configured per known relation property
          missingRelation: ({ startNode }) => startNode,
        },
      });
    });
  });

  it("accepts delete inputs that include node identities", () => {
    typecheckOnly(() => {
      const model = null as unknown as IndustrialModelClient;
      const result = model.delete([
        { space: "asset-space", externalId: "pump-1" },
        { space: "asset-space", externalId: "pump-2", name: "Pump 2" },
      ]);

      expectTypeOf(result).toEqualTypeOf<Promise<DeleteResult>>();
      expectTypeOf<
        Awaited<typeof result>["items"][number]["instanceType"]
      >().toEqualTypeOf<"node">();
    });
  });

  it("rejects delete inputs without node identities", () => {
    typecheckOnly(() => {
      const model = null as unknown as IndustrialModelClient;

      void model.delete([
        // @ts-expect-error space is required
        { externalId: "pump-1" },
      ]);

      void model.delete([
        // @ts-expect-error externalId is required
        { space: "asset-space" },
      ]);

      // @ts-expect-error explicit delete item type must include NodeId fields
      void model.delete<{ name: string }>([{ name: "Pump 1" }]);
    });
  });
});
