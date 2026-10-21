import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  AppError,
  authenticate,
  forbidden,
  parseInput,
  principalOf,
  requireAccount,
  requireRole,
  requireScope,
  unauthorized,
  type Operation,
  type ServiceClient,
} from "@attesta/http-kit";
import type { Logger } from "@attesta/logger";
import {
  AccountDeletion,
  AuthAdminStats,
  ConsentUpdate,
  IdParam,
  LoginLinkPreview,
  LoginLinkRequest,
  LoginToken,
  Me,
  ServiceTokenRequest,
  ServiceTokenResponse,
  SessionCreate,
  SessionResponse,
  UserContact,
} from "@attesta/shared-schemas";
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  clearCookie,
  GUEST_COOKIE,
  readCookie,
  REFRESH_COOKIE,
  setCookie,
  type CookieSettings,
} from "./cookies.js";
import { ACCESS_TTL_S, GUEST_ACCESS_TTL_S, GUEST_MAX_S, SERVICE_TTL_S, type Signer } from "./keys.js";
import { loginLinkMessage, type Mailer } from "./mail.js";
import { exportAll } from "./rgpd.js";
import { maskEmail, REFRESH_MAX_MS, type AuthStore, type User } from "./store.js";

/**
 * Jetons de service autorisés (ADR 0014, point 8) : pour chaque service demandeur, les couples
 * « audience portée » qu'il peut obtenir. Tout le reste est refusé.
 */
export const SERVICE_GRANTS: Record<string, string[]> = {
  "job-watch": [
    "auth users:contact",
    "profiles profiles:read",
    "jobs-matching matching:run",
    "letters-export reports:render",
  ],
};

export interface RouteDeps {
  store: AuthStore;
  signer: Signer;
  mailer: Mailer;
  logger: Logger;
  clients: Map<string, ServiceClient>;
  appBaseUrl: string;
  adminEmails: string[];
  ipHashSecret: string;
  serviceSecrets: Map<string, string>;
  cookies: CookieSettings;
  /** Demandes de lien par adresse et par heure (en plus du plafond par IP de la gateway). */
  loginLinksPerHour?: number;
}

const invalidLink = () =>
  new AppError(
    "lien_invalide",
    410,
    "Ce lien n'est plus valide : il a déjà servi ou il a expiré. Vous pouvez en demander un nouveau.",
  );

const TokenParam = z.object({ token: LoginToken });

