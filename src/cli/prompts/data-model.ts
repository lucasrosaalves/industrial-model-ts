/**
 * Data model selection prompts.
 */

import { search } from "@inquirer/prompts";
import type { CogniteClient } from "@cognite/sdk";

export interface DataModelChoice {
  space: string;
  externalId: string;
  version: string;
}

export async function promptDataModel(
  client: CogniteClient,
  flag?: string,
): Promise<DataModelChoice> {
  if (flag) {
    return parseDataModelFlag(flag);
  }

  const dataModels = await client.dataModels.list({ limit: 1000 });

  const choices = dataModels.items.map((dm: { space: string; externalId: string; version: string }) => ({
    name: `${dm.space}/${dm.externalId}/${dm.version}`,
    value: {
      space: dm.space,
      externalId: dm.externalId,
      version: String(dm.version),
    },
  }));

  return search({
    message: "Select a data model:",
    source: (input) => {
      if (!input) return choices;
      const lower = input.toLowerCase();
      return choices.filter((c: { name: string }) => c.name.toLowerCase().includes(lower));
    },
  });
}

export function parseDataModelFlag(flag: string): DataModelChoice {
  const parts = flag.split("/");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error(
      `Invalid --data-model format. Expected "space/externalId/version", got "${flag}"`,
    );
  }
  return { space: parts[0], externalId: parts[1], version: parts[2] };
}
