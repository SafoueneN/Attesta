import { createServiceApp, type ReadinessCheck } from "@attesta/http-kit";
import type { Logger } from "@attesta/logger";
import type { Express } from "express";
import { SERVICE } from "./config.js";
import { registerRoutes } from "./routes.js";

export interface AppDeps {
  logger: Logger;
  /** Dépendances vérifiées par `/ready`. */
  readiness: Record<string, ReadinessCheck>;
  trustProxy?: number;
}

/** Application du service, sans écoute : les tests l'appellent directement avec supertest. */
export function createApp({ logger, readiness, trustProxy }: AppDeps): Express {
  return createServiceApp({ service: SERVICE, logger, readiness, trustProxy, routes: registerRoutes });
}