export const operations: Operation[] = [
  {
    method: "post",
    path: "/v1/login-links",
    operationId: "demanderLienConnexion",
    summary: "Envoie un lien de connexion à usage unique (réponse identique que le compte existe ou non)",
    tags: ["connexion"],
    body: LoginLinkRequest,
    responses: {
      202: { description: "Lien envoyé si l'adresse est valide" },
      400: { description: "Entrée invalide" },
      429: { description: "Trop de demandes" },
    },
  },
  {
    method: "get",
    path: "/v1/login-links/{token}",
    operationId: "apercuLienConnexion",
    summary: "Adresse masquée visée par un lien, sans le consommer",
    tags: ["connexion"],
    responses: {
      200: { description: "Lien valide", schema: LoginLinkPreview },
      410: { description: "Lien expiré ou déjà utilisé" },
    },
  },
  {
    method: "post",
    path: "/v1/session",
    operationId: "ouvrirSession",
    summary: "Consomme le lien ; jeton d'accès dans le corps, refresh token en cookie HttpOnly",
    tags: ["session"],
    body: SessionCreate,
    responses: {
      200: { description: "Session ouverte", schema: SessionResponse },
      410: { description: "Lien invalide" },
    },
  },
  {
    method: "post",
    path: "/v1/session/refresh",
    operationId: "rafraichirSession",
    summary: "Nouveau jeton d'accès (rotation du refresh token, ou renouvellement de l'invité)",
    tags: ["session"],
    responses: {
      200: { description: "Jeton renouvelé", schema: SessionResponse },
      401: { description: "Aucune session" },
    },
  },
  {
    method: "post",
    path: "/v1/session/guest",
    operationId: "sessionInvite",
    summary: "Jeton d'invité pour le parcours sans compte (2 h, 24 h au plus)",
    tags: ["session"],
    responses: { 200: { description: "Jeton d'invité", schema: SessionResponse } },
  },
  {
    method: "delete",
    path: "/v1/session",
    operationId: "fermerSession",
    summary: "Déconnexion : révocation de la famille de refresh tokens",
    tags: ["session"],
    responses: { 204: { description: "Session fermée" } },
  },
  {
    method: "get",
    path: "/v1/me",
    operationId: "monCompte",
    summary: "Compte connecté et historique des consentements",
    tags: ["compte"],
    auth: true,
    responses: { 200: { description: "Compte", schema: Me }, 401: { description: "Non connecté" } },
  },
  {
    method: "put",
    path: "/v1/me/consents",
    operationId: "modifierConsentement",
    summary: "Accorde ou retire le consentement aux communications",
    tags: ["compte"],
    auth: true,
    body: ConsentUpdate,
    responses: { 204: { description: "Consentement journalisé" } },
  },
  {
    method: "get",
    path: "/v1/me/export",
    operationId: "exporterMesDonnees",
    summary:
      "Export JSON de toutes les données du compte, agrégé depuis chaque service (RGPD, art. 15 et 20)",
    tags: ["compte"],
    auth: true,
    responses: { 200: { description: "Archive JSON" }, 503: { description: "Un service ne répond pas" } },
  },
  {
    method: "delete",
    path: "/v1/me",
    operationId: "supprimerMonCompte",
    summary: "Suppression définitive du compte, propagée à tous les services (RGPD, art. 17)",
    tags: ["compte"],
    auth: true,
    body: AccountDeletion,
    responses: { 202: { description: "Suppression engagée, jetons révoqués" } },
  },
  {
    method: "get",
    path: "/.well-known/jwks.json",
    operationId: "jwks",
    summary: "Clés publiques de vérification des jetons (JWKS)",
    tags: ["clés"],
    responses: { 200: { description: "Jeu de clés" } },
  },
  {
    method: "get",
    path: "/v1/admin/stats",
    operationId: "statistiquesComptes",
    summary: "Compteurs de comptes et de l'outbox RGPD, sans donnée personnelle",
    tags: ["administration"],
    auth: true,
    responses: {
      200: { description: "Statistiques", schema: AuthAdminStats },
      403: { description: "Réservé aux administrateurs" },
    },
  },
  {
    method: "post",
    path: "/internal/v1/token",
    operationId: "jetonDeService",
    summary: "Jeton de service de 5 min (interne, jamais routé par la gateway)",
    tags: ["interne"],
    body: ServiceTokenRequest,
    responses: {
      200: { description: "Jeton", schema: ServiceTokenResponse },
      403: { description: "Refusé" },
    },
  },
  {
    method: "get",
    path: "/internal/v1/users/{id}/contact",
    operationId: "contactUtilisateur",
    summary: "Adresse d'envoi d'un compte (jeton de service users:contact)",
    tags: ["interne"],
    auth: true,
    responses: {
      200: { description: "Contact", schema: UserContact },
      404: { description: "Compte inconnu" },
    },
  },
];

