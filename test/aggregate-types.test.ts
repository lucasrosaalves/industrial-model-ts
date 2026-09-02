import { describe, expectTypeOf, it } from "vitest";
import { type IndustrialModel, IndustrialModelClient, type NodeId } from "../src/index.js";
import type { AggregateOptions, AggregateResultItemForOptions } from "../src/types.js";
import { COGNITE_CORE_DATA_MODEL, makeCogniteClientMock } from "./fixtures/index.js";

type Transform = IndustrialModel<{
  scaleX: number;
  translationX: number;
}>;

type BaseEvent = IndustrialModel<{
  assets: NodeId[];
  tags: string[];
  duration: number;
  externalId: string;
}>;

describe("aggregate typing", () => {
  it("infers group and aggregate fields from options", async () => {
    const client = makeCogniteClientMock();
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    const { items } = await model.aggregate<Transform>()({
      viewExternalId: "Cognite3DTransformation",
      groupBy: { translationX: true },
      aggregates: [{ avg: "scaleX" }],
    });

    type Item = (typeof items)[number];

    expectTypeOf<Item["group"]>().toEqualTypeOf<{ translationX: number } | undefined>();
    expectTypeOf<NonNullable<Item["aggregates"][0]>["property"]>().toEqualTypeOf<"scaleX">();
    expectTypeOf<NonNullable<Item["aggregates"][0]>["value"]>().toEqualTypeOf<number>();
    expectTypeOf<NonNullable<Item["aggregates"][0]>["aggregate"]>().toEqualTypeOf<"avg">();

    const first = items[0];
    if (first?.group) {
      first.group.translationX;
      // @ts-expect-error scaleX was not included in groupBy
      first.group.scaleX;
    }
    if (first) {
      first.aggregates[0]?.property;
      first.aggregates[0]?.value;
      first.aggregate?.value;
    }
  });

  it("infers count without property when using {}", async () => {
    const client = makeCogniteClientMock();
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    const { items } = await model.aggregate<Transform>()({
      viewExternalId: "Cognite3DTransformation",
      aggregates: { count: {} },
    });

    type Aggregate = NonNullable<(typeof items)[number]["aggregates"][0]>;
    type HasProperty = "property" extends keyof Aggregate ? true : false;

    expectTypeOf<HasProperty>().toEqualTypeOf<false>();
    expectTypeOf<Aggregate["aggregate"]>().toEqualTypeOf<"count">();
  });

  it("infers the legacy aggregate option as a single-op result", async () => {
    const client = makeCogniteClientMock();
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    const { items } = await model.aggregate<Transform>()({
      viewExternalId: "Cognite3DTransformation",
      aggregate: { avg: "scaleX" },
    });

    type Item = (typeof items)[number];
    expectTypeOf<NonNullable<Item["aggregates"][0]>["property"]>().toEqualTypeOf<"scaleX">();
    expectTypeOf<NonNullable<Item["aggregate"]>["property"]>().toEqualTypeOf<"scaleX">();
  });

  it("infers a multi-aggregate tuple from model.aggregate()", async () => {
    const client = makeCogniteClientMock();
    const model = new IndustrialModelClient(client, COGNITE_CORE_DATA_MODEL);

    const { items } = await model.aggregate<Transform>()({
      viewExternalId: "Cognite3DTransformation",
      groupBy: { translationX: true },
      aggregates: [{ count: "externalId" }, { sum: "scaleX" }],
    });

    type Item = (typeof items)[number];
    expectTypeOf<Item["aggregates"][0]>().toEqualTypeOf<
      | {
          aggregate: "count";
          property: "externalId";
          value: number;
        }
      | undefined
    >();
    expectTypeOf<Item["aggregates"][1]>().toEqualTypeOf<
      | {
          aggregate: "sum";
          property: "scaleX";
          value: number;
        }
      | undefined
    >();
  });

  it("allows list direct-relation groupBy and multi-aggregate in types", () => {
    const options = {
      viewExternalId: "BaseEvent",
      groupBy: { assets: true },
      aggregates: [{ count: "externalId" }, { sum: "duration" }],
    } as const satisfies AggregateOptions<BaseEvent>;

    type Item = AggregateResultItemForOptions<BaseEvent, typeof options>;

    expectTypeOf<NonNullable<Item["group"]>["assets"]>().toEqualTypeOf<NodeId>();
    expectTypeOf<Item["aggregates"][0]>().toEqualTypeOf<
      | {
          aggregate: "count";
          property: "externalId";
          value: number;
        }
      | undefined
    >();
    expectTypeOf<Item["aggregates"][1]>().toEqualTypeOf<
      | {
          aggregate: "sum";
          property: "duration";
          value: number;
        }
      | undefined
    >();

    expectTypeOf(options.groupBy).toEqualTypeOf<{ readonly assets: true }>();
  });

  it("allows list primitive groupBy with exploded scalar in group", () => {
    const options = {
      viewExternalId: "BaseEvent",
      groupBy: { tags: true },
      aggregates: [{ count: "externalId" }],
    } as const satisfies AggregateOptions<BaseEvent>;

    type Item = AggregateResultItemForOptions<BaseEvent, typeof options>;

    expectTypeOf<NonNullable<Item["group"]>["tags"]>().toEqualTypeOf<string>();
    expectTypeOf(options.groupBy).toEqualTypeOf<{ readonly tags: true }>();
  });

  it("rejects count on list properties in types", () => {
    const options: AggregateOptions<BaseEvent> = {
      viewExternalId: "BaseEvent",
      // @ts-expect-error list properties cannot be counted
      aggregates: [{ count: "tags" }],
    };

    expectTypeOf(options.viewExternalId).toEqualTypeOf<string>();
  });

  it("allows avg/sum/min/max on optional numeric properties", () => {
    type EquipmentVolume = IndustrialModel<{
      volume?: number;
    }>;

    const options = {
      viewExternalId: "EquipmentVolume",
      aggregates: { avg: "volume" },
    } as const satisfies AggregateOptions<EquipmentVolume>;

    type Item = AggregateResultItemForOptions<EquipmentVolume, typeof options>;
    expectTypeOf<NonNullable<Item["aggregates"][0]>["property"]>().toEqualTypeOf<"volume">();
  });
});
