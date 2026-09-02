import { z } from "zod";
import type { ViewDefinition } from "../cognite";
import { MAX_AGGREGATES, MAX_GROUP_BY } from "../constants";
import type { ViewMapper } from "../mappers/view-mapper";
import type { AggregateDefinition, AggregateGroupBy, AggregateOptions } from "../types";
import {
  getDirectRelationSource,
  getSelectedGroupByKeys,
  isCountableProperty,
  isGroupableProperty,
  isNumericProperty,
  isViewPropertyDefinition,
  normalizeAggregatesOption,
  resolveAggregateDefinitions,
} from "../utils";
import { QueryValidator } from "./query-validator";

const NODE_COUNT_PROPERTIES = new Set(["externalId", "space"]);

function issuePath(path: PropertyKey[]): string {
  return path.length === 0 ? "aggregates" : path.map(String).join(".");
}

function formatZodIssues(error: z.ZodError, path: Array<string | number>): string[] {
  return error.issues.map((issue) => `${issuePath([...path, ...issue.path])}: ${issue.message}`);
}

function isEmptyObject(value: unknown): value is Record<string, never> {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

export class AggregateValidator {
  private readonly queryValidator: QueryValidator;

  constructor(viewMapper: ViewMapper) {
    this.queryValidator = new QueryValidator(viewMapper);
  }

  async validate<TModel>(
    options: AggregateOptions<TModel>,
    rootView: ViewDefinition,
  ): Promise<void> {
    const errors: string[] = [];

    errors.push(...this.validateOptionsShape(options, rootView));

    const selectedGroupBy = options.groupBy ? getSelectedGroupByKeys(options.groupBy) : [];
    const aggregateDefs = resolveAggregateDefinitions(options);
    const hasAggregates = aggregateDefs.length > 0;

    if (options.aggregate !== undefined && options.aggregates !== undefined) {
      errors.push("aggregates: cannot set both aggregate and aggregates");
    }

    if (
      options.aggregates !== undefined &&
      normalizeAggregatesOption(options.aggregates).length === 0
    ) {
      errors.push("aggregates: must contain at least one aggregate definition");
    }

    if (aggregateDefs.length > MAX_AGGREGATES) {
      errors.push(`aggregates: at most ${MAX_AGGREGATES} operations can be requested`);
    }

    if (selectedGroupBy.length === 0 && !hasAggregates) {
      errors.push("aggregates: either groupBy, aggregate, or aggregates must be provided");
    }

    if (options.filters !== undefined) {
      errors.push(
        ...(await this.queryValidator.validateWhereInput(options.filters, rootView, ["filters"])),
      );
    }

    if (options.groupBy !== undefined) {
      errors.push(...this.validateGroupBy(options.groupBy, rootView, ["groupBy"]));
    }

    for (const { def, path } of this.aggregateDefEntries(options)) {
      errors.push(
        ...this.validateAggregate(
          def as AggregateDefinition<Record<string, unknown>>,
          rootView,
          path,
        ),
      );
    }

    if (errors.length > 0) {
      throw new Error(
        `Invalid aggregate options:\n${errors.map((error) => `- ${error}`).join("\n")}`,
      );
    }
  }

  private aggregateDefEntries<TModel>(
    options: AggregateOptions<TModel>,
  ): Array<{ def: AggregateDefinition<TModel>; path: Array<string | number> }> {
    if (options.aggregates !== undefined) {
      const defs = normalizeAggregatesOption(options.aggregates);
      if (Array.isArray(options.aggregates)) {
        return defs.flatMap((def, index) =>
          def === undefined ? [] : [{ def, path: ["aggregates", index] }],
        );
      }
      return defs.map((def) => ({ def, path: ["aggregates"] }));
    }
    if (options.aggregate !== undefined) {
      return [{ def: options.aggregate, path: ["aggregate"] }];
    }
    return [];
  }

  private validateOptionsShape<TModel>(
    options: AggregateOptions<TModel>,
    rootView: ViewDefinition,
  ): string[] {
    const schema = z
      .object({
        viewExternalId: z.literal(rootView.externalId),
        filters: z.unknown().optional(),
        groupBy: z.unknown().optional(),
        aggregates: z.unknown().optional(),
        aggregate: z.unknown().optional(),
      })
      .strict();

    const result = schema.safeParse(options);
    return result.success ? [] : formatZodIssues(result.error, []);
  }

  private validateGroupBy(
    groupBy: AggregateGroupBy<unknown>,
    view: ViewDefinition,
    path: Array<string | number>,
  ): string[] {
    const shape: Record<string, z.ZodType> = {};
    for (const [name, property] of Object.entries(view.properties)) {
      if (isGroupableProperty(property)) {
        shape[name] = z.literal(true).optional();
      }
    }

    const result = z.object(shape).strict().safeParse(groupBy);
    if (!result.success) {
      return formatZodIssues(result.error, path);
    }

    const selected = getSelectedGroupByKeys(groupBy as Record<string, boolean | undefined>);
    const errors: string[] = [];

    if (selected.length === 0) {
      errors.push(`${issuePath(path)}: at least one property must be set to true`);
    }
    if (selected.length > MAX_GROUP_BY) {
      errors.push(`${issuePath(path)}: at most ${MAX_GROUP_BY} properties can be grouped`);
    }

    for (const name of selected) {
      const property = view.properties[name];
      if (!property || !isGroupableProperty(property)) {
        errors.push(`${issuePath([...path, name])}: property "${name}" cannot be used in groupBy`);
      }
    }

    return errors;
  }

  private validateAggregate(
    aggregate: AggregateDefinition<unknown>,
    view: ViewDefinition,
    path: Array<string | number>,
  ): string[] {
    if ("count" in aggregate) {
      const property = aggregate.count;
      if (isEmptyObject(property)) {
        return [];
      }
      if (typeof property === "string") {
        if (NODE_COUNT_PROPERTIES.has(property)) {
          return [];
        }
        const viewProperty = view.properties[property];
        if (!viewProperty || !isCountableProperty(viewProperty)) {
          return [`${issuePath([...path, "count"])}: property "${property}" cannot be counted`];
        }
        return [];
      }
      return [`${issuePath([...path, "count"])}: invalid count property`];
    }

    let propertyName: string | undefined;
    let numericOp: "avg" | "min" | "max" | "sum" | null = null;
    if ("avg" in aggregate) {
      numericOp = "avg";
      propertyName = aggregate.avg as string;
    } else if ("min" in aggregate) {
      numericOp = "min";
      propertyName = aggregate.min as string;
    } else if ("max" in aggregate) {
      numericOp = "max";
      propertyName = aggregate.max as string;
    } else if ("sum" in aggregate) {
      numericOp = "sum";
      propertyName = aggregate.sum as string;
    }

    if (numericOp == null) {
      return [`${issuePath(path)}: unknown aggregate operation`];
    }
    if (typeof propertyName !== "string") {
      return [`${issuePath(path)}: aggregate property must be a string`];
    }

    const property = view.properties[propertyName];
    if (!property || !isViewPropertyDefinition(property) || !isNumericProperty(property)) {
      return [
        `${issuePath([...path, numericOp])}: property "${propertyName}" must be a numeric view property`,
      ];
    }

    if (getDirectRelationSource(property) != null) {
      return [
        `${issuePath([...path, numericOp])}: property "${propertyName}" is a relation and cannot be aggregated`,
      ];
    }

    return [];
  }
}