export function registerRoutes(app: Express, deps: RouteDeps): void {
  const { store, signer, logger, cookies } = deps;
  const ipHash = (req: Request) =>
    createHmac("sha256", deps.ipHashSecret)
      .update(req.ip ?? "")
      .digest("base64url");
  const auth = authenticate(signer.verifier);

  /** Routes qui lisent un cookie : en-tête exigé, qu'une page tierce ne peut pas ajouter (ADR 0022). */
  const csrf = (req: Request, _res: Response, next: NextFunction) =>
    next(req.get("x-attesta-csrf") === "1" ? undefined : forbidden("Requête refusée."));

  const noStore = (_req: Request, res: Response, next: NextFunction) => {
    res.set("Cache-Control", "no-store");
    next();
  };
  app.use("/v1", noStore);

  const userSession = async (res: Response, user: User, refreshToken?: string) => {
    if (refreshToken) setCookie(res, cookies, REFRESH_COOKIE, refreshToken, REFRESH_MAX_MS);
    const accessToken = await signer.accessToken(user.id, user.role, ACCESS_TTL_S);
    res.json({
      accessToken,
      expiresIn: ACCESS_TTL_S,
      user: { id: user.id, role: user.role, email: user.email },
    });
  };

  // --- Connexion par lien magique ---------------------------------------------------------------

  const perEmail = new Map<string, number[]>();
  const limit = deps.loginLinksPerHour ?? 5;
  const emailAllowed = (email: string) => {
    const key = createHash("sha256").update(email).digest("base64url");
    const now = Date.now();
    const recent = (perEmail.get(key) ?? []).filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length >= limit) return false;
    perEmail.set(key, [...recent, now]);
    if (perEmail.size > 10_000) perEmail.delete(perEmail.keys().next().value!);
    return true;
  };

  app.post("/v1/login-links", async (req, res) => {
    const { email } = parseInput(LoginLinkRequest, req.body);
    if (!emailAllowed(email)) {
      throw new AppError(
        "trop_de_demandes",
        429,
        "Trop de demandes pour cette adresse. Réessayez dans une heure.",
      );
    }
    const token = await store.createLoginToken(email);
    await deps.mailer.send(loginLinkMessage(email, new URL(`/connexion/${token}`, deps.appBaseUrl).href));
    logger.info({ event: "lien_connexion_envoye" }, "connexion");
    // Réponse identique que l'adresse ait un compte ou non : aucune énumération possible.
    res
      .status(202)
      .json({ message: "Si l'adresse est valide, un lien de connexion vient de lui être envoyé." });
  });

  // L'aperçu ne consomme pas le lien : un antivirus de messagerie qui visite les liens ne connecte personne,
  // et l'adresse masquée évite d'être connecté, à son insu, au compte d'un tiers qui aurait envoyé son lien.
  app.get("/v1/login-links/:token", async (req, res) => {
    res.set("Referrer-Policy", "no-referrer");
    const params = TokenParam.safeParse(req.params);
    const email = params.success ? await store.loginTokenEmail(params.data.token) : undefined;
    if (!email) throw invalidLink();
    res.json({ maskedEmail: maskEmail(email) });
  });

  app.post("/v1/session", async (req, res) => {
    const body = SessionCreate.safeParse(req.body);
    const result = body.success
      ? await store.consumeLoginToken(body.data.token, deps.adminEmails, ipHash(req))
      : undefined;
    if (!result) throw invalidLink();
    logger.info({ event: result.created ? "compte_cree" : "connexion" }, "connexion");
    clearCookie(res, cookies, GUEST_COOKIE);
    await userSession(res, result.user, await store.issueRefreshToken(result.user.id));
  });

  app.post("/v1/session/refresh", csrf, async (req, res) => {
    const refresh = readCookie(req, REFRESH_COOKIE);
    if (refresh) {
      const rotated = await store.rotateRefreshToken(refresh);
      if (rotated.kind === "ok") return userSession(res, rotated.user, rotated.token);
      clearCookie(res, cookies, REFRESH_COOKIE);
      if (rotated.kind === "reuse") logger.warn({ event: "refresh_reutilise" }, "session");
      throw unauthorized("Votre session a expiré. Reconnectez-vous.");
    }
    const guest = await readGuest(req);
    if (guest) return guestSession(res, guest.sub, guest.startedAt);
    throw unauthorized("Aucune session en cours.");
  });

  const readGuest = async (req: Request) => {
    const value = readCookie(req, GUEST_COOKIE);
    return value ? signer.readGuestCookie(value) : undefined;
  };

  async function guestSession(res: Response, sub: string, startedAt: number) {
    const remaining = Math.floor((startedAt + GUEST_MAX_S * 1000 - Date.now()) / 1000);
    const ttl = Math.max(1, Math.min(GUEST_ACCESS_TTL_S, remaining));
    setCookie(res, cookies, GUEST_COOKIE, await signer.guestCookie(sub, startedAt), remaining * 1000);
    res.json({
      accessToken: await signer.accessToken(sub, "guest", ttl),
      expiresIn: ttl,
      user: { id: sub, role: "guest" },
    });
  }

  // Parcours sans compte : identité d'invité reprise tant qu'elle a moins de 24 h, sinon une nouvelle.
  app.post("/v1/session/guest", csrf, async (req, res) => {
    const existing = await readGuest(req);
    if (existing) return guestSession(res, existing.sub, existing.startedAt);
    await guestSession(res, `guest_${crypto.randomUUID()}`, Date.now());
  });

  app.delete("/v1/session", csrf, async (req, res) => {
    const refresh = readCookie(req, REFRESH_COOKIE);
    if (refresh) await store.revokeFamily(refresh);
    clearCookie(res, cookies, REFRESH_COOKIE);
    clearCookie(res, cookies, GUEST_COOKIE);
    res.status(204).end();
  });

  // --- Compte -------------------------------------------------------------------------------------

  const currentUser = async (res: Response) => {
    const user = await store.user(principalOf(res).sub);
    if (!user || user.status !== "active") throw unauthorized("Votre session a expiré. Reconnectez-vous.");
    return user;
  };

  app.get("/v1/me", auth, requireAccount(), async (_req, res) => {
    const user = await currentUser(res);
    const consents = await store.consents(user.id);
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      consents: consents.map((c) => ({ ...c, at: c.at.toISOString() })),
    });
  });

  app.put("/v1/me/consents", auth, requireAccount(), async (req, res) => {
    const body = parseInput(ConsentUpdate, req.body);
    const user = await currentUser(res);
    await store.recordConsent(user.id, body.purpose, body.granted, ipHash(req));
    res.status(204).end();
  });

  app.get("/v1/me/export", auth, requireAccount(), async (_req, res) => {
    const user = await currentUser(res);
    const data = await exportAll({ store, signer, clients: deps.clients }, user.id);
    logger.info({ event: "export_donnees" }, "compte");
    res
      .type("application/json")
      .attachment("attesta-mes-donnees.json")
      .send(JSON.stringify(data, null, 2));
  });

  app.delete("/v1/me", auth, requireAccount(), async (req, res) => {
    parseInput(AccountDeletion, req.body);
    const user = await currentUser(res);
    await store.requestDeletion(user.id, [...deps.clients.keys()], ipHash(req));
    clearCookie(res, cookies, REFRESH_COOKIE);
    logger.info({ event: "suppression_demandee" }, "compte");
    res.status(202).json({ message: "Vos données ont été effacées." });
  });

  // --- Clés, administration, interne -------------------------------------------------------------

  app.get("/.well-known/jwks.json", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json(signer.jwks());
  });

  app.get("/v1/admin/stats", auth, requireRole("admin"), async (_req, res) => {
    logger.info({ event: "admin_acces", route: "/v1/admin/stats" }, "administration");
    res.json(await store.stats());
  });

  app.post("/internal/v1/token", async (req, res) => {
    const body = parseInput(ServiceTokenRequest, req.body);
    const expected = deps.serviceSecrets.get(body.service);
    const digest = (v: string) => createHash("sha256").update(v).digest();
    const secretOk = expected !== undefined && timingSafeEqual(digest(body.secret), digest(expected));
    const granted = SERVICE_GRANTS[body.service]?.includes(`${body.audience} ${body.scope}`) ?? false;
    if (!secretOk || !granted) {
      logger.warn({ event: "jeton_service_refuse", service: body.service }, "interne");
      throw forbidden();
    }
    res.json({
      accessToken: await signer.serviceToken(body.service, body.audience, body.scope),
      expiresIn: SERVICE_TTL_S,
    });
  });

  app.get("/internal/v1/users/:id/contact", auth, requireScope("users:contact"), async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    const user = await store.user(id);
    if (!user) throw new AppError("introuvable", 404, "Compte introuvable.");
    res.json({ id: user.id, email: user.email, status: user.status });
  });
}
