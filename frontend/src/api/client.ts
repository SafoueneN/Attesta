import type { SessionResponse, SessionUser } from "@attesta/shared-schemas";

/**
 * Seul module qui appelle `fetch` (ADR 0022, point 1). Le jeton d'accès vit en mémoire, jamais dans le
 * stockage du navigateur ; le refresh token est un cookie HttpOnly que JavaScript ne voit pas. Sur un 401,
 * un seul rafraîchissement est lancé (requêtes concurrentes regroupées), puis la requête est rejouée.
 */

export const API = "/api";

/** Erreur d'API au format commun (ADR 0017) : message en français, champs en cause. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    message: string,
    readonly fieldErrors: { champ: string; message: string }[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get code() {
    return this.type.replace("urn:attesta:erreur:", "");
  }
}

type Listener = (user: SessionUser | null) => void;

let accessToken: string | null = null;
let currentUser: SessionUser | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<Listener>();

export const session = {
  user: () => currentUser,
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(response: SessionResponse | null) {
    accessToken = response?.accessToken ?? null;
    currentUser = response?.user ?? null;
    for (const l of listeners) l(currentUser);
  },
};

/** En-tête exigé par auth sur les routes qui lisent un cookie (ADR 0022, point 3). */
const CSRF = { "X-Attesta-Csrf": "1" };

async function toError(res: Response): Promise<ApiError> {
  let body: {
    type?: string;
    title?: string;
    errors?: { champ: string; message: string }[];
    requestId?: string;
  } = {};
  try {
    body = await res.json();
  } catch {
    // corps absent ou non JSON (proxy, panne)
  }
  const fallback =
    res.status >= 500
      ? "Le service est momentanément indisponible. Réessayez dans un instant."
      : "La requête n'a pas pu aboutir.";
  return new ApiError(
    res.status,
    body.type ?? `urn:attesta:erreur:http_${res.status}`,
    body.title ?? fallback,
    body.errors ?? [],
    body.requestId,
  );
}

async function sessionCall(path: string): Promise<SessionResponse | null> {
  const res = await fetch(`${API}/auth/v1/session${path}`, {
    method: "POST",
    headers: CSRF,
    credentials: "same-origin",
  });
  if (!res.ok) return null;
  return (await res.json()) as SessionResponse;
}

/**
 * Renouvelle le jeton d'accès : rotation du refresh token (compte) ou renouvellement de l'invité. Sans
 * session, ouvre une session d'invité : le parcours sans compte reste possible (ADR 0014, point 7).
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const renewed = (await sessionCall("/refresh")) ?? (await sessionCall("/guest"));
      session.set(renewed);
      return renewed !== null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Corps déjà formé (multipart) : envoyé tel quel. */
  form?: FormData;
  accept?: string;
  signal?: AbortSignal;
}

/** Requête brute authentifiée, avec un rafraîchissement unique sur 401. */
export async function send(path: string, options: RequestOptions = {}, retry = true): Promise<Response> {
  if (!accessToken && retry) await refreshSession();
  const headers: Record<string, string> = { Accept: options.accept ?? "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: options.method ?? "GET",
      headers,
      body,
      credentials: "same-origin",
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(
      0,
      "urn:attesta:erreur:reseau",
      "Connexion impossible. Vérifiez votre réseau puis réessayez.",
    );
  }
  if (res.status === 401 && retry && (await refreshSession())) return send(path, options, false);
  if (!res.ok) throw await toError(res);
  return res;
}

/** Requête JSON authentifiée. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await send(path, options);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Appel d'auth sans jeton (lien magique), avec l'en-tête anti-CSRF. */
export async function authCall<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/auth/v1${path}`, {
    method,
    headers: {
      ...CSRF,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  }).catch(() => {
    throw new ApiError(
      0,
      "urn:attesta:erreur:reseau",
      "Connexion impossible. Vérifiez votre réseau puis réessayez.",
    );
  });
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Appel public sans jeton (liens des e-mails de la veille). */
export async function publicCall(path: string, method = "POST"): Promise<void> {
  const res = await fetch(`${API}${path}`, { method, credentials: "omit" }).catch(() => {
    throw new ApiError(
      0,
      "urn:attesta:erreur:reseau",
      "Connexion impossible. Vérifiez votre réseau puis réessayez.",
    );
  });
  if (!res.ok) throw await toError(res);
}

/** Télécharge une réponse binaire (PDF, export JSON) sous le nom donné par le serveur. */
export async function download(path: string, options: RequestOptions, fallbackName: string) {
  const res = await send(path, options);
  const disposition = res.headers.get("content-disposition") ?? "";
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
