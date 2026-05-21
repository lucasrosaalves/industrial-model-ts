/**
 * CLI entry point for industrial-model.
 */

import { Command } from "commander";
import { generateCommand } from "./commands/generate";

const program = new Command()
  .name("industrial-model")
  .description("Code generator for Cognite Data Fusion data models")
  .version(process.env.PACKAGE_VERSION ?? "0.0.0");

program.addCommand(generateCommand);
program.parse();
