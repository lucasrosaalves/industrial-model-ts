import type {
  FilterDefinition,
  InstancesAggregateDefinition,
  InstancesAggregateRequest,
} from "../cognite";
import { AGGREGATE_LIMIT } from "../constants";
import type { AggregateDefinition, AggregateOptions } from "../types";
import { AggregateValidator } from "./aggregate-validator";
import { FilterMapper } from "./filter-mapper";
import { getSelectedGroupByKeys, toViewReference } from "./utils";
import type { ViewMapper } from "./view-mapper";

export class AggregateMapper {
  private readonly filterMapper: FilterMapper;
  private readonly validator: AggregateValidator;

  constructor(private readonly viewMapper: ViewMapper) {
    this.filterMapper = new FilterMapper(viewMapper);
    this.validator = new AggregateValidator(viewMapper);
  }

  async map<TModel>(options: AggregateOptions<TModel>): Promise<InstancesAggregateRequest> {
    const { viewExternalId, filters, groupBy, aggregate } = options;
    const rootView = await this.viewMapper.getView(viewExternalId);
    await this.validator.validate(options, rootView);

    const filterParts = filters
      ? await this.filterMapper.map(filters as Record<string, unknown>, rootView)
      : [];
    const filter =
      filterParts.length === 0
        ? undefined
        : filterParts.length === 1
          ? filterParts[0]
          : ({ and: filterParts } satisfies FilterDefinition);

    return {
      view: toViewReference(rootView),
      instanceType: "node",
      limit: AGGREGATE_LIMIT,
      ...(filter !== undefined ? { filter } : {}),
      ...(groupBy ? { groupBy: getSelectedGroupByKeys(groupBy) } : {}),
      ...(aggregate ? { aggregates: [mapAggregateDefinition(aggregate)] } : {}),
    };
  }
}

function mapAggregateDefinition<TModel>(
  aggregate: AggregateDefinition<TModel>,
): InstancesAggregateDefinition {
  if ("count" in aggregate) {
    const property = aggregate.count;
    if (
      property != null &&
      typeof property === "object" &&
      !Array.isArray(property) &&
      Object.keys(property).length === 0
    ) {
      return { count: {} };
    }
    if (typeof property === "string") {
      return { count: { property } };
    }
    return { count: {} };
  }

  if ("avg" in aggregate) {
    return { avg: { property: aggregate.avg as string } };
  }
  if ("min" in aggregate) {
    return { min: { property: aggregate.min as string } };
  }
  if ("max" in aggregate) {
    return { max: { property: aggregate.max as string } };
  }
  if ("sum" in aggregate) {
    return { sum: { property: aggregate.sum as string } };
  }

  throw new Error("Invalid aggregate definition");
}
