import { z } from "zod";
import type { ViewDefinition, ViewPropertyDefinition } from "./cognite";
import { isViewPropertyDefinition } from "./utils";

export interface BuildViewSchemaOptions {
  dateMode?: "preserve" | "coerce";
}

export const nodeIdSchema = z.object({
  space: z.string().min(1),
  externalId: z.string().min(1),
});

function dateSchema(dateMode: BuildViewSchemaOptions["dateMode"]): z.ZodType {
  if (dateMode === "coerce") {
    return z.preprocess(
      (value) => (typeof value === "string" || typeof value === "number" ? new Date(value) : value),
      z.date(),
    );
  }
  return z.union([z.string(), z.date()]);
}

export function propertyValueSchema(
  property: ViewPropertyDefinition,
  options: BuildViewSchemaOptions = {},
): z.ZodType {
  const type = property.type;
  let schema: z.ZodType;

  switch (type.type) {
    case "text":
    case "enum":
      schema = z.string();
      break;
    case "int32":
    case "int64":
      schema = z.number().int();
      break;
    case "float32":
    case "float64":
      schema = z.number();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "date":
    case "timestamp":
      schema = dateSchema(options.dateMode);
      break;
    case "direct":
      schema = nodeIdSchema;
      break;
    case "json":
      schema = z.unknown();
      break;
    default:
      schema = z.unknown();
      break;
  }

  return type.list === true ? z.array(schema) : schema;
}

export function buildViewSchema(
  view: ViewDefinition,
  options: BuildViewSchemaOptions = {},
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};

  for (const [name, property] of Object.entries(view.properties)) {
    if (isViewPropertyDefinition(property)) {
      shape[name] = propertyValueSchema(property, options).optional();
    }
  }

  return z.object(shape).strict();
}
