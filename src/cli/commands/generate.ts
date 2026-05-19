/**
 * `industrial-model generate` command.
 */

import { Command } from "commander";
import { CogniteClient } from "@cognite/sdk";
import { promptAuth } from "../prompts/auth";
import { promptDataModel } from "../prompts/data-model";
import { promptOptions } from "../prompts/options";
import { createGeneratorConfig, generate } from "../generator/renderer";

export const generateCommand = new Command("generate")
  .description("Generate TypeScript types and client from a Cognite data model")
  .option("--token <token>", "CDF bearer token")
  .option("--project <project>", "CDF project name")
  .option("--base-url <url>", "CDF base URL")
  .option("--data-model <space/id/version>", "Data model identifier")
  .option("--output <path>", "Output directory")
  .option("--client-name <name>", "Name for the generated client function")
  .action(async (flags) => {
    const auth = await promptAuth({
      token: flags.token,
      project: flags.project,
      baseUrl: flags.baseUrl,
    });

    const client = new CogniteClient({
      appId: "industrial-model-generator",
      project: auth.project,
      baseUrl: auth.baseUrl,
      getToken: () => Promise.resolve(auth.token),
    });

    const dataModel = await promptDataModel(client, flags.dataModel);

    const options = await promptOptions({
      outputPath: flags.output,
      clientName: flags.clientName,
    });

    const config = createGeneratorConfig({
      dataModelSpace: dataModel.space,
      dataModelId: dataModel.externalId,
      dataModelVersion: dataModel.version,
      clientName: options.clientName,
      outputPath: options.outputPath,
    });

    console.log(`\nGenerating types for ${dataModel.space}/${dataModel.externalId}/${dataModel.version}...`);

    const response = await client.dataModels.retrieve(
      [{ space: dataModel.space, externalId: dataModel.externalId, version: dataModel.version }],
      { inlineViews: true },
    );
    const views = (response.items[0]?.views ?? []).filter(
      (v): v is typeof v & { properties: Record<string, unknown> } => "properties" in v,
    );

    if (views.length === 0) {
      console.error("No views found in the data model.");
      process.exit(1);
    }

    generate(views as Parameters<typeof generate>[0], config);

    console.log(`\n✓ Generated ${views.length} view(s) to ${config.outputPath}/${config.dataModelId}/`);
  });
