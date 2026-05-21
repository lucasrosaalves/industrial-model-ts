import { z } from "zod";
import type { DatapointsDeleteRange, DatapointsRetrieveOptions } from "../types";

const dateSchema = z.date();

const nodeIdSchema = z.object({ space: z.string(), externalId: z.string() }).loose();

const retrieveOptionsSchema = z
  .object({
    timeSeries: z.array(nodeIdSchema),
    start: dateSchema.optional(),
    end: dateSchema.optional(),
  })
  .loose();

const deleteRangeSchema = z
  .object({
    timeSeries: z.object({ space: z.string(), externalId: z.string() }).loose(),
    start: dateSchema,
    end: dateSchema.optional(),
  })
  .loose();

function formatIssues(error: z.ZodError, prefix?: string): string[] {
  return error.issues.map((issue) => {
    const parts = prefix ? [prefix, ...issue.path] : [...issue.path];
    return `${parts.map(String).join(".")}: ${issue.message}`;
  });
}

export class DatapointsValidator {
  validateRetrieve(options: DatapointsRetrieveOptions): void {
    const result = retrieveOptionsSchema.safeParse(options);
    if (!result.success) {
      const messages = formatIssues(result.error);
      throw new Error(`Invalid datapoints options:\n- ${messages.join("\n- ")}`);
    }
  }

  validateDelete(ranges: DatapointsDeleteRange[]): void {
    const result = z.array(deleteRangeSchema).safeParse(ranges);
    if (!result.success) {
      const messages = formatIssues(result.error, "ranges");
      throw new Error(`Invalid datapoints options:\n- ${messages.join("\n- ")}`);
    }
  }
}
