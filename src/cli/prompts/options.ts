/**
 * Generator option prompts (output path, client name).
 */

import { input } from "@inquirer/prompts";

export interface GeneratorOptions {
  outputPath?: string;
  clientName?: string;
}

export async function promptOptions(flags: GeneratorOptions): Promise<{
  outputPath: string;
  clientName: string | undefined;
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

  return { outputPath, clientName };
}
