import type { AggregateDefinition, AggregateOptions } from "../types";

export type AggregateOpName = "avg" | "min" | "max" | "sum" | "count";

export function normalizeAggregatesOption<TModel>(
  aggregates: AggregateOptions<TModel>["aggregates"],
): AggregateDefinition<TModel>[] {
  if (aggregates === undefined) return [];
  if (Array.isArray(aggregates)) {
    return [...aggregates];
  }
  return [aggregates as AggregateDefinition<TModel>];
}

export function resolveAggregateDefinitions<TModel>(
  options: Pick<AggregateOptions<TModel>, "aggregate" | "aggregates">,
): AggregateDefinition<TModel>[] {
  if (options.aggregates !== undefined) {
    return normalizeAggregatesOption(options.aggregates);
  }
  if (options.aggregate !== undefined) {
    return [options.aggregate];
  }
  return [];
}

export function getAggregateOpName<TModel>(def: AggregateDefinition<TModel>): AggregateOpName {
  if ("count" in def) return "count";
  if ("avg" in def) return "avg";
  if ("min" in def) return "min";
  if ("max" in def) return "max";
  if ("sum" in def) return "sum";
  throw new Error("Invalid aggregate definition");
}
