/**
 * View and field definition models for code generation.
 */

import { toCamel } from "./helpers";

export interface FieldDefinition {
  fieldName: string;
  originalName: string;
  cogniteType: string;
  mappedType: string;
  isNullable: boolean;
  isList: boolean;
  isRelation: boolean;
  isEdge: boolean;
  isReverseRelation: boolean;
  isListDirectRelation: boolean;
  relationTarget: string | null;
  relationTargetSpace: string | null;
  relationTargetExternalId: string | null;
}

export interface ViewDefinition {
  viewName: string;
  viewExternalId: string;
  viewSpace: string;
  viewVersion: string;
  fields: FieldDefinition[];
}

/** Fields for the Props type param (excludes reverse relations) */
export function getPropsFields(view: ViewDefinition): FieldDefinition[] {
  return view.fields.filter((f) => !f.isReverseRelation);
}

/** Fields for the Relations type param */
export function getRelationTypeFields(view: ViewDefinition): FieldDefinition[] {
  return view.fields.filter(
    (f) => (f.isRelation || f.isEdge || f.isReverseRelation) && f.relationTarget,
  );
}

/** TypeScript type for a field in the Props type param */
export function getInterfaceType(field: FieldDefinition): string {
  if (field.isRelation && !field.isList) return "NodeId";
  if (field.isEdge || (field.isRelation && field.isList)) return "NodeId[]";
  if (field.isList) return `${field.mappedType}[]`;
  return field.mappedType;
}

/** TypeScript type for a field in the Relations type param */
export function getRelationResolvedType(field: FieldDefinition): string {
  const target = field.relationTarget ?? "unknown";
  if (field.isList || field.isEdge) return `${target}[]`;
  if (field.isReverseRelation && !field.isList) return target;
  return target;
}

/** camelCase property name for the client object */
export function getClientPropertyName(view: ViewDefinition): string {
  return toCamel(view.viewName);
}
