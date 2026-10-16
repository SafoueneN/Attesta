import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
/** Cible externe (conteneur, préprod) : aucun serveur local n'est alors lancé. */
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: external ?? `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external
    ? undefined
    : {
        command: "node apps/web/dist/server.js",
        url: `http://127.0.0.1:${PORT}/health`,
        reuseExistingServer: false,
        env: {
          PORT: String(PORT),
          NODE_ENV: "test",
          SESSION_STORE: "memory",
          SESSION_SECRET: "e2e-secret-non-utilise-en-production-000",
          LOG_LEVEL: "warn",
          LLM_PROVIDER: "demo",
        },
      },
});
