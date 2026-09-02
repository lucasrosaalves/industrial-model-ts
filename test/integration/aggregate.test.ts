import { describe, expect, it } from "vitest";
import { createIntegrationCoreClient, hasIntegrationCredentials } from "./setup.js";

const describeIntegration = describe.skipIf(!hasIntegrationCredentials());

describeIntegration("integration aggregate", () => {
  it("counts CogniteAsset instances grouped by parent", async () => {
    const core = createIntegrationCoreClient();

    const result = await core.aggregate("CogniteAsset")({
      aggregates: [{ count: {} }],
      groupBy: { parent: true },
      filters: { description: { exists: true } },
    });

    expect(Array.isArray(result.items)).toBe(true);
  });
});
