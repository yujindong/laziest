import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts"],
  dts: true,
  outDir: "dist",
  clean: true,
  format: ["cjs", "esm", "iife"],
  globalName: "LaziestHooks",
  treeshake: true,
  // splitting
  cjsInterop: true,
});
