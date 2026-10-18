import type { Operation } from "@attesta/http-kit";
import type { Express } from "express";

/**
 * Routes métier du service, et leur description pour `openapi.yaml` (ADR 0017). Le code métier est
 * extrait du monolithe en Phase M2 (voir README.md) ; d'ici là, le service expose `/health` et `/ready`.
 */
export const operations: Operation[] = [];

export function registerRoutes(_app: Express): void {}
