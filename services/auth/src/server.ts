import { ConfigError } from "@attesta/config";
import { startServer } from "@attesta/http-kit";
import { createLogger } from "@attesta/logger";
import { createApp } from "./app.js";
import { loadConfig, SERVICE } from "./config.js";
import { checkDatabase, createPool, migrate } from "./db.js";
import { loadSigner } from "./keys.js";
import { SmtpMailer } from "./mail.js";
import { holderClients, startWorkers } from "./rgpd.js";
import { AuthStore } from "./store.js";

let config;
try {
  config = loadConfig();
} catch (err) {
  // Configuration invalide : on s'arrête avant d'écouter, avec la liste des variables en cause.
  console.error(err instanceof ConfigError || err instanceof Error ? err.message : err);
  process.exit(1);
}

const logger = createLogger({ service: SERVICE, level: config.LOG_LEVEL });
if (config.MIGRATE_ON_START) await migrate(config.DATABASE_URL);
const pool = createPool(config.DATABASE_URL);
pool.on("error", (err) => logger.error({ err, event: "pg_erreur" }, "connexion PostgreSQL perdue"));

if (!config.AUTH_PRIVATE_KEY)
  logger.warn({ event: "cle_ephemere" }, "clé de signature éphémère (hors production)");
const signer = await loadSigner(config.AUTH_PRIVATE_KEY, config.AUTH_KEY_ID);
const store = new AuthStore(pool);
const clients = holderClients(config.holders);
const stopWorkers = startWorkers({ store, signer, logger, clients }, [...clients.keys()]);

const app = createApp({
  logger,
  trustProxy: config.TRUST_PROXY,
  readiness: { base: () => checkDatabase(pool) },
  store,
  signer,
  mailer: new SmtpMailer(config.SMTP_URL, config.MAIL_FROM),
  clients,
  appBaseUrl: config.APP_BASE_URL,
  adminEmails: config.ADMIN_EMAILS,
  ipHashSecret: config.IP_HASH_SECRET,
  serviceSecrets: config.serviceSecrets,
  cookies: { path: config.COOKIE_PATH, secure: config.COOKIE_SECURE },
});
await startServer({
  app,
  port: config.PORT,
  logger,
  onClose: async () => {
    stopWorkers();
    await pool.end();
  },
});
