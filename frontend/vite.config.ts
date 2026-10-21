import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Même origine (ADR 0022, point 2) : en développement, Vite relaie `/api` vers la gateway ; en compose,
 * nginx sert le build et relaie `/api`. Aucune CORS, cookies de première partie.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.GATEWAY_URL ?? "http://localhost:4000", changeOrigin: false } },
  },
  build: { sourcemap: true, target: "es2023" },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      // Logique couverte par les tests unitaires ; les pages le sont par les parcours Playwright (e2e/).
      include: ["src/api/**", "src/lib/**", "src/auth/**"],
      thresholds: { lines: 80 },
    },
  },
});
