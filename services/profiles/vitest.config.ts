import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // server.ts : point d'entrée ; pdf-text-child.ts : exécuté dans un processus enfant, vérifié par
      // tests/extraction.test.ts mais invisible pour la couverture du processus de test.
      exclude: ["src/server.ts", "src/pdf-text-child.ts"],
      thresholds: { lines: 80 },
    },
  },
});
