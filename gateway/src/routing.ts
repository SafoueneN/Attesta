/**
 * Table de routage de la gateway (ADR 0015, point 2) et liste blanche des routes sans jeton (point 3).
 * Les chemins sont ceux vus par le service, préfixe `/api/<nom>` retiré.
 */

export interface Upstream {
  /** Préfixe public : `/api/auth`. */
  prefix: string;
  /** Nom du service, et clé de son URL dans la configuration. */
  service: string;
  urlKey:
    | "AUTH_URL"
    | "PROFILES_URL"
    | "CV_GENERATION_URL"
    | "JOBS_MATCHING_URL"
    | "JOB_WATCH_URL"
    | "LETTERS_EXPORT_URL";
  /** Délai d'attente de la réponse (10 s par défaut, 120 s pour la génération et l'export). */
  timeoutMs: number;
}

export const UPSTREAMS: Upstream[] = [
  { prefix: "/api/auth", service: "auth", urlKey: "AUTH_URL", timeoutMs: 15_000 },
  { prefix: "/api/profiles", service: "profiles", urlKey: "PROFILES_URL", timeoutMs: 120_000 },
  { prefix: "/api/cv", service: "cv-generation", urlKey: "CV_GENERATION_URL", timeoutMs: 180_000 },
  { prefix: "/api/jobs", service: "jobs-matching", urlKey: "JOBS_MATCHING_URL", timeoutMs: 120_000 },
  { prefix: "/api/watch", service: "job-watch", urlKey: "JOB_WATCH_URL", timeoutMs: 30_000 },
  { prefix: "/api/letters", service: "letters-export", urlKey: "LETTERS_EXPORT_URL", timeoutMs: 120_000 },
];

const TOKEN = "[A-Za-z0-9_-]{20,100}";

/** Routes publiques, explicites et testées : tout le reste exige un jeton valide. */
const PUBLIC: Record<string, [method: string, path: RegExp][]> = {
  auth: [
    ["POST", /^\/v1\/login-links$/],
    ["GET", new RegExp(`^/v1/login-links/${TOKEN}$`)],
    ["POST", /^\/v1\/session$/],
    ["POST", /^\/v1\/session\/refresh$/],
    ["POST", /^\/v1\/session\/guest$/],
    ["DELETE", /^\/v1\/session$/],
    ["GET", /^\/\.well-known\/jwks\.json$/],
  ],
  "job-watch": [
    // Double opt-in et désabonnement en un clic (RFC 8058) : le jeton du lien suffit.
    ["POST", new RegExp(`^/v1/subscriptions/confirm/${TOKEN}$`)],
    ["POST", new RegExp(`^/v1/subscriptions/unsubscribe/${TOKEN}$`)],
    // Webhook du fournisseur d'e-mail, authentifié par son propre secret.
    ["POST", /^\/v1\/webhooks\/brevo$/],
  ],
};

export function isPublic(service: string, method: string, path: string): boolean {
  return (PUBLIC[service] ?? []).some(([m, pattern]) => m === method && pattern.test(path));
}

export const isAdminPath = (path: string) => /^\/v1\/admin(\/|$)/.test(path);

/** Jamais routé : les appels internes passent par le réseau docker (ADR 0012, point 3). */
export const isInternalPath = (path: string) => /^\/internal(\/|$)/i.test(path);

/** Route normalisée pour le journal : jetons et identifiants remplacés (ADR 0015, point 7). */
export function normalizeRoute(path: string): string {
  return path
    .replace(new RegExp(`/${TOKEN}(?=/|$)`, "g"), (segment) =>
      /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ? "/:id" : "/:jeton",
    )
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:n");
}
