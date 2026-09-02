import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderCogniteCoreTypes } from "../../src/cli/generator/cognite-core.js";
import { getCogniteCoreViews } from "../fixtures/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const typesPath = join(root, "src/cognite-core/types.ts");

function typeSection(source: string, typeName: string): string {
  const start = source.indexOf(`export type ${typeName} =`);
  if (start < 0) {
    throw new Error(`Type ${typeName} not found`);
  }
  const next = source.indexOf("\nexport type ", start + 1);
  return next < 0 ? source.slice(start) : source.slice(start, next);
}

describe("Cognite Core type generation", () => {
  it("matches the committed src/cognite-core/types.ts", () => {
    const expected = renderCogniteCoreTypes(getCogniteCoreViews());
    const actual = readFileSync(typesPath, "utf8");
    expect(actual).toBe(expected);
  });

  it("omits inward list reverse relations that Cognite cannot traverse", () => {
    const output = renderCogniteCoreTypes(getCogniteCoreViews());
    const asset = typeSection(output, "CogniteAsset");

    expect(asset).toContain("children: CogniteAsset[]");
    expect(asset).toContain("equipment: CogniteEquipment[]");
    expect(asset).not.toContain("timeSeries");
    expect(asset).not.toContain("CogniteFile");
    expect(asset).not.toContain("CogniteActivity");
  });

  it("keeps list direct relations on the source view", () => {
    const output = renderCogniteCoreTypes(getCogniteCoreViews());
    const timeSeries = typeSection(output, "CogniteTimeSeries");

    expect(timeSeries).toContain("assets?: NodeId[]");
    expect(timeSeries).toContain("assets?: CogniteAsset[]");
    expect(timeSeries).toContain("type: CogniteTimeSeries_Type");
  });

  it("emits Core enum unions from the fixture", () => {
    const output = renderCogniteCoreTypes(getCogniteCoreViews());

    expect(output).toContain(
      'export type CogniteTimeSeries_Type = "string" | "numeric" | "state";',
    );
    expect(output).toContain('} from "../types";');
    expect(output).not.toContain("Generated at:");
    expect(output).not.toContain("industrial-model v");
    expect(output).toContain("// Data model: cdf_cdm/CogniteCore v1");
  });
});
