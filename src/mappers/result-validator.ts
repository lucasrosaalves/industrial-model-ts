import { z } from "zod";
import type { ViewDefinition, ViewDefinitionProperty } from "../cognite";
import { MAX_DEPENDENCY_DEPTH } from "../constants";
import { propertyValueSchema } from "../validation";
import {
  getDirectRelationSource,
  isEdgeConnection,
  isListDirectRelation,
  isReverseDirectRelation,
  isViewPropertyDefinition,
} from "./utils";
import type { ViewMapper } from "./view-mapper";

type ResultSelect = {
  _all?: true;
  [property: string]: unknown;
};

const nodeMetadataSchema = {
  instanceType: z.literal("node").optional(),
  space: z.string(),
  externalId: z.string(),
  version: z.number().optional(),
  createdTime: z.number().optional(),
  deletedTime: z.number().optional(),
  lastUpdatedTime: z.number().optional(),
  _edges: z.record(z.string(), z.unknown()).optional(),
};

function isListRelation(property: ViewDefinitionProperty): boolean {
  if (isViewPropertyDefinition(property)) {
    return isListDirectRelation(property);
  }
  if (isReverseDirectRelation(property)) {
    return (
      property.connectionType === "multi_reverse_direct_relation" || property.targetsList === true
    );
  }
  return isEdgeConnection(property);
}

function isRecord(value: unknown): value is ResultSelect {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export class QueryResultValidator {
  constructor(private readonly viewMapper: ViewMapper) {}

  async parseItems(
    rootViewExternalId: string,
    items: Record<string, unknown>[],
    select?: ResultSelect,
  ) {
    const rootView = await this.viewMapper.getView(rootViewExternalId);
    const schema = await this.buildResultSchema(rootView, MAX_DEPENDENCY_DEPTH, select);
    const result = z.array(schema).safeParse(items);

    if (!result.success) {
      throw new Error(
        `Invalid query result:\n${result.error.issues
          .map((issue) => `- ${issue.path.map(String).join(".")}: ${issue.message}`)
          .join("\n")}`,
      );
    }

    return result.data;
  }

  private async buildResultSchema(
    view: ViewDefinition,
    remainingDepth: number,
    select?: ResultSelect,
  ): Promise<z.ZodObject<Record<string, z.ZodType>>> {
    const shape: Record<string, z.ZodType> = { ...nodeMetadataSchema };
    const includeAllProperties = select == null || select._all === true;

    for (const [name, property] of Object.entries(view.properties)) {
      const isSelected = includeAllProperties || name in select;
      if (!isSelected) continue;

      const nestedSelect = isRecord(select?.[name]) ? select[name] : undefined;

      if (isViewPropertyDefinition(property)) {
        const relationSource = getDirectRelationSource(property);
        if (relationSource) {
          shape[name] = await this.buildRelationSchema(
            property,
            relationSource.externalId,
            remainingDepth,
            nestedSelect,
          );
        } else {
          shape[name] = propertyValueSchema(property, { dateMode: "coerce" }).optional();
        }
        continue;
      }

      if (isReverseDirectRelation(property) || isEdgeConnection(property)) {
        shape[name] = await this.buildRelationSchema(
          property,
          property.source.externalId,
          remainingDepth,
          nestedSelect,
        );
      }
    }

    const schema = z.object(shape);
    return includeAllProperties ? schema.strict() : schema;
  }

  private async buildRelationSchema(
    property: ViewDefinitionProperty,
    targetViewExternalId: string,
    remainingDepth: number,
    select?: ResultSelect,
  ): Promise<z.ZodType> {
    const isList = isListRelation(property);
    const fallbackSchema = isViewPropertyDefinition(property)
      ? propertyValueSchema(property, { dateMode: "coerce" })
      : z.unknown();

    if (remainingDepth <= 0 || select == null) {
      return fallbackSchema.optional();
    }

    const targetView = await this.viewMapper.getView(targetViewExternalId);
    const nestedSchema = await this.buildResultSchema(targetView, remainingDepth - 1, select);

    if (isViewPropertyDefinition(property)) {
      const nestedRelationSchema = isList ? z.array(nestedSchema) : nestedSchema;
      return z.union([nestedRelationSchema, fallbackSchema]).optional();
    }

    return (isList ? z.array(nestedSchema) : nestedSchema).optional();
  }
}
