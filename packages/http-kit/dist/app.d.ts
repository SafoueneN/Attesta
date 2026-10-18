import type { Logger } from "@attesta/logger";
import { type Express } from "express";
import { type ReadinessCheck } from "./health.js";
export interface ServiceAppOptions {
    service: string;
    logger: Logger;
    /** Dépendances vérifiées par `/ready` (base, autres services…). */
    readiness?: Record<string, ReadinessCheck>;
    /** Taille maximale d'un corps JSON (défaut : 1 Mo, ADR 0015). */
    bodyLimit?: string;
    trustProxy?: number;
    /** Déclare les routes métier du service. */
    routes: (app: Express) => void;
}
/**
 * Application Express d'un service, avec le socle commun dans l'ordre : en-têtes, `X-Request-Id`, journal
 * d'accès, corps JSON, santé, routes du service, 404, gestionnaire d'erreurs au format commun.
 */
export declare function createServiceApp(options: ServiceAppOptions): Express;
