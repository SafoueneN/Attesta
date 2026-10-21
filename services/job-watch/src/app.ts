import { createServiceApp, type ReadinessCheck } from "@attesta/http-kit";
import type { Express } from "express";
import { SERVICE } from "./config.js";
import { registerRoutes, type RouteDeps } from "./routes.js";

export interface AppDeps extends RouteDeps {
  /** Dépendances vérifiées par `/ready`. */
  readiness: Record<string, ReadinessCheck>;
  trustProxy?: number;
}

/** Application du service, sans écoute : les tests l'appellent directement avec supertest. */
export function createApp({ readiness, trustProxy, ...deps }: AppDeps): Express {
  return createServiceApp({
    service: SERVICE,
    logger: deps.logger,
    readiness,
    trustProxy,
    routes: (app) => registerRoutes(app, deps),
  });
}
