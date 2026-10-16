import pg from "pg";
import { PuppeteerPdfRenderer } from "@attesta/render";
import { createLogger, loadConfig } from "@attesta/shared";
import { createApp } from "./app.js";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const pool = config.DATABASE_URL
  ? new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 })
  : undefined;
const renderer = new PuppeteerPdfRenderer({
  maxConcurrency: config.PDF_MAX_CONCURRENCY,
  timeoutMs: config.PDF_TIMEOUT_MS,
  executablePath: config.PUPPETEER_EXECUTABLE_PATH,
  noSandbox: config.PDF_CHROMIUM_NO_SANDBOX,
});

const server = createApp({ config, logger, renderer, pool }).listen(config.PORT, () => {
  logger.info({ port: config.PORT, sessionStore: config.SESSION_STORE }, "Attesta démarré");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "arrêt en cours");
  server.close();
  await Promise.allSettled([renderer.close(), pool?.end()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
