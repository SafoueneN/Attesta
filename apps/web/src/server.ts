import pg from "pg";
import { AnthropicProvider, createClaudeClient, DemoProvider, type LlmProvider } from "@attesta/llm";
import { PuppeteerPdfRenderer } from "@attesta/render";
import { createLogger, loadConfig, type Config } from "@attesta/shared";
import { createApp } from "./app.js";
import { startMaintenance } from "./stores.js";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const pool = config.DATABASE_URL
  ? new pg.Pool({ connectionString: config.DATABASE_URL, max: config.PG_POOL_MAX })
  : undefined;
const renderer = new PuppeteerPdfRenderer({
  maxConcurrency: config.PDF_MAX_CONCURRENCY,
  timeoutMs: config.PDF_TIMEOUT_MS,
  executablePath: config.PUPPETEER_EXECUTABLE_PATH,
  noSandbox: config.PDF_CHROMIUM_NO_SANDBOX,
});

function llmProvider(c: Config): LlmProvider | undefined {
  switch (c.LLM_PROVIDER) {
    case "none":
      return undefined;
    case "demo":
      return new DemoProvider();
    default:
      return new AnthropicProvider(
        createClaudeClient({
          provider: c.LLM_PROVIDER,
          timeoutMs: c.LLM_TIMEOUT_MS,
          vertexProjectId: c.VERTEX_PROJECT_ID,
          vertexRegion: c.VERTEX_REGION,
        }),
        { model: c.LLM_MODEL, timeoutMs: c.LLM_TIMEOUT_MS },
      );
  }
}

const provider = llmProvider(config);
if (config.LLM_PROVIDER === "anthropic") {
  logger.warn(
    "LLM_PROVIDER=anthropic : traitement hors UE, réservé au développement avec des données fictives",
  );
}

const app = createApp({
  config,
  logger,
  renderer,
  pool,
  ia: provider
    ? { provider, maxCostUsd: config.LLM_MAX_COST_USD_PER_CV, dailyQuota: config.LLM_DAILY_QUOTA }
    : undefined,
});

const stopMaintenance = pool ? startMaintenance(pool, logger) : undefined;

const server = app.listen(config.PORT, () => {
  logger.info(
    {
      port: config.PORT,
      sessionStore: config.SESSION_STORE,
      llmProvider: config.LLM_PROVIDER,
      model: provider?.model,
    },
    "Attesta démarré",
  );
});

async function shutdown(signal: string) {
  logger.info({ signal }, "arrêt en cours");
  server.close();
  stopMaintenance?.();
  await Promise.allSettled([renderer.close(), pool?.end()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
