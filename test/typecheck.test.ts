import { describe, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type {
  IndustrialModel,
  IndustrialModelClient,
  NodeId,
  nodeIdSchema,
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

  it("exposes NodeId as the runtime schema output type", () => {
    expectTypeOf<z.infer<typeof nodeIdSchema>>().toEqualTypeOf<NodeId>();
  });
});
