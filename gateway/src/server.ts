import { ConfigError } from "@attesta/config";
import { createJwksVerifier, startServer, USER_AUDIENCE } from "@attesta/http-kit";
import { createLogger } from "@attesta/logger";
import { createGateway } from "./app.js";
import { loadConfig, SERVICE } from "./config.js";

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
}

const logger = createLogger({ service: SERVICE, level: config.LOG_LEVEL });
const verifier = createJwksVerifier(`${config.AUTH_URL}/.well-known/jwks.json`, { audience: USER_AUDIENCE });
const server = await startServer({
  app: createGateway({ config, logger, verifier }),
  port: config.PORT,
  logger,
});
// Flux SSE de la génération : aucune coupure d'inactivité côté serveur tant que des événements arrivent.
server.requestTimeout = 0;
server.headersTimeout = 60_000;
