import { ConfigError } from "@attesta/config";
import { startServer } from "@attesta/http-kit";
import { createLogger } from "@attesta/logger";
import { createApp } from "./app.js";
import { loadConfig, SERVICE } from "./config.js";
import { checkDatabase, createPool } from "./db.js";

let config;
try {
  config = loadConfig();
} catch (err) {
  // Configuration invalide : on s'arrête avant d'écouter, avec la liste des variables en cause.
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
}

const logger = createLogger({ service: SERVICE, level: config.LOG_LEVEL });
const pool = createPool(config.DATABASE_URL);
pool.on("error", (err) => logger.error({ err, event: "pg_erreur" }, "connexion PostgreSQL perdue"));

const app = createApp({
  logger,
  trustProxy: config.TRUST_PROXY,
  readiness: { base: () => checkDatabase(pool) },
});
await startServer({ app, port: config.PORT, logger, onClose: () => pool.end() });
