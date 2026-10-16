import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "evals/**/*.eval.test.ts"],
    testTimeout: 60_000,
    // Démarrage de Chromium dans les beforeAll des tests de rendu PDF.
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "apps/*/src/**"],
      exclude: ["apps/web/src/server.ts"],
      thresholds: {
        lines: 75,
        "packages/schema/src/**": { lines: 90 },
      },
    },
  },
});
