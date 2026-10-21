import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Démarrage de Chromium (rendus réels) : délais du monolithe, un fichier à la fois.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // Point d'entrée : lecture de l'environnement et écoute, couvert par le démarrage en compose.
      exclude: ["src/server.ts"],
      thresholds: { lines: 80 },
    },
  },
});
