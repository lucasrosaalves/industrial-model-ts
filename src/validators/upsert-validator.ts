import { z } from "zod";
import type { EdgeConnection, ReverseDirectRelationConnection, ViewDefinition } from "../cognite";
import type { UpsertOptions } from "../types";
import { isEdgeConnection, isReverseDirectRelation, isViewPropertyDefinition } from "../utils";
import { propertyValueSchema } from "../validation";

const strictNodeIdSchema = z
  .object({
    space: z.string().min(1),
    externalId: z.string().min(1),
  })
  .strict();
const nodeIdLikeSchema = z
  .object({
    space: z.string().min(1),
    externalId: z.string().min(1),
  })
  .loose();

const optionsSchema = z
  .object({
    viewExternalId: z.string().min(1),
    items: z.array(z.record(z.string(), z.unknown())),
    onEdgeCreation: z.record(z.string(), z.function()).optional(),
    replace: z.boolean().optional(),
    edgeMode: z.enum(["append", "replace"]).optional(),
  })
  .strict();

function issuePath(path: PropertyKey[]): string {
  return path.length === 0 ? "upsert" : path.map(String).join(".");
}

function formatZodIssues(error: z.ZodError, path: Array<string | number>): string[] {
  return error.issues.map((issue) => `${issuePath([...path, ...issue.path])}: ${issue.message}`);
}

function relationValueSchema(
  property: ReverseDirectRelationConnection | EdgeConnection,
): z.ZodType {
  if (isReverseDirectRelation(property) && property.targetsList === true) {
    return z.never();
  }
  return z.union([nodeIdLikeSchema, z.array(nodeIdLikeSchema)]);
}

export class UpsertValidator {
  validate<TModel>(options: UpsertOptions<TModel>, rootView: ViewDefinition): void {
    const errors: string[] = [];

    const optionsResult = optionsSchema.safeParse(options);
    if (!optionsResult.success) {
      errors.push(...formatZodIssues(optionsResult.error, []));
    }

    if (options.viewExternalId !== rootView.externalId) {
      errors.push(
        `viewExternalId: expected "${rootView.externalId}", received "${options.viewExternalId}"`,
      );
    }

    for (const [index, item] of options.items.entries()) {
      errors.push(
        ...this.validateItem(item as Record<string, unknown>, rootView, ["items", index]),
      );
    }

    if (errors.length > 0) {
      throw new Error(`Invalid upsert options:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    }
  }

  private validateItem(
    item: Record<string, unknown>,
    view: ViewDefinition,
    path: Array<string | number>,
  ): string[] {
    const errors: string[] = [];

    const identityResult = strictNodeIdSchema.safeParse({
      space: item.space,
      externalId: item.externalId,
    });
    if (!identityResult.success) {
      errors.push(...formatZodIssues(identityResult.error, path));
    }

    for (const [name, value] of Object.entries(item)) {
      if (name === "space" || name === "externalId") continue;

      const property = view.properties[name];
      if (!property) {
        errors.push(`${issuePath([...path, name])}: unknown view property`);
        continue;
      }

      if (isViewPropertyDefinition(property)) {
        const schema =
          property.type.type === "direct"
            ? property.type.list === true
              ? z.array(nodeIdLikeSchema)
              : nodeIdLikeSchema
            : propertyValueSchema(property);
        const result = schema.safeParse(value);
        if (!result.success) errors.push(...formatZodIssues(result.error, [...path, name]));
        continue;
      }

      if (isReverseDirectRelation(property) || isEdgeConnection(property)) {
        const result = relationValueSchema(property).safeParse(value);
        if (!result.success) errors.push(...formatZodIssues(result.error, [...path, name]));
      }
    }

    return errors;
  }
}
