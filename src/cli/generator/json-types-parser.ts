/**
 * Parses a user-provided TypeScript file containing JSON property type overrides.
 *
 * Expected file format:
 *
 * ```ts
 * export type Metadata = { key: string; value: number };
 * export type Coordinates = { lat: number; lng: number };
 *
 * export const jsonPropertyTypes = [
 *   { space: "my_space", view: "MyView", property: "metadata", type: "Metadata" },
 *   { space: "my_space", view: "MyView", property: "location", type: "Coordinates" },
 * ] as const;
 * ```
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

export interface JsonTypeOverride {
  space: string;
  view: string;
  property: string;
  type: string;
}

export interface JsonTypesConfig {
  /** Map of type name → full type declaration source text */
  typeDeclarations: Map<string, string>;
  /** Property-to-type mappings */
  overrides: JsonTypeOverride[];
}

export function parseJsonTypesFile(filePath: string): JsonTypesConfig {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`JSON types file not found: ${absolutePath}`);
  }

  const sourceText = fs.readFileSync(absolutePath, "utf-8");
  const sourceFile = ts.createSourceFile(absolutePath, sourceText, ts.ScriptTarget.Latest, true);

  const typeDeclarations = new Map<string, string>();
  const overrides: JsonTypeOverride[] = [];

  // Walk top-level statements
  for (const statement of sourceFile.statements) {
    // Collect exported type aliases and interfaces
    if (ts.isTypeAliasDeclaration(statement) && hasExportModifier(statement)) {
      const name = statement.name.text;
      typeDeclarations.set(name, statement.getText(sourceFile));
    }

    if (ts.isInterfaceDeclaration(statement) && hasExportModifier(statement)) {
      const name = statement.name.text;
      typeDeclarations.set(name, statement.getText(sourceFile));
    }

    // Find the jsonPropertyTypes export
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === "jsonPropertyTypes" &&
          decl.initializer
        ) {
          const mappings = extractMappings(decl.initializer, sourceFile);
          overrides.push(...mappings);
        }
      }
    }
  }

  // Validate that all type references exist
  for (const override of overrides) {
    if (!typeDeclarations.has(override.type)) {
      throw new Error(
        `JSON types config error: type "${override.type}" referenced by ` +
          `property "${override.space}/${override.view}/${override.property}" ` +
          `is not exported from ${filePath}`,
      );
    }
  }

  if (overrides.length === 0) {
    throw new Error(
      `JSON types config error: no "jsonPropertyTypes" export found or it is empty in ${filePath}`,
    );
  }

  return { typeDeclarations, overrides };
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function extractMappings(node: ts.Expression, sourceFile: ts.SourceFile): JsonTypeOverride[] {
  // Handle `[...] as const` or just `[...]`
  let arrayNode: ts.Expression = node;
  if (ts.isAsExpression(node)) {
    arrayNode = node.expression;
  }

  if (!ts.isArrayLiteralExpression(arrayNode)) {
    throw new Error("JSON types config error: jsonPropertyTypes must be an array literal");
  }

  const results: JsonTypeOverride[] = [];

  for (const element of arrayNode.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new Error(
        "JSON types config error: each entry in jsonPropertyTypes must be an object literal",
      );
    }

    const obj: Record<string, string> = {};
    for (const prop of element.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        ts.isStringLiteral(prop.initializer)
      ) {
        obj[prop.name.text] = prop.initializer.text;
      }
    }

    if (!obj.space || !obj.view || !obj.property || !obj.type) {
      throw new Error(
        `JSON types config error: each entry must have "space", "view", "property", and "type" fields. ` +
          `Got: ${element.getText(sourceFile)}`,
      );
    }

    results.push({
      space: obj.space,
      view: obj.view,
      property: obj.property,
      type: obj.type,
    });
  }

  return results;
}
