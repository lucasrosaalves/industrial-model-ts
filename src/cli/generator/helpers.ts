/**
 * String transformation helpers for code generation.
 */

/** Convert a string to PascalCase (e.g. "my_view_name" → "MyViewName") */
export function toPascal(str: string): string {
  return str
    .replace(/[-_]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (c) => c.toUpperCase());
}

/** Convert a string to camelCase (e.g. "my_field_name" → "myFieldName") */
export function toCamel(str: string): string {
  const pascal = toPascal(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
