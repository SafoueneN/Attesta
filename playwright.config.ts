import { defineConfig, devices } from "@playwright/test";

/**
 * Suites de bout en bout contre la pile compose (frontend, gateway, six services) :
 *   docker compose --profile core up -d --build --wait
 *   E2E_BASE_URL=http://localhost:8080 npm run test:parite
 * Aucun serveur n'est lancé par Playwright : la cible est toujours une pile démarrée (locale ou préprod).
 */
export default defineConfig({
  testDir: "e2e",
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
