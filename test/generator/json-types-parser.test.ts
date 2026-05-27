/**
 * Tests for json-types-parser.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseJsonTypesFile } from "../../src/cli/generator/json-types-parser";

const tmpDir = join(__dirname, ".tmp-json-types");

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true });
});

function writeConfig(filename: string, content: string): string {
  const filePath = join(tmpDir, filename);
  writeFileSync(filePath, content);
  return filePath;
}

describe("parseJsonTypesFile", () => {
  it("parses a valid config file with type aliases", () => {
    const filePath = writeConfig(
      "valid.ts",
      `
export type Metadata = { key: string; value: number };
export type Coordinates = { lat: number; lng: number };

export const jsonPropertyTypes = [
  { viewSpace: "my_space", viewExternalId: "MyView", viewProperty: "metadata", expectedType: "Metadata" },
  { viewSpace: "my_space", viewExternalId: "MyView", viewProperty: "location", expectedType: "Coordinates" },
] as const;
`,
    );

    const result = parseJsonTypesFile(filePath);

    expect(result.overrides).toHaveLength(2);
    expect(result.overrides[0]).toEqual({
      viewSpace: "my_space",
      viewExternalId: "MyView",
      viewProperty: "metadata",
      expectedType: "Metadata",
    });
    expect(result.typeDeclarations.has("Metadata")).toBe(true);
    expect(result.typeDeclarations.has("Coordinates")).toBe(true);
    expect(result.typeDeclarations.get("Metadata")).toContain("key: string");
  });

  it("parses interfaces as type declarations", () => {
    const filePath = writeConfig(
      "interfaces.ts",
      `
export interface Config {
  host: string;
  port: number;
}

export const jsonPropertyTypes = [
  { viewSpace: "s", viewExternalId: "V", viewProperty: "config", expectedType: "Config" },
] as const;
`,
    );

    const result = parseJsonTypesFile(filePath);
    expect(result.typeDeclarations.has("Config")).toBe(true);
    expect(result.typeDeclarations.get("Config")).toContain("interface Config");
  });

  it("throws if file does not exist", () => {
    expect(() => parseJsonTypesFile("/nonexistent/path.ts")).toThrow("JSON types file not found");
  });

  it("throws if type reference does not match an export", () => {
    const filePath = writeConfig(
      "bad-ref.ts",
      `
export type Metadata = { key: string };

export const jsonPropertyTypes = [
  { viewSpace: "s", viewExternalId: "V", viewProperty: "p", expectedType: "NonExistent" },
] as const;
`,
    );

    expect(() => parseJsonTypesFile(filePath)).toThrow('type "NonExistent" referenced by');
  });

  it("throws if jsonPropertyTypes is empty or missing", () => {
    const filePath = writeConfig(
      "empty.ts",
      `
export type Foo = { x: number };
export const jsonPropertyTypes = [] as const;
`,
    );

    expect(() => parseJsonTypesFile(filePath)).toThrow(
      'no "jsonPropertyTypes" export found or it is empty',
    );
  });

  it("throws if entry is missing required fields", () => {
    const filePath = writeConfig(
      "incomplete.ts",
      `
export type Foo = { x: number };
export const jsonPropertyTypes = [
  { viewSpace: "s", viewExternalId: "V", expectedType: "Foo" },
] as const;
`,
    );

    expect(() => parseJsonTypesFile(filePath)).toThrow(
      'must have "viewSpace", "viewExternalId", "viewProperty", and "expectedType"',
    );
  });

  it("works without as const", () => {
    const filePath = writeConfig(
      "no-const.ts",
      `
export type Data = { value: string };

export const jsonPropertyTypes = [
  { viewSpace: "s", viewExternalId: "V", viewProperty: "data", expectedType: "Data" },
];
`,
    );

    const result = parseJsonTypesFile(filePath);
    expect(result.overrides).toHaveLength(1);
  });
});
