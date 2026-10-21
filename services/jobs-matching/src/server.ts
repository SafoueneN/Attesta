import { ConfigError } from "@attesta/config";
import { createJwksVerifier, startServer, USER_AUDIENCE } from "@attesta/http-kit";
import { BudgetedProvider, createLlmProvider, pgUsageStore } from "@attesta/llm-client";
import { createLogger } from "@attesta/logger";
import { createApp } from "./app.js";
import { loadConfig, SERVICE } from "./config.js";
import { checkDatabase, createPool, migrate } from "./db.js";
import { demoHandlers } from "./demo.js";
import { HashEmbeddings, TeiEmbeddings } from "./embeddings.js";
import { EscoClient } from "./esco.js";
import { JobsRepository } from "./repository.js";
import { Adzuna } from "./sources/adzuna.js";
import { BaJobsuche } from "./sources/ba.js";
import type { JobSource } from "./types.js";

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

const repo = new JobsRepository(pool);
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
    maxCallsPerMinute: 60,
    onUsage: (usage) => logger.info({ event: "llm_usage", ...usage }, "llm"),
  });

const sources: JobSource[] = [];
if (config.BA_ENABLED) sources.push(new BaJobsuche());
if (config.ADZUNA_APP_ID && config.ADZUNA_APP_KEY) {
  sources.push(new Adzuna({ appId: config.ADZUNA_APP_ID, appKey: config.ADZUNA_APP_KEY }));
}

// Purge quotidienne (rétention : docs/architecture.md).
const purge = setInterval(
  () =>
    repo
      .purge()
      .then((counts) => logger.info({ event: "purge", ...counts }, "purge"))
      .catch((err) => logger.warn({ event: "purge_erreur", errorType: err?.name }, "purge")),
  6 * 60 * 60 * 1000,
);
purge.unref();

const app = createApp({
  logger,
  trustProxy: config.TRUST_PROXY,
  readiness: { base: () => checkDatabase(pool) },
  repo,
  verifier: createJwksVerifier(config.AUTH_JWKS_URL, { audience: [USER_AUDIENCE, SERVICE] }),
  llm,
  embeddings: config.EMBEDDINGS_PROVIDER === "tei" ? new TeiEmbeddings(config.TEI_URL) : new HashEmbeddings(),
  esco: config.ESCO_ENABLED ? new EscoClient(repo.escoCache()) : undefined,
  sources,
  dailyRequestLimits: { ba: config.BA_DAILY_REQUESTS, adzuna: config.ADZUNA_DAILY_REQUESTS },
});
await startServer({
  app,
  port: config.PORT,
  logger,
  onClose: async () => {
    clearInterval(purge);
    await pool.end();
  },
});
