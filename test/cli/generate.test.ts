import { describe, expect, it } from "vitest";
import { generateCommand } from "../../src/cli/commands/generate";

describe("generate command", () => {
  it("documents --no-view-mapper-cache", () => {
    const help = generateCommand.helpInformation();
    expect(help).toContain("--no-view-mapper-cache");
  });
});
