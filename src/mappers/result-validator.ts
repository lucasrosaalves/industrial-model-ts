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

const nodeMetadataSchema = {
  instanceType: z.literal("node").optional(),
  space: z.string(),
  externalId: z.string(),
  version: z.number(),
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

export class QueryResultValidator {
  constructor(private readonly viewMapper: ViewMapper) {}

  async parseItems(rootViewExternalId: string, items: Record<string, unknown>[]) {
    const rootView = await this.viewMapper.getView(rootViewExternalId);
    const schema = await this.buildResultSchema(rootView, MAX_DEPENDENCY_DEPTH);
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
  ): Promise<z.ZodObject<Record<string, z.ZodType>>> {
    const shape: Record<string, z.ZodType> = { ...nodeMetadataSchema };

    for (const [name, property] of Object.entries(view.properties)) {
      if (isViewPropertyDefinition(property)) {
        const relationSource = getDirectRelationSource(property);
        if (relationSource) {
          shape[name] = await this.buildRelationSchema(
            property,
            relationSource.externalId,
            remainingDepth,
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
        );
      }
    }

    return z.object(shape).strict();
  }

  private async buildRelationSchema(
    property: ViewDefinitionProperty,
    targetViewExternalId: string,
    remainingDepth: number,
  ): Promise<z.ZodType> {
    const isList = isListRelation(property);
    const fallbackSchema = isViewPropertyDefinition(property)
      ? propertyValueSchema(property, { dateMode: "coerce" })
      : z.unknown();

    if (remainingDepth <= 0) {
      return fallbackSchema.optional();
    }

    const targetView = await this.viewMapper.getView(targetViewExternalId);
    const nestedSchema = await this.buildResultSchema(targetView, remainingDepth - 1);

    if (isViewPropertyDefinition(property)) {
      const nestedRelationSchema = isList ? z.array(nestedSchema) : nestedSchema;
      return z.union([fallbackSchema, nestedRelationSchema]).optional();
    }

    return (isList ? z.array(nestedSchema) : nestedSchema).optional();
  }
}
