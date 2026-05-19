/**
 * Parser: converts engine ViewDefinition objects into generator ViewDefinition[].
 */

import type {
  ViewDefinition as CogniteViewDefinition,
  ViewDefinitionProperty,
  ViewPropertyDefinition,
  ReverseDirectRelationConnection,
  EdgeConnection,
} from "../../cognite";
import { reservedWords, typeMappings } from "./constants";
import { toCamel, toPascal } from "./helpers";
import type { FieldDefinition, ViewDefinition } from "./models";

export function parseViews(views: CogniteViewDefinition[]): ViewDefinition[] {
  return views
    .sort((a, b) => a.externalId.localeCompare(b.externalId))
    .map(parseView);
}

function parseView(view: CogniteViewDefinition): ViewDefinition {
  const fields: FieldDefinition[] = [];

  for (const [propertyName, prop] of Object.entries(view.properties)) {
    let fieldName = toCamel(propertyName);
    if (reservedWords.has(fieldName)) {
      fieldName = `${fieldName}_`;
    }

    if (isViewPropertyDefinition(prop)) {
      fields.push(processMappedProperty(propertyName, fieldName, prop));
    } else if (isEdgeConnection(prop)) {
      fields.push(processEdgeProperty(propertyName, fieldName, prop));
    } else if (isReverseDirectRelation(prop)) {
      fields.push(processReverseProperty(propertyName, fieldName, prop));
    }
  }

  return {
    viewName: toPascal(view.externalId),
    viewExternalId: view.externalId,
    viewSpace: view.space,
    viewVersion: view.version,
    fields,
  };
}

function processMappedProperty(
  propertyName: string,
  fieldName: string,
  prop: ViewPropertyDefinition,
): FieldDefinition {
  const cogniteType = prop.type.type ?? "unknown";
  const mappedType = typeMappings[cogniteType] ?? "unknown";
  const isList = prop.type.list === true;
  const isRelation = cogniteType === "direct";

  let relationTarget: string | null = null;
  let relationTargetSpace: string | null = null;
  let relationTargetExternalId: string | null = null;

  if (isRelation && prop.type.source) {
    relationTarget = toPascal(prop.type.source.externalId);
    relationTargetSpace = prop.type.source.space;
    relationTargetExternalId = prop.type.source.externalId;
  }

  return {
    fieldName,
    originalName: propertyName,
    cogniteType,
    mappedType,
    isNullable: true, // Cognite SDK doesn't expose nullable in this type; default to true
    isList,
    isRelation,
    isEdge: false,
    isReverseRelation: false,
    isListDirectRelation: isRelation && isList,
    relationTarget,
    relationTargetSpace,
    relationTargetExternalId,
  };
}

function processEdgeProperty(
  propertyName: string,
  fieldName: string,
  prop: EdgeConnection,
): FieldDefinition {
  return {
    fieldName,
    originalName: propertyName,
    cogniteType: "edge",
    mappedType: "NodeId",
    isNullable: false,
    isList: true,
    isRelation: false,
    isEdge: true,
    isReverseRelation: false,
    isListDirectRelation: false,
    relationTarget: toPascal(prop.source.externalId),
    relationTargetSpace: prop.source.space,
    relationTargetExternalId: prop.source.externalId,
  };
}

function processReverseProperty(
  propertyName: string,
  fieldName: string,
  prop: ReverseDirectRelationConnection,
): FieldDefinition {
  const isSingle = prop.connectionType === "single_reverse_direct_relation";

  return {
    fieldName,
    originalName: propertyName,
    cogniteType: "reverse_direct",
    mappedType: "NodeId",
    isNullable: isSingle,
    isList: !isSingle,
    isRelation: true,
    isEdge: false,
    isReverseRelation: true,
    isListDirectRelation: false,
    relationTarget: toPascal(prop.source.externalId),
    relationTargetSpace: prop.source.space,
    relationTargetExternalId: prop.source.externalId,
  };
}

// --- Type guards ---

function isViewPropertyDefinition(prop: ViewDefinitionProperty): prop is ViewPropertyDefinition {
  return "containerPropertyIdentifier" in prop;
}

function isEdgeConnection(prop: ViewDefinitionProperty): prop is EdgeConnection {
  return "direction" in prop;
}

function isReverseDirectRelation(prop: ViewDefinitionProperty): prop is ReverseDirectRelationConnection {
  return "through" in prop;
}
