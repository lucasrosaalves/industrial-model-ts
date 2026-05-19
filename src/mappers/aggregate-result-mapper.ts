import type { InstancesAggregateResponse } from "../cognite";
import type { AggregateGroupBy, AggregateOptions, AggregateResultItem, NodeId } from "../types";
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

export class AggregateResultMapper {
  map<TModel, TGroupBy extends AggregateGroupBy<TModel> | undefined>(
    response: InstancesAggregateResponse,
    options: Pick<AggregateOptions<TModel>, "groupBy" | "aggregate">,
  ): AggregateResultItem<TModel, TGroupBy>[] {
    const groupByKeys = options.groupBy ? getSelectedGroupByKeys(options.groupBy) : [];

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

      const aggregateValue = item.aggregates[0];
      const aggregate =
        aggregateValue?.value !== undefined
          ? aggregateValue.property != null
            ? { property: aggregateValue.property, value: aggregateValue.value }
            : { value: aggregateValue.value }
          : undefined;

      return {
        ...(group !== undefined ? { group } : {}),
        ...(aggregate !== undefined ? { aggregate } : {}),
      } as AggregateResultItem<TModel, TGroupBy>;
    });
  }
}
