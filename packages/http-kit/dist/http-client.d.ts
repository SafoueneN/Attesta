import { AppError } from "./errors.js";
import type { Problem } from "./problem.js";
/**
 * Réponse non attendue d'un autre service, ou service injoignable. Le message public reste générique ;
 * `upstreamStatus` et `problem` permettent au consommateur de réagir (404, 409…) sans tout relayer.
 */
export declare class UpstreamError extends AppError {
    readonly target: string;
    readonly upstreamStatus: number | undefined;
    readonly problem?: Problem | undefined;
    constructor(target: string, upstreamStatus: number | undefined, problem?: Problem | undefined, options?: {
        cause?: unknown;
    });
}
export interface RequestOptions {
    body?: unknown;
    /** Jeton relayé (utilisateur) ou jeton de service. */
    token?: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
    /** Statuts acceptés sans erreur (défaut : 2xx). */
    accept?: number[];
}
export interface ServiceClient {
    readonly target: string;
    json<T>(method: string, path: string, options?: RequestOptions): Promise<{
        status: number;
        data: T;
    }>;
    /** Réponse brute (PDF, flux) : le statut est vérifié, le corps est laissé au consommateur. */
    raw(method: string, path: string, options?: RequestOptions): Promise<Response>;
}
export interface ServiceClientOptions {
    /** Nom du service appelé, pour les journaux et les erreurs. */
    target: string;
    baseUrl: string;
    /** Défaut : 5 s (ADR 0012) ; 90 s sur les chemins LLM, passé par requête. */
    timeoutMs?: number;
    /** Reprises sur les seules méthodes idempotentes. */
    retries?: number;
    fetchImpl?: typeof fetch;
}
/**
 * Client HTTP entre services (ADR 0012, point 5) : `X-Request-Id` propagé, délai d'attente, 2 reprises
 * avec gigue sur GET, PUT et DELETE, erreurs typées. Ne journalise ni corps ni en-tête.
 */
export declare function createServiceClient(options: ServiceClientOptions): ServiceClient;
export interface ServiceTokenOptions {
    client: ServiceClient;
    /** Nom du service demandeur et son secret (`SERVICE_SECRET_<NOM>`, ADR 0014, point 8). */
    service: string;
    secret: string;
}
/**
 * Jetons de service émis par `auth` (5 min), mis en cache par audience et portée jusqu'à 30 s avant
 * leur expiration.
 */
export declare function createServiceTokens({ client, service, secret }: ServiceTokenOptions): (audience: string, scope: string) => Promise<string>;
