/**
 * Data model selection prompts.
 */

import type { CogniteClient } from "@cognite/sdk";
import { search, select } from "@inquirer/prompts";

export interface DataModelChoice {
  space: string;
  externalId: string;
  version: string;
}

interface DataModelListItem {
  space: string;
  externalId: string;
  version: string;
}

interface PromptChoice<TValue> {
  name: string;
  value: TValue;
}

type VersionMode = "latest" | "specific";

export async function promptDataModel(
  client: CogniteClient,
  flag?: string,
): Promise<DataModelChoice> {
  if (flag) {
    return parseDataModelFlag(flag);
  }

  const versionMode = await select({
    message: "Which data model version do you want to use?",
    default: "latest" as VersionMode,
    choices: [
      { name: "Latest", value: "latest" as const },
      { name: "Select a specific version", value: "specific" as const },
    ],
  });

  const dataModels = await client.dataModels.list({ limit: 1000, includeGlobal: true });
  const dataModelChoices = createDataModelChoices(dataModels.items);
  const selected = await search({
    message: "Select a data model:",
    source: (input) => filterChoices(dataModelChoices, input),
  });

  if (versionMode === "latest") {
    return selected;
  }

  const versions = await client.dataModels.retrieve([
    { space: selected.space, externalId: selected.externalId },
  ]);
  const versionChoices = createVersionChoices(selected, versions.items);
  const version = await search({
    message: "Select data model version:",
    source: (input) => filterChoices(versionChoices, input),
  });

  return version;
}

export function createDataModelChoices(
  dataModels: DataModelListItem[],
): Array<PromptChoice<DataModelChoice>> {
  return dataModels.map((dm) => ({
    name: `${dm.space}/${dm.externalId}`,
    value: toDataModelChoice(dm),
  }));
}

export function createVersionChoices(
  latest: DataModelChoice,
  dataModels: DataModelListItem[],
): Array<PromptChoice<DataModelChoice>> {
  const versions = dataModels
    .filter((dm) => dm.space === latest.space && dm.externalId === latest.externalId)
    .map(toDataModelChoice)
    .sort((a, b) => b.version.localeCompare(a.version));

  return [
    {
      name: `latest (${latest.version})`,
      value: latest,
    },
    ...versions
      .filter((version) => version.version !== latest.version)
      .map((version) => ({
        name: version.version,
        value: version,
      })),
  ];
}

export function filterChoices<TValue>(
  choices: Array<PromptChoice<TValue>>,
  input: string | undefined,
): Array<PromptChoice<TValue>> {
  if (!input) return choices;
  const lower = input.toLowerCase();
  return choices.filter((choice) => choice.name.toLowerCase().includes(lower));
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

function toDataModelChoice(dm: DataModelListItem): DataModelChoice {
  return {
    space: dm.space,
    externalId: dm.externalId,
    version: String(dm.version),
  };
}
