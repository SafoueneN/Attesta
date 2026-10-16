import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node apps/web/dist/server.js",
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      NODE_ENV: "test",
      SESSION_STORE: "memory",
      SESSION_SECRET: "e2e-secret-non-utilise-en-production-000",
      LOG_LEVEL: "warn",
    },
  },
});
