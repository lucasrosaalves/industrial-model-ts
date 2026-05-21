import { z } from "zod";
import type { NodeId } from "../types";

const nodeIdSchema = z
  .object({
    space: z.string().min(1),
    externalId: z.string().min(1),
  })
  .loose();

const deleteItemsSchema = z.array(nodeIdSchema);

function formatIssues(error: z.ZodError, prefix: string): string[] {
  return error.issues.map((issue) => {
    const parts = [prefix, ...issue.path];
    return `${parts.map(String).join(".")}: ${issue.message}`;
  });
}

export class DeleteValidator {
  validateItems(items: NodeId[]): void {
    const result = deleteItemsSchema.safeParse(items);
    if (!result.success) {
      const messages = formatIssues(result.error, "items");
      throw new Error(`Invalid delete options:\n- ${messages.join("\n- ")}`);
    }
  }
}
