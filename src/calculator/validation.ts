import { z } from "zod";

const nodeIdSchema = z.object({
  space: z.string().min(1),
  externalId: z.string().min(1),
});

const aggregateSchema = z.enum([
  "average",
  "max",
  "min",
  "count",
  "sum",
  "interpolation",
  "stepInterpolation",
  "totalVariation",
  "continuousVariance",
  "discreteVariance",
]);

const reducerSchema = z.enum(["min", "max", "sum", "average"]);
const alignmentSchema = z.enum(["intersect", "strict"]);

// `alias`, `granularity` and `formula` are deliberately unconstrained beyond
// their type: an empty formula is the formula engine's error to raise, not
// this schema's.
const timeSeriesFields = {
  alias: z.string(),
  aggregateType: aggregateSchema.optional(),
  granularity: z.string().optional(),
  // z.number() rejects NaN and ±Infinity.
  fillValue: z.number().optional(),
};

type GranularityCheckable = {
  alias: string;
  aggregateType?: string | undefined;
  granularity?: string | undefined;
};

/** An aggregate is meaningless without the granularity that buckets it. */
function checkGranularity(parameter: GranularityCheckable, context: z.RefinementCtx): void {
  if (parameter.aggregateType !== undefined && parameter.granularity === undefined) {
    context.addIssue({
      code: "custom",
      message:
        `Missing granularity for '${parameter.alias}' ` +
        `with aggregate '${parameter.aggregateType}'`,
    });
  }
}

const constantParameterSchema = z.object({
  type: z.literal("constant"),
  alias: z.string(),
  value: z.number(),
});

const timeSeriesParameterSchema = z
  .object({
    type: z.literal("single_timeseries"),
    timeSeries: nodeIdSchema,
    ...timeSeriesFields,
  })
  .superRefine(checkGranularity);

const multiTimeSeriesParameterSchema = z
  .object({
    type: z.literal("multi_timeseries"),
    timeSeries: z.array(nodeIdSchema),
    reducer: reducerSchema,
    ...timeSeriesFields,
  })
  .superRefine((parameter, context) => {
    checkGranularity(parameter, context);

    if (parameter.timeSeries.length < 2) {
      context.addIssue({
        code: "custom",
        message:
          `'${parameter.alias}' must reference at least two timeseries; ` +
          "use a single-timeseries parameter for one",
      });
    }

    const keys = parameter.timeSeries.map(({ space, externalId }) => `${space}:${externalId}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        message: `'${parameter.alias}' has duplicate timeseries instance ids`,
      });
    }
  });

const parameterSchema = z.discriminatedUnion("type", [
  constantParameterSchema,
  timeSeriesParameterSchema,
  multiTimeSeriesParameterSchema,
]);

const querySchema = z
  .object({
    formula: z.string(),
    parameters: z.array(parameterSchema),
    alignment: alignmentSchema.optional(),
    bucketGranularity: z.string().optional(),
  })
  .superRefine((query, context) => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const parameter of query.parameters) {
      if (seen.has(parameter.alias)) {
        duplicates.add(parameter.alias);
      }
      seen.add(parameter.alias);
    }
    if (duplicates.size > 0) {
      context.addIssue({
        code: "custom",
        message: `duplicate parameter alias(es): ${[...duplicates].sort().join(", ")}`,
        path: ["parameters"],
      });
    }

    if (query.alignment === "strict") {
      const filled = query.parameters
        .filter((parameter) => parameter.type !== "constant" && parameter.fillValue !== undefined)
        .map((parameter) => parameter.alias);
      if (filled.length > 0) {
        context.addIssue({
          code: "custom",
          message:
            "fillValue needs alignment 'intersect'; strict alignment never fills: " +
            filled.join(", "),
          path: ["parameters"],
        });
      }
    }
  });

function formatIssues(error: z.ZodError, prefix: string): string[] {
  return error.issues.map((issue) => {
    const path = [prefix, ...issue.path].map(String).join(".");
    return `${path}: ${issue.message}`;
  });
}

/**
 * Rejects a query the calculator cannot evaluate.
 *
 * `Calculator` runs it for you; call it directly to fail early on a query
 * built from untrusted input, such as a JSON payload.
 */
export function validateCalculatorQuery(query: unknown): void {
  validateCalculatorQueries([query]);
}

/** Validates several queries, reporting every problem across all of them. */
export function validateCalculatorQueries(queries: readonly unknown[]): void {
  const messages: string[] = [];
  queries.forEach((query, index) => {
    const result = querySchema.safeParse(query);
    if (!result.success) {
      const prefix = queries.length === 1 ? "query" : `queries.${index}`;
      messages.push(...formatIssues(result.error, prefix));
    }
  });

  if (messages.length > 0) {
    throw new Error(`Invalid calculator query:\n- ${messages.join("\n- ")}`);
  }
}
