/**
 * Constants for TypeScript code generation.
 */

/** Cognite property type → TypeScript type */
export const typeMappings: Record<string, string> = {
  text: "string",
  boolean: "boolean",
  timestamp: "string",
  date: "string",
  json: "unknown",
  float32: "number",
  float64: "number",
  int32: "number",
  int64: "number",
  timeseries: "string",
  file: "string",
  sequence: "string",
  direct: "NodeId",
  enum: "string",
};
