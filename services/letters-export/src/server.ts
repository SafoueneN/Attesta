import { ConfigError } from "@attesta/config";
import { createJwksVerifier, startServer, USER_AUDIENCE } from "@attesta/http-kit";
import { BudgetedProvider, createLlmProvider, pgUsageStore } from "@attesta/llm-client";
import { createLogger } from "@attesta/logger";
import { createApp } from "./app.js";
import { loadConfig, SERVICE } from "./config.js";
import { checkDatabase, createPool, migrate } from "./db.js";
import { demoHandlers } from "./letters.js";
import { PuppeteerPdfRenderer } from "./render/index.js";
import { LetterStore } from "./store.js";
import { httpUpstreams } from "./upstreams.js";

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err instanceof ConfigError || err instanceof Error ? err.message : err);
  process.exit(1);
}

const logger = createLogger({ service: SERVICE, level: config.LOG_LEVEL });
if (config.MIGRATE_ON_START) await migrate(config.DATABASE_URL);
const pool = createPool(config.DATABASE_URL);
pool.on("error", (err) => logger.error({ err, event: "pg_erreur" }, "connexion PostgreSQL perdue"));

const store = new LetterStore(pool);
const provider = createLlmProvider(
  {
    provider: config.LLM_PROVIDER,
    model: config.LLM_MODEL,
    timeoutMs: config.LLM_TIMEOUT_MS,
    vertexProjectId: config.VERTEX_PROJECT_ID,
    vertexRegion: config.VERTEX_REGION,
  },
  demoHandlers,
);
const llm =
  provider &&
  new BudgetedProvider(provider, {
    service: SERVICE,
    store: pgUsageStore((sql, params) => pool.query(sql, params)),
    monthlyBudgetEur: config.LLM_MONTHLY_BUDGET_EUR,
    maxCallsPerMinute: 30,
    onUsage: (usage) => logger.info({ event: "llm_usage", ...usage }, "llm"),
  });
const renderer = new PuppeteerPdfRenderer({
  maxConcurrency: config.PDF_MAX_CONCURRENCY,
  timeoutMs: config.PDF_TIMEOUT_MS,
  executablePath: config.PUPPETEER_EXECUTABLE_PATH,
  noSandbox: config.PDF_NO_SANDBOX,
});

const purge = setInterval(
  () => store.purge().catch((err) => logger.warn({ event: "purge_erreur", errorType: err?.name }, "purge")),
  15 * 60 * 1000,
);
purge.unref();

const app = createApp({
  logger,
  trustProxy: config.TRUST_PROXY,
  readiness: { base: () => checkDatabase(pool) },
  store,
  upstreams: httpUpstreams({ cvGeneration: config.CV_GENERATION_URL, profiles: config.PROFILES_URL }),
  renderer,
  verifier: createJwksVerifier(config.AUTH_JWKS_URL, { audience: [USER_AUDIENCE, SERVICE] }),
  llm,
});
await startServer({
  app,
  port: config.PORT,
  logger,
  onClose: async () => {
    clearInterval(purge);
    await renderer.close();
    await pool.end();
  },
});
