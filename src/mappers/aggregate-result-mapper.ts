import type { InstancesAggregateResponse, InstancesAggregateValue } from "../cognite";
import type {
  AggregateDefinition,
  AggregateGroupBy,
  AggregateOptions,
  AggregateResultItem,
  NodeId,
} from "../types";
import { getSelectedGroupByKeys } from "../utils";

function isNodeId(value: unknown): value is NodeId {
  return (
    value != null &&
    typeof value === "object" &&
    "space" in value &&
    "externalId" in value &&
    typeof (value as NodeId).space === "string" &&
    typeof (value as NodeId).externalId === "string"
  );
}

function resolveAggregateDefinitions<TModel>(
  options: Pick<AggregateOptions<TModel>, "aggregates">,
): AggregateDefinition<TModel>[] {
  if (options.aggregates !== undefined) {
    return [...options.aggregates];
  }
  return [];
}

function mapAggregateValue(
  aggregateValue: InstancesAggregateValue | undefined,
): { property?: string; value: number } | undefined {
  if (aggregateValue?.value === undefined) return undefined;
  return aggregateValue.property != null
    ? { property: aggregateValue.property, value: aggregateValue.value }
    : { value: aggregateValue.value };
}

export class AggregateResultMapper {
  map<TModel, TGroupBy extends AggregateGroupBy<TModel> | undefined>(
    response: InstancesAggregateResponse,
    options: Pick<AggregateOptions<TModel>, "groupBy" | "aggregates">,
  ): AggregateResultItem<TModel, TGroupBy>[] {
    const groupByKeys = options.groupBy ? getSelectedGroupByKeys(options.groupBy) : [];
    const requestedOps = resolveAggregateDefinitions(options);

    return response.items.map((item) => {
      let group: Record<string, unknown> | undefined;
      if (item.group != null && groupByKeys.length > 0) {
        group = {};
        for (const key of groupByKeys) {
          const value = item.group[key];
          if (value === undefined) continue;
          group[key] = isNodeId(value)
            ? { space: value.space, externalId: value.externalId }
            : value;
        }
        if (Object.keys(group).length === 0) {
          group = undefined;
        }
      }

      const aggregates =
        requestedOps.length > 0
          ? item.aggregates
              .map(mapAggregateValue)
              .filter((value): value is NonNullable<typeof value> => value !== undefined)
          : undefined;

      return {
        ...(group !== undefined ? { group } : {}),
        ...(aggregates !== undefined && aggregates.length > 0 ? { aggregates } : {}),
      } as unknown as AggregateResultItem<TModel, TGroupBy>;
    });
  }
}
