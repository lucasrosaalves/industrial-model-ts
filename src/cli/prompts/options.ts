/**
 * Generator option prompts (output path, client name, json-types).
 */

import { input } from "@inquirer/prompts";

export interface GeneratorOptions {
  outputPath?: string;
  clientName?: string;
  jsonTypes?: string;
}

export async function promptOptions(flags: GeneratorOptions): Promise<{
  outputPath: string;
  clientName: string | undefined;
  jsonTypesPath: string | undefined;
}> {
  const outputPath =
    flags.outputPath ||
    (await input({
      message: "Output directory:",
      default: "./generated",
    }));

  const clientName =
    flags.clientName ||
    (await input({
      message: "Client name (leave empty for default based on data model name):",
    })) ||
    undefined;

  const jsonTypesPath =
    flags.jsonTypes ||
    (await input({
      message:
        "Path to JSON property type overrides file (leave empty to skip):",
      default: "json-types.ts",
    })) ||
    undefined;

  return { outputPath, clientName, jsonTypesPath };
}
