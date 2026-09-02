import type { InstancesAggregateResponse, InstancesAggregateValue } from "../cognite";
import type { AggregateDefinition, AggregateOptions, NodeId } from "../types";
import { getAggregateOpName, getSelectedGroupByKeys, resolveAggregateDefinitions } from "../utils";

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

function mapAggregateValue<TModel>(
  aggregateValue: InstancesAggregateValue | undefined,
  requested: AggregateDefinition<TModel>,
): { aggregate: string; property?: string; value: number } | undefined {
  if (aggregateValue?.value === undefined) return undefined;
  const aggregate = aggregateValue.aggregate ?? getAggregateOpName(requested);
  return aggregateValue.property != null
    ? { aggregate, property: aggregateValue.property, value: aggregateValue.value }
    : { aggregate, value: aggregateValue.value };
}

export class AggregateResultMapper {
  map<TModel>(
    response: InstancesAggregateResponse,
    options: Pick<AggregateOptions<TModel>, "groupBy" | "aggregate" | "aggregates">,
  ): Array<{
    group?: Record<string, unknown>;
    aggregates?: Array<{ aggregate: string; property?: string; value: number } | undefined>;
    aggregate?: { aggregate: string; property?: string; value: number };
  }> {
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
          ? requestedOps.map((def, index) => mapAggregateValue(item.aggregates[index], def))
          : undefined;
      const aggregate = aggregates?.[0];

      return {
        ...(group !== undefined ? { group } : {}),
        ...(aggregates !== undefined ? { aggregates } : {}),
        ...(aggregate !== undefined ? { aggregate } : {}),
      };
    });
  }
}
