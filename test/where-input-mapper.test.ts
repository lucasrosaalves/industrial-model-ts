import { describe, expect, it, vi } from "vitest";
import type { ViewDefinition } from "../src/cognite";
import { FilterMapper } from "../src/mappers/filter-mapper";
import {
  createFilterMapper,
  createViewMapper,
  getCogniteCoreView,
  makeCogniteMock,
} from "./fixtures/index.js";

const FLAT_VIEW = getCogniteCoreView("CogniteSchedulable");
const ROOT_VIEW = getCogniteCoreView("CogniteAsset");
const PARENT_VIEW = getCogniteCoreView("CogniteAsset");
const ASSET_CLASS_VIEW = getCogniteCoreView("CogniteAssetClass");

function makeMapper() {
  return createFilterMapper();
}

// Shorthand for the property array produced by getPropertyRef for non-node properties
function prop(view: ViewDefinition, field: string): string[] {
  return [view.space, `${view.externalId}/${view.version}`, field];
}

// Node-level properties (externalId, space, etc.) resolve to ["node", field]
function nodeProp(field: string): string[] {
  return ["node", field];
}

describe("FilterMapper.map", () => {
  it("returns empty array for empty input", async () => {
    const mapper = makeMapper();
    expect(await mapper.map({}, FLAT_VIEW)).toEqual([]);
  });

  it("skips null values", async () => {
    const mapper = makeMapper();
    expect(await mapper.map({ name: null }, FLAT_VIEW)).toEqual([]);
  });

  describe("node-level property (externalId)", () => {
    it("resolves to [node, field] ref", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ externalId: { eq: "X" } }, FLAT_VIEW);
      expect(result).toEqual([{ equals: { property: nodeProp("externalId"), value: "X" } }]);
    });
  });

  describe("string filters", () => {
    it("handles eq", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ name: { eq: "test" } }, ROOT_VIEW);
      expect(result).toEqual([{ equals: { property: prop(ROOT_VIEW, "name"), value: "test" } }]);
    });

    it("handles prefix", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ name: { prefix: "te" } }, ROOT_VIEW);
      expect(result).toEqual([{ prefix: { property: prop(ROOT_VIEW, "name"), value: "te" } }]);
    });

    it("handles in", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ name: { in: ["a", "b"] } }, ROOT_VIEW);
      expect(result).toEqual([{ in: { property: prop(ROOT_VIEW, "name"), values: ["a", "b"] } }]);
    });

    it("handles multiple operators on the same field as separate filter defs", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ name: { eq: "test", prefix: "te" } }, ROOT_VIEW);
      expect(result).toEqual([
        { equals: { property: prop(ROOT_VIEW, "name"), value: "test" } },
        { prefix: { property: prop(ROOT_VIEW, "name"), value: "te" } },
      ]);
    });

    it("maps search to instance references returned by Cognite search", async () => {
      const cognite = makeCogniteMock();
      cognite.searchInstances = vi.fn().mockResolvedValue({
        items: [
          { instanceType: "node", space: "asset-space", externalId: "asset-1" },
          { instanceType: "node", space: "asset-space", externalId: "asset-2" },
        ],
      });
      const mapper = new FilterMapper(createViewMapper(), cognite);

      const result = await mapper.map(
        { name: { search: { query: "pump motor", operator: "AND" } } },
        ROOT_VIEW,
      );

      expect(cognite.searchInstances).toHaveBeenCalledWith({
        view: { type: "view", space: "cdf_cdm", externalId: "CogniteAsset", version: "v1" },
        query: "pump motor",
        instanceType: "node",
        properties: ["name"],
        operator: "AND",
        limit: 1_000,
      });
      expect(result).toEqual([
        {
          instanceReferences: [
            { space: "asset-space", externalId: "asset-1" },
            { space: "asset-space", externalId: "asset-2" },
          ],
        },
      ]);
    });

    it("keeps normal string operators when a field also has search", async () => {
      const cognite = makeCogniteMock();
      cognite.searchInstances = vi.fn().mockResolvedValue({
        items: [{ instanceType: "node", space: "asset-space", externalId: "asset-1" }],
      });
      const mapper = new FilterMapper(createViewMapper(), cognite);

      const result = await mapper.map(
        { name: { prefix: "pump", search: { query: "motor" } } },
        ROOT_VIEW,
      );

      expect(cognite.searchInstances).toHaveBeenCalledWith(
        expect.objectContaining({ query: "motor", operator: "OR", properties: ["name"] }),
      );
      expect(result).toEqual([
        { prefix: { property: prop(ROOT_VIEW, "name"), value: "pump" } },
        { instanceReferences: [{ space: "asset-space", externalId: "asset-1" }] },
      ]);
    });

    it("maps an empty search response to an empty instance reference filter", async () => {
      const cognite = makeCogniteMock();
      cognite.searchInstances = vi.fn().mockResolvedValue({ items: [] });
      const mapper = new FilterMapper(createViewMapper(), cognite);

      const result = await mapper.map({ name: { search: { query: "not found" } } }, ROOT_VIEW);

      expect(result).toEqual([{ instanceReferences: [] }]);
    });

    it("runs one search per searched property", async () => {
      const cognite = makeCogniteMock();
      cognite.searchInstances = vi
        .fn()
        .mockResolvedValueOnce({
          items: [{ instanceType: "node", space: "asset-space", externalId: "by-name" }],
        })
        .mockResolvedValueOnce({
          items: [{ instanceType: "node", space: "asset-space", externalId: "by-description" }],
        });
      const mapper = new FilterMapper(createViewMapper(), cognite);

      const result = await mapper.map(
        {
          name: { search: { query: "pump" } },
          description: { search: { query: "motor" } },
        },
        ROOT_VIEW,
      );

      expect(cognite.searchInstances).toHaveBeenCalledTimes(2);
      expect(cognite.searchInstances).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ query: "pump", properties: ["name"] }),
      );
      expect(cognite.searchInstances).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ query: "motor", properties: ["description"] }),
      );
      expect(result).toEqual([
        { instanceReferences: [{ space: "asset-space", externalId: "by-name" }] },
        { instanceReferences: [{ space: "asset-space", externalId: "by-description" }] },
      ]);
    });
  });

  describe("number filters", () => {
    it("handles gt", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ sourceCreatedTime: { gt: 5 } }, ROOT_VIEW);
      expect(result).toEqual([
        { range: { property: prop(ROOT_VIEW, "sourceCreatedTime"), gt: 5 } },
      ]);
    });

    it("handles gte", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ sourceCreatedTime: { gte: 5 } }, ROOT_VIEW);
      expect(result).toEqual([
        { range: { property: prop(ROOT_VIEW, "sourceCreatedTime"), gte: 5 } },
      ]);
    });

    it("handles lt", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ sourceCreatedTime: { lt: 10 } }, ROOT_VIEW);
      expect(result).toEqual([
        { range: { property: prop(ROOT_VIEW, "sourceCreatedTime"), lt: 10 } },
      ]);
    });

    it("handles lte", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ sourceCreatedTime: { lte: 10 } }, ROOT_VIEW);
      expect(result).toEqual([
        { range: { property: prop(ROOT_VIEW, "sourceCreatedTime"), lte: 10 } },
      ]);
    });

    it("handles a range with gt and lte as separate filter defs", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ sourceCreatedTime: { gt: 5, lte: 10 } }, ROOT_VIEW);
      expect(result).toEqual([
        { range: { property: prop(ROOT_VIEW, "sourceCreatedTime"), gt: 5 } },
        { range: { property: prop(ROOT_VIEW, "sourceCreatedTime"), lte: 10 } },
      ]);
    });
  });

  describe("exists filter", () => {
    it("handles exists: true", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ name: { exists: true } }, ROOT_VIEW);
      expect(result).toEqual([{ exists: { property: prop(ROOT_VIEW, "name") } }]);
    });

    it("handles exists: false as not(exists)", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ name: { exists: false } }, ROOT_VIEW);
      expect(result).toEqual([{ not: { exists: { property: prop(ROOT_VIEW, "name") } } }]);
    });
  });

  describe("list filters", () => {
    it("handles containsAll", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ name: { containsAll: ["a", "b"] } }, ROOT_VIEW);
      expect(result).toEqual([
        { containsAll: { property: prop(ROOT_VIEW, "name"), values: ["a", "b"] } },
      ]);
    });

    it("handles containsAny", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ name: { containsAny: ["x", "y"] } }, ROOT_VIEW);
      expect(result).toEqual([
        { containsAny: { property: prop(ROOT_VIEW, "name"), values: ["x", "y"] } },
      ]);
    });
  });

  describe("multiple top-level fields (implicit AND via baseFilters)", () => {
    it("produces one filter def per field", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        { name: { eq: "alice" }, externalId: { eq: "id-1" } },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        { equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } },
        { equals: { property: nodeProp("externalId"), value: "id-1" } },
      ]);
    });
  });

  describe("AND operator", () => {
    it("wraps single clause in and filter", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ AND: [{ name: { eq: "alice" } }] }, ROOT_VIEW);
      expect(result).toEqual([
        { and: [{ equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } }] },
      ]);
    });

    it("combines multiple clauses in one and filter", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        { AND: [{ name: { eq: "alice" } }, { externalId: { eq: "id-1" } }] },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          and: [
            { equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } },
            { equals: { property: nodeProp("externalId"), value: "id-1" } },
          ],
        },
      ]);
    });

    it("accepts a single object (non-array) as AND", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ AND: { name: { eq: "alice" } } }, ROOT_VIEW);
      expect(result).toEqual([
        { and: [{ equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } }] },
      ]);
    });

    it("wraps multi-key clause in nested and", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        { AND: [{ name: { eq: "alice" }, externalId: { eq: "id-1" } }] },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          and: [
            {
              and: [
                { equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } },
                { equals: { property: nodeProp("externalId"), value: "id-1" } },
              ],
            },
          ],
        },
      ]);
    });
  });

  describe("OR operator", () => {
    it("wraps clauses in or filter", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        { OR: [{ name: { eq: "alice" } }, { name: { eq: "bob" } }] },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          or: [
            { equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } },
            { equals: { property: prop(ROOT_VIEW, "name"), value: "bob" } },
          ],
        },
      ]);
    });

    it("wraps multi-key OR branches in nested and", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        { OR: [{ name: { eq: "alice" }, externalId: { eq: "id-1" } }] },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          or: [
            {
              and: [
                { equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } },
                { equals: { property: nodeProp("externalId"), value: "id-1" } },
              ],
            },
          ],
        },
      ]);
    });

    it("supports search inside OR branches", async () => {
      const cognite = makeCogniteMock();
      cognite.searchInstances = vi
        .fn()
        .mockResolvedValueOnce({
          items: [{ instanceType: "node", space: "asset-space", externalId: "pump-1" }],
        })
        .mockResolvedValueOnce({
          items: [{ instanceType: "node", space: "asset-space", externalId: "motor-1" }],
        });
      const mapper = new FilterMapper(createViewMapper(), cognite);

      const result = await mapper.map(
        {
          OR: [
            { name: { search: { query: "pump" } } },
            { description: { search: { query: "motor", operator: "AND" } } },
          ],
        },
        ROOT_VIEW,
      );

      expect(cognite.searchInstances).toHaveBeenCalledTimes(2);
      expect(result).toEqual([
        {
          or: [
            { instanceReferences: [{ space: "asset-space", externalId: "pump-1" }] },
            { instanceReferences: [{ space: "asset-space", externalId: "motor-1" }] },
          ],
        },
      ]);
    });
  });

  describe("NOT operator", () => {
    it("wraps single clause in not filter", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ NOT: { name: { eq: "alice" } } }, ROOT_VIEW);
      expect(result).toEqual([
        { not: { equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } } },
      ]);
    });

    it("wraps array of clauses in not containing an and", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        { NOT: [{ name: { eq: "alice" } }, { externalId: { eq: "id-1" } }] },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          not: {
            and: [
              { equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } },
              { equals: { property: nodeProp("externalId"), value: "id-1" } },
            ],
          },
        },
      ]);
    });
  });

  describe("nested WhereInput", () => {
    it("converts a single nested field to a nested filter", async () => {
      const mapper = makeMapper();
      const result = await mapper.map({ parent: { name: { eq: "root" } } }, ROOT_VIEW);
      expect(result).toEqual([
        {
          nested: {
            scope: prop(ROOT_VIEW, "parent"),
            filter: { equals: { property: prop(PARENT_VIEW, "name"), value: "root" } },
          },
        },
      ]);
    });

    it("wraps multi-key nested WhereInput in and before nesting", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        { parent: { name: { eq: "root" }, description: { prefix: "P" } } },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          nested: {
            scope: prop(ROOT_VIEW, "parent"),
            filter: {
              and: [
                { equals: { property: prop(PARENT_VIEW, "name"), value: "root" } },
                { prefix: { property: prop(PARENT_VIEW, "description"), value: "P" } },
              ],
            },
          },
        },
      ]);
    });

    it("supports search inside nested relation filters", async () => {
      const cognite = makeCogniteMock();
      cognite.searchInstances = vi.fn().mockResolvedValue({
        items: [{ instanceType: "node", space: "asset-space", externalId: "parent-1" }],
      });
      const mapper = new FilterMapper(createViewMapper(), cognite);

      const result = await mapper.map(
        { parent: { name: { search: { query: "root parent", operator: "AND" } } } },
        ROOT_VIEW,
      );

      expect(cognite.searchInstances).toHaveBeenCalledWith({
        view: { type: "view", space: "cdf_cdm", externalId: "CogniteAsset", version: "v1" },
        query: "root parent",
        instanceType: "node",
        properties: ["name"],
        operator: "AND",
        limit: 1_000,
      });
      expect(result).toEqual([
        {
          nested: {
            scope: prop(ROOT_VIEW, "parent"),
            filter: {
              instanceReferences: [{ space: "asset-space", externalId: "parent-1" }],
            },
          },
        },
      ]);
    });
  });

  describe("combined usage", () => {
    it("handles top-level fields together with OR and NOT", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        {
          name: { eq: "alice" },
          OR: [{ externalId: { eq: "id-1" } }, { externalId: { eq: "id-2" } }],
          NOT: { name: { prefix: "x" } },
        },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        { equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } },
        {
          or: [
            { equals: { property: nodeProp("externalId"), value: "id-1" } },
            { equals: { property: nodeProp("externalId"), value: "id-2" } },
          ],
        },
        { not: { prefix: { property: prop(ROOT_VIEW, "name"), value: "x" } } },
      ]);
    });
  });

  describe("AND + OR combined at same level", () => {
    it("produces both and and or filter defs", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        {
          AND: [{ name: { eq: "alice" } }],
          OR: [{ name: { eq: "bob" } }, { name: { eq: "carol" } }],
        },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        { and: [{ equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } }] },
        {
          or: [
            { equals: { property: prop(ROOT_VIEW, "name"), value: "bob" } },
            { equals: { property: prop(ROOT_VIEW, "name"), value: "carol" } },
          ],
        },
      ]);
    });

    it("produces top-level field, AND, and OR together", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        {
          externalId: { prefix: "asset" },
          AND: [{ name: { eq: "alice" } }, { name: { prefix: "al" } }],
          OR: [{ externalId: { eq: "id-1" } }, { externalId: { eq: "id-2" } }],
        },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        { prefix: { property: nodeProp("externalId"), value: "asset" } },
        {
          and: [
            { equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } },
            { prefix: { property: prop(ROOT_VIEW, "name"), value: "al" } },
          ],
        },
        {
          or: [
            { equals: { property: nodeProp("externalId"), value: "id-1" } },
            { equals: { property: nodeProp("externalId"), value: "id-2" } },
          ],
        },
      ]);
    });
  });

  describe("AND containing OR", () => {
    it("nests or inside and", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        {
          AND: [
            { OR: [{ name: { eq: "alice" } }, { name: { eq: "bob" } }] },
            { externalId: { eq: "id-1" } },
          ],
        },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          and: [
            {
              or: [
                { equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } },
                { equals: { property: prop(ROOT_VIEW, "name"), value: "bob" } },
              ],
            },
            { equals: { property: nodeProp("externalId"), value: "id-1" } },
          ],
        },
      ]);
    });
  });

  describe("OR containing AND", () => {
    it("nests and inside or branches", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        {
          OR: [
            { AND: [{ name: { eq: "alice" } }, { externalId: { eq: "id-1" } }] },
            { name: { eq: "bob" } },
          ],
        },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          or: [
            {
              and: [
                { equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } },
                { equals: { property: nodeProp("externalId"), value: "id-1" } },
              ],
            },
            { equals: { property: prop(ROOT_VIEW, "name"), value: "bob" } },
          ],
        },
      ]);
    });
  });

  describe("NOT on compound conditions", () => {
    it("NOT containing OR becomes not(or(...))", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        { NOT: { OR: [{ name: { eq: "alice" } }, { name: { eq: "bob" } }] } },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          not: {
            or: [
              { equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } },
              { equals: { property: prop(ROOT_VIEW, "name"), value: "bob" } },
            ],
          },
        },
      ]);
    });

    it("NOT containing AND becomes not(and(...))", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        { NOT: { AND: [{ name: { eq: "alice" } }, { externalId: { eq: "id-1" } }] } },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          not: {
            and: [
              { equals: { property: prop(ROOT_VIEW, "name"), value: "alice" } },
              { equals: { property: nodeProp("externalId"), value: "id-1" } },
            ],
          },
        },
      ]);
    });
  });

  describe("nested with logical operators inside", () => {
    it("nested field with OR inside", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        { parent: { OR: [{ name: { eq: "alice" } }, { description: { prefix: "x" } }] } },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          nested: {
            scope: prop(ROOT_VIEW, "parent"),
            filter: {
              or: [
                { equals: { property: prop(PARENT_VIEW, "name"), value: "alice" } },
                { prefix: { property: prop(PARENT_VIEW, "description"), value: "x" } },
              ],
            },
          },
        },
      ]);
    });

    it("nested field with AND inside", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        { parent: { AND: [{ name: { eq: "root" } }, { description: { prefix: "P" } }] } },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          nested: {
            scope: prop(ROOT_VIEW, "parent"),
            filter: {
              and: [
                { equals: { property: prop(PARENT_VIEW, "name"), value: "root" } },
                { prefix: { property: prop(PARENT_VIEW, "description"), value: "P" } },
              ],
            },
          },
        },
      ]);
    });

    it("nested field with NOT inside", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        { parent: { NOT: { name: { eq: "forbidden" } } } },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          nested: {
            scope: prop(ROOT_VIEW, "parent"),
            filter: {
              not: { equals: { property: prop(PARENT_VIEW, "name"), value: "forbidden" } },
            },
          },
        },
      ]);
    });
  });

  describe("OR with nested branches", () => {
    it("OR where one branch is a nested filter and one is a flat filter", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        {
          OR: [{ parent: { name: { eq: "root" } } }, { name: { eq: "orphan" } }],
        },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          or: [
            {
              nested: {
                scope: prop(ROOT_VIEW, "parent"),
                filter: { equals: { property: prop(PARENT_VIEW, "name"), value: "root" } },
              },
            },
            { equals: { property: prop(ROOT_VIEW, "name"), value: "orphan" } },
          ],
        },
      ]);
    });

    it("NOT on a nested field", async () => {
      const mapper = makeMapper();
      const result = await mapper.map(
        { NOT: { parent: { name: { eq: "forbidden" } } } },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          not: {
            nested: {
              scope: prop(ROOT_VIEW, "parent"),
              filter: { equals: { property: prop(PARENT_VIEW, "name"), value: "forbidden" } },
            },
          },
        },
      ]);
    });
  });

  describe("deeply nested (3 levels)", () => {
    it("resolves parent.assetClass.name through the full relation chain", async () => {
      const result = await makeMapper().map(
        { parent: { assetClass: { name: { eq: "class-name" } } } },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          nested: {
            scope: prop(ROOT_VIEW, "parent"),
            filter: {
              nested: {
                scope: prop(PARENT_VIEW, "assetClass"),
                filter: {
                  equals: { property: prop(ASSET_CLASS_VIEW, "name"), value: "class-name" },
                },
              },
            },
          },
        },
      ]);
    });

    it("nested relation with flat sibling at parent level", async () => {
      const result = await makeMapper().map(
        { parent: { name: { eq: "parent-name" }, assetClass: { name: { eq: "class-name" } } } },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          nested: {
            scope: prop(ROOT_VIEW, "parent"),
            filter: {
              and: [
                { equals: { property: prop(PARENT_VIEW, "name"), value: "parent-name" } },
                {
                  nested: {
                    scope: prop(PARENT_VIEW, "assetClass"),
                    filter: {
                      equals: { property: prop(ASSET_CLASS_VIEW, "name"), value: "class-name" },
                    },
                  },
                },
              ],
            },
          },
        },
      ]);
    });

    it("OR on parent with one branch drilling into assetClass", async () => {
      const result = await makeMapper().map(
        {
          OR: [
            { parent: { assetClass: { name: { eq: "class-a" } } } },
            { parent: { name: { eq: "p-b" } } },
          ],
        },
        ROOT_VIEW,
      );
      expect(result).toEqual([
        {
          or: [
            {
              nested: {
                scope: prop(ROOT_VIEW, "parent"),
                filter: {
                  nested: {
                    scope: prop(PARENT_VIEW, "assetClass"),
                    filter: {
                      equals: { property: prop(ASSET_CLASS_VIEW, "name"), value: "class-a" },
                    },
                  },
                },
              },
            },
            {
              nested: {
                scope: prop(ROOT_VIEW, "parent"),
                filter: { equals: { property: prop(PARENT_VIEW, "name"), value: "p-b" } },
              },
            },
          ],
        },
      ]);
    });
  });

  describe("date coercion", () => {
    it("coerces Date values to ISO strings in range filters", async () => {
      const date = new Date("2024-06-01T00:00:00.000Z");
      const mapper = makeMapper();
      const result = await mapper.map({ createdTime: { gte: date } }, FLAT_VIEW);
      expect(result).toEqual([
        { range: { property: nodeProp("createdTime"), gte: "2024-06-01T00:00:00.000Z" } },
      ]);
    });

    it("coerces Date values to ISO strings in eq filters", async () => {
      const date = new Date("2024-01-01T12:00:00.000Z");
      const mapper = makeMapper();
      const result = await mapper.map({ createdTime: { eq: date } }, FLAT_VIEW);
      expect(result).toEqual([
        { equals: { property: nodeProp("createdTime"), value: "2024-01-01T12:00:00.000Z" } },
      ]);
    });
  });
});
