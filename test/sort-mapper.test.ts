import { describe, expect, it } from "vitest";
import { SortMapper } from "../src/mappers/sort-mapper";
import { getCogniteCoreView } from "./fixtures/index.js";

const ASSET_VIEW = getCogniteCoreView("CogniteAsset");

describe("SortMapper", () => {
  const mapper = new SortMapper();

  it("maps scalar properties to property refs", () => {
    const result = mapper.map({ name: "ascending" }, ASSET_VIEW);
    expect(result).toEqual([
      {
        property: ["cdf_cdm", "CogniteAsset/v1", "name"],
        direction: "ascending",
        nullsFirst: false,
      },
    ]);
  });

  it("uses nullsFirst true for descending scalar sorts", () => {
    const result = mapper.map({ description: "descending" }, ASSET_VIEW);
    expect(result[0]?.nullsFirst).toBe(true);
  });

  it("uses nullsFirst true for ascending direct-relation sorts", () => {
    const result = mapper.map({ parent: "ascending" }, ASSET_VIEW);
    expect(result).toEqual([
      {
        property: ["cdf_cdm", "CogniteAsset/v1", "parent"],
        direction: "ascending",
        nullsFirst: true,
      },
    ]);
  });

  it("maps node-level properties", () => {
    const result = mapper.map({ externalId: "descending" }, ASSET_VIEW);
    expect(result).toEqual([
      {
        property: ["node", "externalId"],
        direction: "descending",
        nullsFirst: true,
      },
    ]);
  });
});
