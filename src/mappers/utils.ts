import type {
  EdgeConnection,
  QuerySelectExpression,
  ReverseDirectRelationConnection,
  ViewDefinition,
  ViewDefinitionProperty,
  ViewPropertyDefinition,
  ViewReference,
} from "../cognite";

const NODE_PROPERTIES = new Set([
  "externalId",
  "space",
  "createdTime",
  "deletedTime",
  "lastUpdatedTime",
]);

export function getPropertyRef(
  property: string,
  view: ViewDefinition,
  instanceType: "node" | "edge" = "node",
): string[] {
  if (NODE_PROPERTIES.has(property)) return [instanceType, property];
  return [view.space, `${view.externalId}/${view.version}`, property];
}

export function toViewReference(view: ViewDefinition): ViewReference {
  return { type: "view", space: view.space, externalId: view.externalId, version: view.version };
}

export function isViewPropertyDefinition(p: ViewDefinitionProperty): p is ViewPropertyDefinition {
  return "container" in p;
}

export function isReverseDirectRelation(
  p: ViewDefinitionProperty,
): p is ReverseDirectRelationConnection {
  return "through" in p;
}

export function isEdgeConnection(p: ViewDefinitionProperty): p is EdgeConnection {
  return !isViewPropertyDefinition(p) && !isReverseDirectRelation(p) && "source" in p;
}

export function getDirectRelationSource(p: ViewPropertyDefinition): ViewReference | undefined {
  const type = p.type;
  if (type.type === "direct" && type.source) return type.source;
  return undefined;
}

export function isDirectRelationWithSource(p: ViewDefinitionProperty): boolean {
  if (!isViewPropertyDefinition(p)) return false;
  return getDirectRelationSource(p) !== undefined;
}

export function isListDirectRelation(p: ViewPropertyDefinition): boolean {
  return p.type.list === true;
}

export function buildSelect(
  source: ViewReference,
  properties: string[],
): QuerySelectExpression | Record<string, never> {
  if (properties.length === 0) return {};
  return { sources: [{ source, properties }] };
}

const GROUPABLE_PROPERTY_TYPES = new Set([
  "text",
  "direct",
  "int32",
  "int64",
  "float32",
  "float64",
  "boolean",
  "enum",
]);

const NUMERIC_PROPERTY_TYPES = new Set(["int32", "int64", "float32", "float64"]);

export function isGroupableProperty(property: ViewDefinitionProperty): boolean {
  if (!isViewPropertyDefinition(property)) return false;
  if (property.type.list === true) return false;
  const type = property.type.type;
  return type != null && GROUPABLE_PROPERTY_TYPES.has(type);
}

export function isNumericProperty(property: ViewPropertyDefinition): boolean {
  const type = property.type.type;
  return type != null && NUMERIC_PROPERTY_TYPES.has(type);
}

export function getSelectedGroupByKeys(groupBy: Record<string, boolean | undefined>): string[] {
  return Object.entries(groupBy)
    .filter((entry): entry is [string, true] => entry[1] === true)
    .map(([key]) => key);
}
