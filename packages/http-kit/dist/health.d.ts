/** Vérification de disponibilité : résout si la dépendance répond, rejette sinon. */
export type ReadinessCheck = () => Promise<unknown>;
/**
 * `/health` (vivacité) : le processus répond, sans dépendance. `/ready` (disponibilité) : chaque
 * vérification doit aboutir en moins de 2 s (ADR 0020). Le détail d'un échec reste dans le journal.
 */
export declare function healthRoutes(service: string, checks: Record<string, ReadinessCheck>, onFailure?: (name: string, err: unknown) => void): import("express-serve-static-core").Router;
