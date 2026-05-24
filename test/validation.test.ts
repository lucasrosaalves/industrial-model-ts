import { describe, expect, it } from "vitest";
import type { ViewPropertyDefinition } from "../src/cognite/index.js";
import { buildViewSchema, propertyValueSchema } from "../src/validation.js";
import { getCogniteCoreView } from "./fixtures/index.js";

describe("buildViewSchema", () => {
  const schema = buildViewSchema(getCogniteCoreView("CogniteAsset"));

  it("builds a Zod schema from Cognite view properties", () => {
    const result = schema.safeParse({
      name: "Pump",
      description: "Main feed pump",
      parent: { space: "cdf_cdm", externalId: "root" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects values that do not match the Cognite property type", () => {
    const result = schema.safeParse({
      name: 42,
    });

    expect(result.success).toBe(false);
  });

  it("rejects properties that are not present in the view", () => {
    const result = schema.safeParse({
      namme: "Pump",
    });

    expect(result.success).toBe(false);
  });

  it("can coerce Cognite timestamp strings into Date values", () => {
    const result = buildViewSchema(getCogniteCoreView("CogniteAsset"), {
      dateMode: "coerce",
    }).safeParse({
      sourceCreatedTime: "2024-01-02T03:04:05.000Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceCreatedTime).toBeInstanceOf(Date);
    }
  });
});

describe("propertyValueSchema - enum", () => {
  const enumProp: ViewPropertyDefinition = {
    container: {},
    containerPropertyIdentifier: "status",
    type: {
      type: "enum",
      values: { RUNNING: { name: "RUNNING" }, STOPPED: { name: "STOPPED" } },
    },
  };

  it("accepts valid enum values", () => {
    const schema = propertyValueSchema(enumProp);
    expect(schema.safeParse("RUNNING").success).toBe(true);
    expect(schema.safeParse("STOPPED").success).toBe(true);
  });

  it("rejects invalid enum values", () => {
    const schema = propertyValueSchema(enumProp);
    expect(schema.safeParse("INVALID").success).toBe(false);
  });
});
