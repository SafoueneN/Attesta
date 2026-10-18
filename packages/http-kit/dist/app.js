import express from "express";
import helmet from "helmet";
import { accessLog } from "./access-log.js";
import { errorHandler, notFoundHandler } from "./error-handler.js";
import { healthRoutes } from "./health.js";
import { requestId } from "./request-id.js";
/**
 * Application Express d'un service, avec le socle commun dans l'ordre : en-têtes, `X-Request-Id`, journal
 * d'accès, corps JSON, santé, routes du service, 404, gestionnaire d'erreurs au format commun.
 */
export function createServiceApp(options) {
    const { service, logger } = options;
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", options.trustProxy ?? 0);
    app.use(helmet());
    app.use(requestId);
    app.use(accessLog(logger));
    app.use(express.json({ limit: options.bodyLimit ?? "1mb" }));
    app.use(healthRoutes(service, options.readiness ?? {}, (name, err) => logger.warn({ event: "ready_echec", check: name, err }, "dépendance indisponible")));
    options.routes(app);
    app.use(notFoundHandler);
    app.use(errorHandler(logger));
    return app;
}
