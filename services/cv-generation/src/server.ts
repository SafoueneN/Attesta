import { ConfigError } from "@attesta/config";
import { createJwksVerifier, startServer, USER_AUDIENCE } from "@attesta/http-kit";
import { BudgetedProvider, createAiProvider, pgUsageStore } from "@attesta/llm-client";
import { createLogger } from "@attesta/logger";
import { createApp } from "./app.js";
import { loadConfig, SERVICE } from "./config.js";
import { checkDatabase, createPool, migrate } from "./db.js";
import { assistantDemoHandlers } from "./assistants.js";
import { demoHandlers } from "./pipeline.js";
import { GenerationStore, IaQuota } from "./store.js";
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

const store = new GenerationStore(pool);
const provider = createAiProvider(
  config,
  config.NODE_ENV,
  { ...demoHandlers, ...assistantDemoHandlers },
  (event) => logger.warn({ event: "llm_repli", ...event }, "llm"),
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
  quota: new IaQuota(pool, config.QUOTA_SECRET),
  upstreams: httpUpstreams({ profiles: config.PROFILES_URL, jobsMatching: config.JOBS_MATCHING_URL }),
  verifier: createJwksVerifier(config.AUTH_JWKS_URL, { audience: [USER_AUDIENCE, SERVICE] }),
  llm,
  maxCostUsd: config.MAX_COST_PER_CV_USD,
  dailyQuota: config.DAILY_QUOTA,
});
const server = await startServer({
  app,
  port: config.PORT,
  logger,
  onClose: async () => {
    clearInterval(purge);
    await pool.end();
  },
});
// Génération en SSE : la réponse peut durer plus que le délai par défaut de Node.
server.requestTimeout = 0;
