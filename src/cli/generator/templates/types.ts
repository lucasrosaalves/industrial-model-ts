/**
 * Template: renders types.ts content.
 */

import type { ViewDefinition } from "../models";
import {
  getEnumTypeName,
  getInterfaceType,
  getPropsFields,
  getRelationResolvedType,
  getRelationTypeFields,
} from "../models";
import type { GeneratorConfig } from "../renderer";
import { renderHeader } from "./header";

export function renderTypes(
  views: ViewDefinition[],
  config: GeneratorConfig,
  customTypeDeclarations: string[] = [],
): string {
  const lines: string[] = [
    renderHeader(config),
    "",
    "import type {",
    "  AggregateOptions,",
    "  AggregateResult,",
    "  AggregateResultItem,",
    "  IndustrialModel,",
    "  NodeId,",
    "  QueryOptions,",
    "  QueryResult,",
    "  QueryResultItem,",
    "  QuerySelect,",
    "  UpsertOptions,",
    "  UpsertResult,",
    '} from "industrial-model";',
    "",
  ];

  // Render enum type aliases
  const enumAliases = renderEnumTypeAliases(views);
  if (enumAliases) {
    lines.push(enumAliases);
    lines.push("");
  }

  // Render custom JSON type declarations
  if (customTypeDeclarations.length > 0) {
    lines.push(customTypeDeclarations.join("\n\n"));
    lines.push("");
  }

  lines.push(renderViewExternalIdUnion(views, config));

  for (const view of views) {
    lines.push("");
    lines.push(renderView(view));
  }

  lines.push("");
  lines.push(renderModelByView(views, config));
  lines.push("");
  lines.push(renderExecutors(config));

  return `${lines.join("\n")}\n`;
}

function renderViewExternalIdUnion(views: ViewDefinition[], config: GeneratorConfig): string {
  return `export type ${config.clientName}ViewExternalId =
${views.map((view) => `  | "${view.viewExternalId}"`).join("\n")};`;
}

function renderEnumTypeAliases(views: ViewDefinition[]): string {
  const aliases: string[] = [];
  for (const view of views) {
    for (const field of view.fields) {
      if (field.enumValues && field.enumValues.length > 0) {
        const typeName = getEnumTypeName(view.viewName, field);
        const union = field.enumValues.map((v) => `"${v}"`).join(" | ");
        aliases.push(`export type ${typeName} = ${union};`);
      }
    }
  }
  return aliases.join("\n");
}

function renderView(view: ViewDefinition): string {
  const propsFields = getPropsFields(view);
  const relationFields = getRelationTypeFields(view);

  if (relationFields.length === 0) {
    const propsLines = propsFields.map(
      (f) => `  ${f.fieldName}${f.isNullable ? "?" : ""}: ${getInterfaceType(f, view.viewName)};`,
    );

    return `export type ${view.viewName} = IndustrialModel<{
${propsLines.join("\n")}
}>;`;
  }

  const propsLines = propsFields.map(
    (f) => `    ${f.fieldName}${f.isNullable ? "?" : ""}: ${getInterfaceType(f, view.viewName)};`,
  );
  const relLines = relationFields.map(
    (f) => `    ${f.fieldName}${f.isNullable ? "?" : ""}: ${getRelationResolvedType(f)};`,
  );

  return `export type ${view.viewName} = IndustrialModel<
  {
${propsLines.join("\n")}
  },
  {
${relLines.join("\n")}
  }
>;`;
}

function renderModelByView(views: ViewDefinition[], config: GeneratorConfig): string {
  return `export interface ${config.clientName}ModelByView {
${views.map((view) => `  "${view.viewExternalId}": ${view.viewName};`).join("\n")}
}

export type ${config.clientName}Model<TView extends ${config.clientName}ViewExternalId> =
  ${config.clientName}ModelByView[TView];`;
}

function renderExecutors(config: GeneratorConfig): string {
  const name = config.clientName;

  return `export type ${name}QueryExecutor<TView extends ${name}ViewExternalId> = {
  <const TSelect extends QuerySelect<${name}Model<TView>>>(
    options: Omit<QueryOptions<${name}Model<TView>, TSelect>, "viewExternalId" | "select"> & {
      select: TSelect & QuerySelect<${name}Model<TView>>;
    },
  ): Promise<QueryResult<QueryResultItem<${name}Model<TView>, TSelect>>>;
  (
    options?: Omit<QueryOptions<${name}Model<TView>, undefined>, "viewExternalId" | "select"> & {
      select?: undefined;
    },
  ): Promise<QueryResult<QueryResultItem<${name}Model<TView>, undefined>>>;
};

export type ${name}AggregateExecutor<TView extends ${name}ViewExternalId> = <
  const TOptions extends Omit<AggregateOptions<${name}Model<TView>>, "viewExternalId">,
>(
  options?: TOptions,
) => Promise<
  AggregateResult<
    AggregateResultItem<${name}Model<TView>, TOptions["groupBy"], TOptions["aggregate"]>
  >
>;

export type ${name}UpsertExecutor<TView extends ${name}ViewExternalId> = (
  options: Omit<UpsertOptions<${name}Model<TView>>, "viewExternalId">,
) => Promise<UpsertResult>;`;
}
