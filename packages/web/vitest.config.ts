import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    restoreMocks: true,
    clearMocks: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporters: ["text", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
    },
  },
});
