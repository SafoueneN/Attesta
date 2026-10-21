import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AppError,
  bearerToken,
  errorHandler,
  forbidden,
  healthRoutes,
  notFoundHandler,
  problem,
  requestId,
  unauthorized,
  type TokenVerifier,
} from "@attesta/http-kit";
import type { Logger } from "@attesta/logger";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { createProxyMiddleware } from "http-proxy-middleware";
import { SERVICE, type Config } from "./config.js";
import { isAdminPath, isInternalPath, isPublic, normalizeRoute, UPSTREAMS } from "./routing.js";

export interface GatewayDeps {
  config: Config;
  logger: Logger;
  verifier: TokenVerifier;
  fetchImpl?: typeof fetch;
}

const MB = 1024 * 1024;

/** Taille des corps (ADR 0015, point 5) : 1 Mo, 10 Mo pour l'import d'un CV PDF. */
function bodyLimit(req: Request, _res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  // Chemin d'origine : monté sous `/api`, `req.path` a perdu son préfixe.
  const path = req.originalUrl.split("?")[0];
  const max = path === "/api/profiles/v1/profiles/import" ? 10 * MB : 1 * MB;
  const length = req.get("content-length");
  if (length === undefined) {
    if (req.get("transfer-encoding"))
      return next(new AppError("longueur_requise", 411, "Longueur de la requête requise."));
    return next();
  }
  next(
    Number(length) > max
      ? new AppError("trop_volumineux", 413, "La requête est trop volumineuse.")
      : undefined,
  );
}

/**
 * Gateway (ADR 0015) : sans état et sans logique métier. Ordre : en-têtes, corrélation, journal d'accès,
 * refus des requêtes intersites, santé, débit, taille, identité et rôle, puis mandataire vers le service.
 */
export function createGateway({ config, logger, verifier, fetchImpl = fetch }: GatewayDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);
  app.use(helmet());
  app.use(requestId);

  // Journal d'accès sans donnée personnelle : ni corps, ni chaîne de requête, ni en-tête d'identité.
  app.use((req, res, next) => {
    if (req.path === "/health" || req.path === "/ready") return next();
    const start = process.hrtime.bigint();
    // Chemin complet relevé avant le montage des routes, qui retire leur préfixe.
    const route = normalizeRoute(req.path);
    res.on("finish", () => {
      const ms = Number((process.hrtime.bigint() - start) / 1_000_000n);
      logger.info({ event: "http", method: req.method, route, status: res.statusCode, ms }, "http");
    });
    next();
  });

  // Aucune CORS : une page d'un autre site ne peut pas envoyer d'en-tête personnalisé (X-Attesta-Csrf,
  // Authorization) sans requête préalable OPTIONS, refusée ici (ADR 0022, point 3).
  app.options(/.*/, (_req, res) => {
    res.status(403).end();
  });

  app.use(healthRoutes(SERVICE, {}));

  const limiter = (windowMs: number, limit: number, message: string): RequestHandler =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) => {
        res
          .status(429)
          .type("application/problem+json")
          .json(problem("trop_de_requetes", 429, message, undefined, res.locals.requestId as string));
      },
    });
  const HOUR = 60 * 60 * 1000;
  app.use("/api", limiter(60_000, config.RATE_LIMIT_PER_MINUTE, "Trop de requêtes. Patientez une minute."));
  app.post(
    "/api/auth/v1/login-links",
    limiter(HOUR, config.RATE_LIMIT_LOGIN_PER_HOUR, "Trop de demandes de connexion. Réessayez plus tard."),
  );
  app.post(
    "/api/cv/v1/generations",
    limiter(HOUR, config.RATE_LIMIT_GENERATION_PER_HOUR, "Limite de générations atteinte pour cette heure."),
  );
  app.post(
    /^\/api\/letters\/v1\/(exports|letters)/,
    limiter(HOUR, config.RATE_LIMIT_EXPORT_PER_HOUR, "Limite d'exports atteinte pour cette heure."),
  );
  app.post(
    "/api/profiles/v1/profiles/import",
    limiter(HOUR, config.RATE_LIMIT_IMPORT_PER_HOUR, "Limite d'imports atteinte pour cette heure."),
  );
  app.use("/api", bodyLimit);

  /** Vérifie le jeton (sauf liste blanche), réserve `/v1/admin/*` aux administrateurs (ADR 0024). */
  const guard =
    (service: string): RequestHandler =>
    async (req, res, next) => {
      if (isInternalPath(req.path)) return next(new AppError("introuvable", 404, "Ressource introuvable."));
      if (isPublic(service, req.method, req.path)) return next();
      const token = bearerToken(req);
      if (!token) return next(unauthorized());
      let role: string;
      try {
        ({ role } = await verifier.verify(token));
      } catch {
        return next(unauthorized("Votre session a expiré. Reconnectez-vous."));
      }
      if (role === "service") return next(forbidden());
      if (isAdminPath(req.path) && role !== "admin") return next(forbidden());
      next();
    };

  // Santé agrégée des services, pour le tableau de bord d'administration.
  app.get("/api/admin/v1/health", async (req, res, next) => {
    const token = bearerToken(req);
    const principal = token ? await verifier.verify(token).catch(() => undefined) : undefined;
    if (!principal) return next(unauthorized());
    if (principal.role !== "admin") return next(forbidden());
    const services = await Promise.all(
      UPSTREAMS.map(async ({ service, urlKey }) => {
        const started = Date.now();
        try {
          const r = await fetchImpl(`${config[urlKey]}/ready`, { signal: AbortSignal.timeout(3000) });
          const body = (await r.json().catch(() => ({}))) as { checks?: Record<string, string> };
          return {
            service,
            status: r.ok ? "ok" : "indisponible",
            checks: body.checks ?? {},
            ms: Date.now() - started,
          };
        } catch {
          return { service, status: "injoignable", checks: {}, ms: Date.now() - started };
        }
      }),
    );
    logger.info({ event: "admin_acces", route: "/api/admin/v1/health" }, "administration");
    res.set("Cache-Control", "no-store").json({ gateway: "ok", services });
  });

  for (const upstream of UPSTREAMS) {
    const proxy = createProxyMiddleware<IncomingMessage, ServerResponse>({
      target: config[upstream.urlKey],
      changeOrigin: true,
      xfwd: true,
      proxyTimeout: upstream.timeoutMs,
      on: {
        proxyReq: (proxyReq, req) => {
          const id = (req as Request).res?.locals.requestId as string | undefined;
          if (id) proxyReq.setHeader("x-request-id", id);
        },
        error: (err, _req, res) => {
          logger.warn(
            {
              event: "service_injoignable",
              service: upstream.service,
              code: (err as NodeJS.ErrnoException).code,
            },
            "proxy",
          );
          const response = res as ServerResponse;
          if (response.headersSent || typeof response.writeHead !== "function") return response.end?.();
          response.writeHead(503, { "content-type": "application/problem+json" });
          response.end(
            JSON.stringify(
              problem(
                "service_indisponible",
                503,
                "Ce service est momentanément indisponible. Réessayez dans un instant.",
              ),
            ),
          );
        },
      },
    });
    app.use(upstream.prefix, guard(upstream.service), proxy);
  }

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
