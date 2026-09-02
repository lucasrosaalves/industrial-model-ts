/**
 * Regenerates `src/cognite-core/types.ts` from the Cognite Core fixture.
 *
 * Usage: npm run generate:cognite-core
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCogniteCoreTypes } from "../src/cli/generator/cognite-core.js";
import type { ViewDefinition } from "../src/cognite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(
  readFileSync(join(root, "test/fixtures/cognite-core-data-model.json"), "utf8"),
) as { items: Array<{ views?: ViewDefinition[] }> };

const views = fixture.items[0]?.views;
if (!views || views.length === 0) {
  throw new Error("Cognite Core fixture has no views");
}

const typesPath = join(root, "src/cognite-core/types.ts");
writeFileSync(typesPath, renderCogniteCoreTypes(views));
console.log(`Wrote ${typesPath} (${views.length} views)`);
