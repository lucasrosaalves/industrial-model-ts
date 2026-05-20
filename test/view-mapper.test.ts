import { describe, expect, it, vi } from "vitest";
import type { CognitePort, ViewDefinition } from "../src/cognite";
import { ViewMapper } from "../src/mappers/view-mapper";
import { createViewMapper, getCogniteCoreView, makeCogniteWithViews } from "./fixtures/index.js";

const DATA_MODEL = { space: "sp", externalId: "DM", version: "v1" };

function makeView(externalId: string): ViewDefinition {
  return { space: "sp", externalId, version: "v1", properties: {} };
}

function makeCognite(views: ViewDefinition[], createdTime = 1000): CognitePort {
  return makeCogniteWithViews(views, createdTime);
}

describe("ViewMapper", () => {
  it("returns the correct view by externalId", async () => {
    const cognite = makeCognite([makeView("ViewA")]);
    const mapper = new ViewMapper(cognite, DATA_MODEL);
    const view = await mapper.getView("ViewA");
    expect(view.externalId).toBe("ViewA");
  });

  it("throws when the requested view is not in the data model", async () => {
    const cognite = makeCognite([makeView("ViewA")]);
    const mapper = new ViewMapper(cognite, DATA_MODEL);
    await expect(mapper.getView("Missing")).rejects.toThrow(/"Missing"/);
  });

  it("throws when the data model is not found", async () => {
    const cognite: CognitePort = {
      retrieveDataModels: vi.fn().mockResolvedValue({ items: [] }),
      queryInstances: vi.fn(),
      searchInstances: vi.fn(),
      aggregateInstances: vi.fn(),
      applyInstances: vi.fn(),
    };
    const mapper = new ViewMapper(cognite, DATA_MODEL);
    await expect(mapper.getView("ViewA")).rejects.toThrow("not found");
  });

  it("only calls the API once across multiple sequential getView calls", async () => {
    const cognite = makeCognite([makeView("ViewA")]);
    const retrieve = cognite.retrieveDataModels as ReturnType<typeof vi.fn>;
    const mapper = new ViewMapper(cognite, DATA_MODEL);
    await mapper.getView("ViewA");
    await mapper.getView("ViewA");
    await mapper.getView("ViewA");
    expect(retrieve.mock.calls).toHaveLength(1);
  });

  it("shares a single in-flight request across concurrent getView calls", async () => {
    const cognite = makeCognite([makeView("ViewA")]);
    const retrieve = cognite.retrieveDataModels as ReturnType<typeof vi.fn>;
    const mapper = new ViewMapper(cognite, DATA_MODEL);
    const [a, b, c] = await Promise.all([
      mapper.getView("ViewA"),
      mapper.getView("ViewA"),
      mapper.getView("ViewA"),
    ]);
    expect(retrieve.mock.calls).toHaveLength(1);
    expect(a.externalId).toBe("ViewA");
    expect(b.externalId).toBe("ViewA");
    expect(c.externalId).toBe("ViewA");
  });

  it("selects the most recently created data model when multiple are returned", async () => {
    const cognite: CognitePort = {
      retrieveDataModels: vi.fn().mockResolvedValue({
        items: [
          { views: [makeView("OldView")], createdTime: 1000 },
          { views: [makeView("NewView")], createdTime: 2000 },
        ],
      }),
      queryInstances: vi.fn(),
      searchInstances: vi.fn(),
      aggregateInstances: vi.fn(),
      applyInstances: vi.fn(),
    };
    const mapper = new ViewMapper(cognite, DATA_MODEL);
    const view = await mapper.getView("NewView");
    expect(view.externalId).toBe("NewView");
    await expect(mapper.getView("OldView")).rejects.toThrow();
  });

  it("loads CogniteAsset from the shared Cognite Core fixture", async () => {
    const mapper = createViewMapper();
    const view = await mapper.getView("CogniteAsset");
    const expected = getCogniteCoreView("CogniteAsset");
    expect(view.externalId).toBe(expected.externalId);
    expect(view.properties.parent).toBeDefined();
  });
});
