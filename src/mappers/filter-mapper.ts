import type { FilterDefinition, ViewDefinition } from "../cognite";
import { getDirectRelationSource, getPropertyRef, isViewPropertyDefinition } from "./utils";
import type { ViewMapper } from "./view-mapper";

const LEAF_OPS = new Set([
  "eq",
  "in",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
  "prefix",
  "containsAny",
  "containsAll",
]);

function isLeafFilter(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((k) => LEAF_OPS.has(k));
}

export class FilterMapper {
  constructor(private readonly viewMapper: ViewMapper) {}

  async map(input: Record<string, unknown>, rootView: ViewDefinition): Promise<FilterDefinition[]> {
    const result: FilterDefinition[] = [];

    for (const [key, value] of Object.entries(input)) {
      if (value == null) continue;

      if (key === "AND") {
        const clauses = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
        const inner = await Promise.all(clauses.map((c) => this.whereInputToSingle(c, rootView)));
        result.push({ and: inner });
      } else if (key === "OR") {
        const clauses = value as Record<string, unknown>[];
        const branches = await Promise.all(
          clauses.map((c) => this.whereInputToSingle(c, rootView)),
        );
        result.push({ or: branches });
      } else if (key === "NOT") {
        const clauses = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
        const [firstClause, ...restClauses] = clauses;
        const combined: Record<string, unknown> =
          restClauses.length === 0 && firstClause !== undefined ? firstClause : { AND: clauses };
        result.push({ not: await this.whereInputToSingle(combined, rootView) });
      } else {
        const filterValue = value as Record<string, unknown>;
        const property = getPropertyRef(key, rootView);
        if (isLeafFilter(filterValue)) {
          result.push(...this.leafToFilterDefs(property, filterValue));
        } else {
          const targetView = await this.getNestedTargetView(key, rootView);
          const innerFilter = await this.whereInputToSingle(filterValue, targetView);
          result.push({ nested: { scope: property, filter: innerFilter } });
        }
      }
    }

    return result;
  }

  private async whereInputToSingle(
    input: Record<string, unknown>,
    rootView: ViewDefinition,
  ): Promise<FilterDefinition> {
    const filters = await this.map(input, rootView);
    const [firstFilter, ...restFilters] = filters;
    if (restFilters.length === 0 && firstFilter !== undefined) {
      return firstFilter;
    }
    return { and: filters };
  }

  private leafToFilterDefs(
    property: string[],
    filter: Record<string, unknown>,
  ): FilterDefinition[] {
    const result: FilterDefinition[] = [];

    if ("eq" in filter && filter.eq !== undefined) {
      result.push({
        equals: { property, value: this.coerceValue(filter.eq) as string | number | boolean },
      });
    }
    if ("in" in filter && filter.in !== undefined) {
      result.push({
        in: { property, values: this.coerceValue(filter.in) as (string | number | boolean)[] },
      });
    }
    if ("gt" in filter && filter.gt !== undefined) {
      result.push({ range: { property, gt: this.coerceValue(filter.gt) as number | string } });
    }
    if ("gte" in filter && filter.gte !== undefined) {
      result.push({ range: { property, gte: this.coerceValue(filter.gte) as number | string } });
    }
    if ("lt" in filter && filter.lt !== undefined) {
      result.push({ range: { property, lt: this.coerceValue(filter.lt) as number | string } });
    }
    if ("lte" in filter && filter.lte !== undefined) {
      result.push({ range: { property, lte: this.coerceValue(filter.lte) as number | string } });
    }
    if ("exists" in filter) {
      if (filter.exists === true) {
        result.push({ exists: { property } });
      } else if (filter.exists === false) {
        result.push({ not: { exists: { property } } });
      }
    }
    if ("prefix" in filter && filter.prefix !== undefined) {
      result.push({ prefix: { property, value: this.coerceValue(filter.prefix) as string } });
    }
    if ("containsAll" in filter && filter.containsAll !== undefined) {
      result.push({
        containsAll: {
          property,
          values: this.coerceValue(filter.containsAll) as (string | number | boolean)[],
        },
      });
    }
    if ("containsAny" in filter && filter.containsAny !== undefined) {
      result.push({
        containsAny: {
          property,
          values: this.coerceValue(filter.containsAny) as (string | number | boolean)[],
        },
      });
    }

    return result;
  }

  private async getNestedTargetView(
    property: string,
    rootView: ViewDefinition,
  ): Promise<ViewDefinition> {
    const viewProp = rootView.properties[property];
    if (!viewProp || !isViewPropertyDefinition(viewProp)) {
      throw new Error(`Property "${property}" is not a mapped property`);
    }
    const source = getDirectRelationSource(viewProp);
    if (!source) throw new Error(`Property "${property}" has no relation source`);
    return this.viewMapper.getView(source.externalId);
  }

  private coerceValue(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((v) => this.coerceValue(v));
    return value;
  }
}
