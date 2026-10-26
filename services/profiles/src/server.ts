import { ConfigError } from "@attesta/config";
import { createJwksVerifier, startServer, USER_AUDIENCE } from "@attesta/http-kit";
import { BudgetedProvider, createAiProvider, pgUsageStore } from "@attesta/llm-client";
import { createLogger } from "@attesta/logger";
import { createApp } from "./app.js";
import { assistantDemoHandlers } from "./assistant.js";
import { evidenceKey, loadConfig, SERVICE } from "./config.js";
import { checkDatabase, createPool, migrate } from "./db.js";
import { ProfileStore } from "./store.js";

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

const store = new ProfileStore(pool);
// Démonstration : seuls les assistants ont un gestionnaire ; l'import de CV exige un vrai modèle.
const provider = createAiProvider(config, config.NODE_ENV, assistantDemoHandlers, (event) =>
  logger.warn({ event: "llm_repli", ...event }, "llm"),
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

// Purge des profils d'invité de plus de 24 h (ADR 0019, point 5).
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
  verifier: createJwksVerifier(config.AUTH_JWKS_URL, { audience: [USER_AUDIENCE, SERVICE] }),
  llm,
  evidenceKey: evidenceKey(config),
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
