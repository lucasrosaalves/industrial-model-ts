/**
 * Parser: converts engine ViewDefinition objects into generator ViewDefinition[].
 */

import type {
  ViewDefinition as CogniteViewDefinition,
  EdgeConnection,
  ReverseDirectRelationConnection,
  ViewPropertyDefinition,
} from "../../cognite";
import {
  getDirectRelationSource,
  isEdgeConnection,
  isReverseDirectRelation,
  isViewPropertyDefinition,
} from "../../utils";
import { typeMappings } from "./constants";
import { toCamel, toPascal } from "./helpers";
import type { FieldDefinition, ViewDefinition } from "./models";

export function parseViews(
  views: CogniteViewDefinition[],
  knownExternalIds?: Set<string>,
): ViewDefinition[] {
  const available = knownExternalIds ?? new Set(views.map((v) => v.externalId));
  const parsed = views.sort((a, b) => a.externalId.localeCompare(b.externalId)).map(parseView);

  for (const view of parsed) {
    for (const field of view.fields) {
      if (field.relationTargetExternalId && !available.has(field.relationTargetExternalId)) {
        field.relationTarget = null;
        field.relationTargetSpace = null;
        field.relationTargetExternalId = null;
      }
    }
  }

  return parsed;
}

function parseView(view: CogniteViewDefinition): ViewDefinition {
  const fields: FieldDefinition[] = [];

  for (const [propertyName, prop] of Object.entries(view.properties)) {
    const fieldName = toCamel(propertyName);

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
  const relationSource = getDirectRelationSource(prop);
  const enumValues =
    cogniteType === "enum" && prop.type.values ? Object.keys(prop.type.values) : null;

  let relationTarget: string | null = null;
  let relationTargetSpace: string | null = null;
  let relationTargetExternalId: string | null = null;

  if (relationSource) {
    relationTarget = toPascal(relationSource.externalId);
    relationTargetSpace = relationSource.space;
    relationTargetExternalId = relationSource.externalId;
  }

  return {
    fieldName,
    originalName: propertyName,
    cogniteType,
    mappedType,
    isNullable: prop.nullable !== false,
    isList,
    isRelation,
    isEdge: false,
    isReverseRelation: false,
    isListDirectRelation: isRelation && isList,
    relationTarget,
    relationTargetSpace,
    relationTargetExternalId,
    enumValues,
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
    enumValues: null,
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
    enumValues: null,
  };
}
