import { defineConfig } from "vitest/config";

// Paquets partagés seulement : chaque service, la gateway et le frontend ont leur propre Vitest (ADR 0023).
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**"],
      thresholds: { lines: 75 },
    },
  },
});
