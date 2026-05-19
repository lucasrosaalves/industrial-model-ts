import { z } from "zod";
import type { ViewDefinition, ViewDefinitionProperty, ViewPropertyDefinition } from "../cognite";
import { MAX_LIMIT } from "../constants";
import type { QueryOptions } from "../types";
import { nodeIdSchema } from "../validation";
import {
  getDirectRelationSource,
  isEdgeConnection,
  isReverseDirectRelation,
  isViewPropertyDefinition,
} from "./utils";
import type { ViewMapper } from "./view-mapper";

const NODE_STRING_PROPERTIES = ["externalId", "space"] as const;
const NODE_NUMBER_PROPERTIES = ["createdTime", "deletedTime", "lastUpdatedTime"] as const;
const NODE_PROPERTIES = new Set<string>([...NODE_STRING_PROPERTIES, ...NODE_NUMBER_PROPERTIES]);
const SORT_DIRECTION_SCHEMA = z.enum(["ascending", "descending"]);

const recordSchema = z.record(z.string(), z.unknown());
const leafOps = new Set([
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isLeafFilter(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => leafOps.has(key));
}

function issuePath(path: PropertyKey[]): string {
  return path.length === 0 ? "query" : path.map(String).join(".");
}

function formatZodIssues(error: z.ZodError, path: Array<string | number>): string[] {
  return error.issues.map((issue) => `${issuePath([...path, ...issue.path])}: ${issue.message}`);
}

function getRelationTarget(property: ViewDefinitionProperty): string | null {
  if (isViewPropertyDefinition(property)) {
    return getDirectRelationSource(property)?.externalId ?? null;
  }
  if (isReverseDirectRelation(property) || isEdgeConnection(property)) {
    return property.source.externalId;
  }
  return null;
}

function baseValueSchema(
  property: ViewPropertyDefinition | "node-string" | "node-number",
): z.ZodType {
  if (property === "node-string") return z.string();
  if (property === "node-number") return z.number();

  switch (property.type.type) {
    case "text":
    case "enum":
      return z.string();
    case "int32":
    case "int64":
      return z.number().int();
    case "float32":
    case "float64":
      return z.number();
    case "boolean":
      return z.boolean();
    case "date":
    case "timestamp":
      return z.union([z.string(), z.date()]);
    case "direct":
      return nodeIdSchema;
    default:
      return z.union([z.string(), z.number(), z.boolean()]);
  }
}

function leafFilterSchema(
  property: ViewPropertyDefinition | "node-string" | "node-number",
): z.ZodType {
  const value = baseValueSchema(property);
  const isList = typeof property !== "string" && property.type.list === true;

  if (isList) {
    return z
      .object({
        containsAny: z.array(value).optional(),
        containsAll: z.array(value).optional(),
        exists: z.boolean().optional(),
      })
      .strict();
  }

  if (
    property === "node-string" ||
    (typeof property !== "string" && property.type.type === "text")
  ) {
    return z
      .object({
        eq: z.string().optional(),
        in: z.array(z.string()).optional(),
        prefix: z.string().optional(),
        exists: z.boolean().optional(),
      })
      .strict();
  }

  if (typeof property !== "string" && property.type.type === "enum") {
    return z
      .object({
        eq: z.string().optional(),
        in: z.array(z.string()).optional(),
        prefix: z.string().optional(),
        exists: z.boolean().optional(),
      })
      .strict();
  }

  if (
    property === "node-number" ||
    (typeof property !== "string" &&
      ["int32", "int64", "float32", "float64"].includes(property.type.type ?? ""))
  ) {
    return z
      .object({
        eq: value.optional(),
        in: z.array(value).optional(),
        gt: value.optional(),
        gte: value.optional(),
        lt: value.optional(),
        lte: value.optional(),
        exists: z.boolean().optional(),
      })
      .strict();
  }

  if (typeof property !== "string" && ["date", "timestamp"].includes(property.type.type ?? "")) {
    return z
      .object({
        eq: value.optional(),
        in: z.array(value).optional(),
        gt: value.optional(),
        gte: value.optional(),
        lt: value.optional(),
        lte: value.optional(),
        exists: z.boolean().optional(),
      })
      .strict();
  }

  if (typeof property !== "string" && property.type.type === "boolean") {
    return z
      .object({
        eq: z.boolean().optional(),
        exists: z.boolean().optional(),
      })
      .strict();
  }

  if (typeof property !== "string" && property.type.type === "direct") {
    return z
      .object({
        eq: nodeIdSchema.optional(),
        in: z.array(nodeIdSchema).optional(),
        exists: z.boolean().optional(),
      })
      .strict();
  }

  return z
    .object({
      eq: value.optional(),
      in: z.array(value).optional(),
      exists: z.boolean().optional(),
    })
    .strict();
}

export class QueryValidator {
  constructor(private readonly viewMapper: ViewMapper) {}

  async validate<TModel>(options: QueryOptions<TModel>, rootView: ViewDefinition): Promise<void> {
    const errors: string[] = [];

    errors.push(...this.validateOptionsShape(options, rootView));
    if (options.select !== undefined) {
      errors.push(...(await this.validateSelect(options.select, rootView, ["select"])));
    }
    if (options.filters !== undefined) {
      errors.push(...(await this.validateWhereInput(options.filters, rootView, ["filters"])));
    }
    if (options.sort !== undefined) {
      errors.push(...this.validateSort(options.sort, rootView, ["sort"]));
    }

    if (errors.length > 0) {
      throw new Error(`Invalid query options:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    }
  }

  private validateOptionsShape<TModel>(
    options: QueryOptions<TModel>,
    rootView: ViewDefinition,
  ): string[] {
    const schema = z
      .object({
        viewExternalId: z.literal(rootView.externalId),
        select: z.unknown().optional(),
        filters: z.unknown().optional(),
        sort: z.unknown().optional(),
        limit: z.union([z.literal(-1), z.number().int().positive().max(MAX_LIMIT)]).optional(),
        cursor: z.string().nullable().optional(),
      })
      .strict();

    const result = schema.safeParse(options);
    return result.success ? [] : formatZodIssues(result.error, []);
  }

  private async validateSelect(
    select: unknown,
    view: ViewDefinition,
    path: Array<string | number>,
  ): Promise<string[]> {
    const shape: Record<string, z.ZodType> = {
      _all: z.literal(true).optional(),
    };

    for (const property of NODE_PROPERTIES) {
      shape[property] = z.boolean().optional();
    }

    for (const [name, property] of Object.entries(view.properties)) {
      const target = getRelationTarget(property);
      if (target != null) {
        const nestedSelect = recordSchema;
        shape[name] = isViewPropertyDefinition(property)
          ? z.union([z.boolean(), nestedSelect]).optional()
          : nestedSelect.optional();
      } else {
        shape[name] = z.boolean().optional();
      }
    }

    const result = z.object(shape).strict().safeParse(select);
    if (!result.success) return formatZodIssues(result.error, path);
    if (!isRecord(select)) return [];

    const errors: string[] = [];
    for (const [name, value] of Object.entries(select)) {
      if (name === "_all" || value == null || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }

      const property = view.properties[name];
      if (!property) continue;

      const target = getRelationTarget(property);
      if (target == null) {
        errors.push(
          `${issuePath([...path, name])}: property "${name}" does not support nested select`,
        );
        continue;
      }

      const targetView = await this.viewMapper.getView(target);
      errors.push(...(await this.validateSelect(value, targetView, [...path, name])));
    }

    return errors;
  }

  async validateWhereInput(
    filters: unknown,
    view: ViewDefinition,
    path: Array<string | number>,
  ): Promise<string[]> {
    return this.validateFilters(filters, view, path);
  }

  private async validateFilters(
    filters: unknown,
    view: ViewDefinition,
    path: Array<string | number>,
  ): Promise<string[]> {
    const shape: Record<string, z.ZodType> = {
      AND: z.union([recordSchema, z.array(recordSchema)]).optional(),
      OR: z.array(recordSchema).optional(),
      NOT: z.union([recordSchema, z.array(recordSchema)]).optional(),
    };

    for (const property of NODE_STRING_PROPERTIES) {
      shape[property] = z.unknown().optional();
    }
    for (const property of NODE_NUMBER_PROPERTIES) {
      shape[property] = z.unknown().optional();
    }
    for (const property of Object.keys(view.properties)) {
      shape[property] = z.unknown().optional();
    }

    const result = z.object(shape).strict().safeParse(filters);
    if (!result.success) return formatZodIssues(result.error, path);
    if (!isRecord(filters)) return [];

    const errors: string[] = [];
    for (const [name, value] of Object.entries(filters)) {
      if (value == null) continue;

      if (name === "AND" || name === "OR" || name === "NOT") {
        const clauses = Array.isArray(value) ? value : [value];
        for (const [index, clause] of clauses.entries()) {
          errors.push(...(await this.validateFilters(clause, view, [...path, name, index])));
        }
        continue;
      }

      if (!isRecord(value)) {
        errors.push(`${issuePath([...path, name])}: Expected object`);
        continue;
      }

      const nodePropertyType = NODE_STRING_PROPERTIES.includes(
        name as (typeof NODE_STRING_PROPERTIES)[number],
      )
        ? "node-string"
        : NODE_NUMBER_PROPERTIES.includes(name as (typeof NODE_NUMBER_PROPERTIES)[number])
          ? "node-number"
          : null;

      if (nodePropertyType != null) {
        errors.push(...this.validateLeafFilter(value, nodePropertyType, [...path, name]));
        continue;
      }

      const property = view.properties[name];
      if (!property) continue;

      if (isViewPropertyDefinition(property)) {
        const target = getDirectRelationSource(property);
        if (target != null && !isLeafFilter(value)) {
          const targetView = await this.viewMapper.getView(target.externalId);
          errors.push(...(await this.validateFilters(value, targetView, [...path, name])));
        } else {
          errors.push(...this.validateLeafFilter(value, property, [...path, name]));
        }
        continue;
      }

      const target = getRelationTarget(property);
      if (target == null) {
        errors.push(`${issuePath([...path, name])}: property "${name}" does not support filters`);
        continue;
      }

      errors.push(
        `${issuePath([...path, name])}: filtering through "${name}" is not supported by the query mapper`,
      );
    }

    return errors;
  }

  private validateLeafFilter(
    value: Record<string, unknown>,
    property: ViewPropertyDefinition | "node-string" | "node-number",
    path: Array<string | number>,
  ): string[] {
    const result = leafFilterSchema(property).safeParse(value);
    return result.success ? [] : formatZodIssues(result.error, path);
  }

  private validateSort(
    sort: unknown,
    view: ViewDefinition,
    path: Array<string | number>,
  ): string[] {
    const shape: Record<string, z.ZodType> = {};

    for (const property of NODE_PROPERTIES) {
      shape[property] = SORT_DIRECTION_SCHEMA.optional();
    }
    for (const [name, property] of Object.entries(view.properties)) {
      if (isViewPropertyDefinition(property) && property.type.list !== true) {
        shape[name] = SORT_DIRECTION_SCHEMA.optional();
      }
    }

    const result = z.object(shape).strict().safeParse(sort);
    return result.success ? [] : formatZodIssues(result.error, path);
  }
}
