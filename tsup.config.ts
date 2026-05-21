import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig([
  // Runtime library (consumer-facing)
  {
    entry: ["src/index.ts", "src/cognite-core/index.ts"],
    outDir: "dist",
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    external: ["@cognite/sdk"],
  },
  // CLI (self-contained bundle, deps inlined)
  {
    entry: { "cli/index": "src/cli/index.ts" },
    outDir: "dist",
    format: ["cjs"],
    platform: "node",
    banner: { js: "#!/usr/bin/env node" },
    splitting: false,
    sourcemap: true,
    noExternal: ["commander", "@inquirer/prompts"],
    external: ["@cognite/sdk"],
    define: {
      "process.env.PACKAGE_VERSION": JSON.stringify(pkg.version),
    },
  },
]);
