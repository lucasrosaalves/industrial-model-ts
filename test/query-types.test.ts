import { describe, expect, expectTypeOf, it } from "vitest";
import { type IndustrialModel, IndustrialModelClient, type NodeId } from "../src/index.js";
import {
  COGNITE_CORE_DATA_MODEL,
  makeCogniteAssetQueryResult,
  makeCogniteClientMock,
} from "./fixtures/index.js";

type CogniteAsset = IndustrialModel<
  {
    space: string;
    name: string;
    description: string;
    tags: string[];
    aliases: string[];
    sourceId: string;
    sourceCreatedTime: string;
    sourceUpdatedTime: string;
    parent?: NodeId;
  },
  {
    parent?: CogniteAsset;
  }
>;

describe("query typing", () => {
  it("infers nested relation fields from the select tree", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetQueryResult(),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    const { items } = await model.query<CogniteAsset>()({
      viewExternalId: "CogniteAsset",
      select: {
        parent: {
          name: true,
        },
      },
      filters: { name: { eq: "true" } },
    });

    type Item = (typeof items)[number];
    type Parent = NonNullable<Item["parent"]>;
    type HasDescription = "description" extends keyof Item ? true : false;
    type ParentHasDescription = "description" extends keyof Parent ? true : false;

    expectTypeOf<Parent["externalId"]>().toEqualTypeOf<string>();
    expectTypeOf<Parent["name"]>().toEqualTypeOf<string>();
    expectTypeOf<Parent["space"]>().toEqualTypeOf<string>();
    expectTypeOf<HasDescription>().toEqualTypeOf<false>();
    expectTypeOf<ParentHasDescription>().toEqualTypeOf<false>();

    expect(items[0]).toMatchObject({
      externalId: "root-asset",
      parent: {
        externalId: "parent-asset",
        name: "Parent Asset",
      },
    });
  });

  it("infers multiple nested relation fields from the select tree", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetQueryResult(),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    const { items } = await model.query<CogniteAsset>()({
      viewExternalId: "CogniteAsset",
      select: {
        parent: {
          name: true,
          aliases: true,
        },
      },
      filters: {
        parent: {
          space: { exists: true },
        },
      },
      sort: { name: "ascending" },
      limit: 10,
    });

    type Item = (typeof items)[number];
    type Parent = NonNullable<Item["parent"]>;
    type HasDescription = "description" extends keyof Item ? true : false;
    type ParentHasAliases = "aliases" extends keyof Parent ? true : false;
    type ParentHasDescription = "description" extends keyof Parent ? true : false;
    type ParentHasTags = "tags" extends keyof Parent ? true : false;

    expectTypeOf<HasDescription>().toEqualTypeOf<false>();
    expectTypeOf<Parent["name"]>().toEqualTypeOf<string>();
    expectTypeOf<Parent["aliases"]>().toEqualTypeOf<string[]>();
    expectTypeOf<ParentHasAliases>().toEqualTypeOf<true>();
    expectTypeOf<ParentHasDescription>().toEqualTypeOf<false>();
    expectTypeOf<ParentHasTags>().toEqualTypeOf<false>();

    const first = items[0];
    if (first) {
      // @ts-expect-error description was not selected at the root.
      first.description;

      if (first.parent) {
        first.parent.name;
        first.parent.aliases;
        // @ts-expect-error description was not selected on the nested parent.
        first.parent.description;
        // @ts-expect-error tags was not selected on the nested parent.
        first.parent.tags;
      }
    }
  });

  it("keeps relation ids for boolean selects and overlays nested selects on _all", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetQueryResult(),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    const { items: idItems } = await model.query<CogniteAsset>()({
      viewExternalId: "CogniteAsset",
      select: {
        parent: true,
      },
    });

    type IdItem = (typeof idItems)[number];

    expectTypeOf<IdItem["parent"]>().toEqualTypeOf<NodeId | undefined>();

    const { items: allItems } = await model.query<CogniteAsset>()({
      viewExternalId: "CogniteAsset",
      select: {
        _all: true,
        parent: {
          name: true,
        },
      },
    });

    type AllItem = (typeof allItems)[number];
    type AllParent = NonNullable<AllItem["parent"]>;
    type HasDescription = "description" extends keyof AllItem ? true : false;

    expectTypeOf<AllParent["externalId"]>().toEqualTypeOf<string>();
    expectTypeOf<AllParent["name"]>().toEqualTypeOf<string>();
    expectTypeOf<AllParent["space"]>().toEqualTypeOf<string>();
    expectTypeOf<HasDescription>().toEqualTypeOf<true>();
  });

  it("returns the full model shape when select is omitted", async () => {
    const client = makeCogniteClientMock({
      queryItems: makeCogniteAssetQueryResult(),
    });
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    const { items } = await model.query<CogniteAsset>()({
      viewExternalId: "CogniteAsset",
      filters: { name: { eq: "Root Asset" } },
    });

    type Item = (typeof items)[number];

    expectTypeOf<Item["name"]>().toEqualTypeOf<string>();
    expectTypeOf<Item["description"]>().toEqualTypeOf<string>();
    expectTypeOf<Item["parent"]>().toEqualTypeOf<NodeId | undefined>();
  });
});
