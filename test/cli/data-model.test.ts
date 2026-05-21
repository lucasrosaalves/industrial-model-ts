import type { CogniteClient } from "@cognite/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDataModelChoices,
  createVersionChoices,
  filterChoices,
  parseDataModelFlag,
  promptDataModel,
} from "../../src/cli/prompts/data-model";

const searchMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());

vi.mock("@inquirer/prompts", () => ({
  search: searchMock,
  select: selectMock,
}));

function makeClient(options: {
  listItems?: Array<{ space: string; externalId: string; version: string }>;
  retrieveItems?: Array<{ space: string; externalId: string; version: string }>;
}): CogniteClient {
  return {
    dataModels: {
      list: vi.fn().mockResolvedValue({ items: options.listItems ?? [] }),
      retrieve: vi.fn().mockResolvedValue({ items: options.retrieveItems ?? [] }),
    },
  } as unknown as CogniteClient;
}

describe("parseDataModelFlag", () => {
  it("parses space, external id, and version", () => {
    expect(parseDataModelFlag("my-space/MyModel/v1")).toEqual({
      space: "my-space",
      externalId: "MyModel",
      version: "v1",
    });
  });

  it("requires an explicit version", () => {
    expect(() => parseDataModelFlag("my-space/MyModel")).toThrow(
      'Invalid --data-model format. Expected "space/externalId/version"',
    );
  });
});

describe("data model prompt choices", () => {
  it("creates data model choices from latest list items", () => {
    expect(createDataModelChoices([{ space: "sp", externalId: "Model", version: "v2" }])).toEqual([
      {
        name: "sp/Model",
        value: { space: "sp", externalId: "Model", version: "v2" },
      },
    ]);
  });

  it("creates latest and specific version choices for the selected data model", () => {
    const choices = createVersionChoices({ space: "sp", externalId: "Model", version: "v3" }, [
      { space: "sp", externalId: "Model", version: "v1" },
      { space: "other", externalId: "Model", version: "v9" },
      { space: "sp", externalId: "OtherModel", version: "v9" },
      { space: "sp", externalId: "Model", version: "v2" },
      { space: "sp", externalId: "Model", version: "v3" },
    ]);

    expect(choices).toEqual([
      { name: "latest (v3)", value: { space: "sp", externalId: "Model", version: "v3" } },
      { name: "v2", value: { space: "sp", externalId: "Model", version: "v2" } },
      { name: "v1", value: { space: "sp", externalId: "Model", version: "v1" } },
    ]);
  });

  it("keeps latest when no matching versions are returned", () => {
    expect(createVersionChoices({ space: "sp", externalId: "Model", version: "v3" }, [])).toEqual([
      { name: "latest (v3)", value: { space: "sp", externalId: "Model", version: "v3" } },
    ]);
  });

  it("filters choices by prompt input", () => {
    const choices = createDataModelChoices([
      { space: "sp", externalId: "PumpModel", version: "v1" },
      { space: "sp", externalId: "AssetModel", version: "v1" },
    ]);

    expect(filterChoices(choices, "asset")).toEqual([
      {
        name: "sp/AssetModel",
        value: { space: "sp", externalId: "AssetModel", version: "v1" },
      },
    ]);
  });
});

describe("promptDataModel", () => {
  beforeEach(() => {
    searchMock.mockReset();
    selectMock.mockReset();
  });

  it("returns the flag value without prompting or listing data models", async () => {
    const client = makeClient({});

    await expect(promptDataModel(client, "sp/Model/v1")).resolves.toEqual({
      space: "sp",
      externalId: "Model",
      version: "v1",
    });
    expect(client.dataModels.list).not.toHaveBeenCalled();
    expect(client.dataModels.retrieve).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("returns latest without retrieving versions", async () => {
    const latest = { space: "sp", externalId: "Model", version: "v3" };
    const client = makeClient({
      listItems: [latest],
      retrieveItems: [{ space: "sp", externalId: "Model", version: "v2" }, latest],
    });
    selectMock.mockResolvedValueOnce("latest");
    searchMock.mockResolvedValueOnce(latest);

    await expect(promptDataModel(client)).resolves.toEqual(latest);
    expect(selectMock).toHaveBeenCalledWith({
      message: "Which data model version do you want to use?",
      default: "latest",
      choices: [
        { name: "Latest", value: "latest" },
        { name: "Select a specific version", value: "specific" },
      ],
    });
    expect(client.dataModels.list).toHaveBeenCalledWith({ limit: 1000, includeGlobal: true });
    expect(client.dataModels.retrieve).not.toHaveBeenCalled();
    expect(searchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a specific version from the interactive version prompt", async () => {
    const latest = { space: "sp", externalId: "Model", version: "v3" };
    const selectedVersion = { space: "sp", externalId: "Model", version: "v1" };
    const client = makeClient({
      listItems: [latest],
      retrieveItems: [selectedVersion, latest],
    });
    selectMock.mockResolvedValueOnce("specific");
    searchMock.mockResolvedValueOnce(latest).mockResolvedValueOnce(selectedVersion);

    await expect(promptDataModel(client)).resolves.toEqual(selectedVersion);
    expect(client.dataModels.retrieve).toHaveBeenCalledWith([{ space: "sp", externalId: "Model" }]);
    expect(searchMock).toHaveBeenCalledTimes(2);
  });
});
