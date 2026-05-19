import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cognite-core/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["@cognite/sdk"],
});
