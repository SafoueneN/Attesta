import { ConfigError } from "@attesta/config";
import { createJwksVerifier, startServer, USER_AUDIENCE } from "@attesta/http-kit";
import { createLogger } from "@attesta/logger";
import { createApp } from "./app.js";
import { loadConfig, SERVICE } from "./config.js";
import { parisNow, startScheduler } from "./daily.js";
import { checkDatabase, createPool, migrate } from "./db.js";
import { SmtpMailer } from "./mail.js";
import { startReminders } from "./reminders.js";
import { WatchStore } from "./store.js";
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

const store = new WatchStore(pool);
const deps = {
  store,
  upstreams: httpUpstreams(
    {
      auth: config.AUTH_URL,
      profiles: config.PROFILES_URL,
      jobsMatching: config.JOBS_MATCHING_URL,
      lettersExport: config.LETTERS_EXPORT_URL,
    },
    config.SERVICE_SECRET,
  ),
  mailer: new SmtpMailer(config.SMTP_URL, config.MAIL_FROM),
  logger,
  appBaseUrl: config.APP_BASE_URL,
};
const stopScheduler = config.DAILY_RUN_ENABLED
  ? startScheduler(deps, config.DAILY_RUN_HOUR)
  : () => undefined;
const stopReminders = startReminders(deps, () => parisNow().date);
const purge = setInterval(
  () =>
    store
      .purge()
      .then((counts) => logger.info({ event: "purge", ...counts }, "purge"))
      .catch((err) => logger.warn({ event: "purge_erreur", errorType: err?.name }, "purge")),
  6 * 60 * 60 * 1000,
);
purge.unref();

const app = createApp({
  ...deps,
  trustProxy: config.TRUST_PROXY,
  readiness: { base: () => checkDatabase(pool) },
  verifier: createJwksVerifier(config.AUTH_JWKS_URL, { audience: [USER_AUDIENCE, SERVICE] }),
  ipHashSecret: config.IP_HASH_SECRET,
  brevoWebhookToken: config.BREVO_WEBHOOK_TOKEN,
});
await startServer({
  app,
  port: config.PORT,
  logger,
  onClose: async () => {
    stopScheduler();
    stopReminders();
    clearInterval(purge);
    await pool.end();
  },
});
