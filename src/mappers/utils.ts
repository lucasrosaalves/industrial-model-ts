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
