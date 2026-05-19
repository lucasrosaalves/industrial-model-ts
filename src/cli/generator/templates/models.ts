/**
 * Template: renders models.ts content.
 */

import type { ViewDefinition } from "../models";
import { getInterfaceType, getPropsFields, getRelationResolvedType, getRelationTypeFields } from "../models";

export function renderModels(views: ViewDefinition[]): string {
  const lines: string[] = [
    "/* eslint-disable */",
    "// DO NOT EDIT — this file is auto-generated",
    "",
    "import type { IndustrialModel, NodeId } from 'industrial-model'",
  ];

  for (const view of views) {
    lines.push("");
    lines.push(renderView(view));
  }

  return `${lines.join("\n")}\n`;
}

function renderView(view: ViewDefinition): string {
  const propsFields = getPropsFields(view);
  const relationFields = getRelationTypeFields(view);

  const propsLines = propsFields.map(
    (f) => `    ${f.fieldName}${f.isNullable ? "?" : ""}: ${getInterfaceType(f)}`,
  );

  if (relationFields.length === 0) {
    return `export type ${view.viewName} = IndustrialModel<{
${propsLines.join("\n")}
}>`;
  }

  const relLines = relationFields.map(
    (f) => `    ${f.fieldName}${f.isNullable ? "?" : ""}: ${getRelationResolvedType(f)}`,
  );

  return `export type ${view.viewName} = IndustrialModel<
  {
${propsLines.join("\n")}
  },
  {
${relLines.join("\n")}
  }
>`;
}
