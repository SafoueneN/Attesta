import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  AppError,
  authenticate,
  notFound,
  parseInput,
  principalOf,
  requireAccount,
  requireRole,
  requireScope,
  type Operation,
  type TokenVerifier,
} from "@attesta/http-kit";
import type { Logger } from "@attesta/logger";
import {
  Reminder,
  ReminderInput,
  ServiceStats,
  Subscription,
  SubscriptionInput,
  SubscriptionSaved,
  UserExport,
  WatchMatch,
  WatchRun,
} from "@attesta/shared-schemas";
import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { parisNow, runDaily, type DailyDeps } from "./daily.js";
import { recipientOf } from "./reminders.js";
import type { ReminderRow, SubscriptionRow } from "./store.js";

export interface RouteDeps extends DailyDeps {
  verifier: TokenVerifier;
  logger: Logger;
  ipHashSecret: string;
  brevoWebhookToken?: string;
}

const Token = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, "Ce lien n'est pas valide.") });
const UserParam = z.object({ id: z.string().regex(/^[0-9a-f-]{36}$/i, "Identifiant invalide") });

const invalidLink = () =>
  new AppError("lien_invalide", 410, "Ce lien n'est plus valide : il a déjà servi ou il a expiré.");

export const operations: Operation[] = [
  {
    method: "get",
    path: "/v1/reminders",
    operationId: "mesRappels",
    summary: "Rappels par courriel programmés par le candidat (ADR 0029)",
    tags: ["rappels"],
    auth: true,
    responses: { 200: { description: "Rappels", schema: z.array(Reminder) } },
  },
  {
    method: "post",
    path: "/v1/reminders",
    operationId: "programmerRappel",
    summary: "Programme un rappel (étape du plan, relance) ; 20 en attente au plus",
    tags: ["rappels"],
    auth: true,
    body: ReminderInput,
    responses: {
      201: { description: "Rappel programmé", schema: Reminder },
      400: { description: "Date invalide" },
      409: { description: "Trop de rappels en attente" },
    },
  },
  {
    method: "delete",
    path: "/v1/reminders/{id}",
    operationId: "supprimerRappel",
    summary: "Supprime un rappel",
    tags: ["rappels"],
    auth: true,
    responses: { 204: { description: "Supprimé" } },
  },
  {
    method: "get",
    path: "/v1/subscriptions/me",
    operationId: "maVeille",
    summary: "Abonnement à la veille de l'utilisateur connecté",
    tags: ["veille"],
    auth: true,
    responses: { 200: { description: "Abonnement", schema: Subscription }, 404: { description: "Aucun" } },
  },
  {
    method: "put",
    path: "/v1/subscriptions/me",
    operationId: "enregistrerVeille",
    summary: "Crée ou modifie la veille ; double opt-in par e-mail tant qu'elle n'est pas confirmée",
    tags: ["veille"],
    auth: true,
    body: SubscriptionInput,
    responses: {
      200: { description: "Abonnement", schema: SubscriptionSaved },
      400: { description: "Invalide" },
    },
  },
  {
    method: "delete",
    path: "/v1/subscriptions/me",
    operationId: "arreterVeille",
    summary: "Arrête la veille (retrait du consentement journalisé)",
    tags: ["veille"],
    auth: true,
    responses: { 204: { description: "Arrêtée" } },
  },
  {
    method: "get",
    path: "/v1/subscriptions/me/matches",
    operationId: "offresProposees",
    summary: "Offres envoyées par la veille ces 30 derniers jours",
    tags: ["veille"],
    auth: true,
    responses: { 200: { description: "Offres", schema: z.array(WatchMatch) } },
  },
  {
    method: "post",
    path: "/v1/subscriptions/confirm/{token}",
    operationId: "confirmerVeille",
    summary: "Confirmation de la veille (double opt-in), par le jeton du lien",
    tags: ["veille"],
    responses: { 204: { description: "Confirmée" }, 410: { description: "Lien invalide" } },
  },
  {
    method: "post",
    path: "/v1/subscriptions/unsubscribe/{token}",
    operationId: "desabonnement",
    summary: "Désabonnement en un clic (RFC 8058), par le jeton du lien",
    tags: ["veille"],
    responses: { 200: { description: "Désabonné" }, 410: { description: "Lien invalide" } },
  },
  {
    method: "post",
    path: "/v1/webhooks/brevo",
    operationId: "webhookBrevo",
    summary: "Plaintes, rebonds et désabonnements signalés par le fournisseur d'e-mail",
    tags: ["veille"],
    responses: { 204: { description: "Traité" }, 401: { description: "Secret invalide" } },
  },
  {
    method: "get",
    path: "/v1/admin/stats",
    operationId: "statistiquesVeille",
    summary: "Compteurs de la veille, sans donnée personnelle",
    tags: ["administration"],
    auth: true,
    responses: { 200: { description: "Statistiques", schema: ServiceStats } },
  },
  {
    method: "get",
    path: "/v1/admin/runs",
    operationId: "executionsVeille",
    summary: "Dernières exécutions de la veille et leur bilan",
    tags: ["administration"],
    auth: true,
    responses: { 200: { description: "Exécutions", schema: z.array(WatchRun) } },
  },
  {
    method: "post",
    path: "/v1/admin/runs",
    operationId: "lancerVeille",
    summary: "Lance l'exécution du jour maintenant (idempotente)",
    tags: ["administration"],
    auth: true,
    responses: { 202: { description: "Lancée" }, 409: { description: "Déjà en cours" } },
  },
  {
    method: "get",
    path: "/internal/v1/users/{id}/export",
    operationId: "exportUtilisateur",
    summary: "Données du service pour l'export RGPD (users:export)",
    tags: ["interne"],
    auth: true,
    responses: { 200: { description: "Données", schema: UserExport } },
  },
  {
    method: "delete",
    path: "/internal/v1/users/{id}",
    operationId: "effacerUtilisateur",
    summary: "Efface la veille d'un utilisateur, idempotent (users:delete)",
    tags: ["interne"],
    auth: true,
    responses: { 204: { description: "Effacé" } },
  },
];

const toDto = (s: SubscriptionRow) => ({
  occupations: s.occupations,
  country: s.country,
  city: s.city,
  radiusKm: s.radiusKm,
  workingTime: s.workingTime,
  email: s.recipientEmail,
  status: s.status,
  confirmedAt: s.confirmedAt?.toISOString() ?? null,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
});

export function registerRoutes(app: Express, deps: RouteDeps): void {
  const { store, upstreams, verifier, logger } = deps;
  const auth = authenticate(verifier);
  const me = (res: Response) => principalOf(res).sub;
  const ipHash = (req: Request) =>
    createHmac("sha256", deps.ipHashSecret)
      .update(req.ip ?? "")
      .digest("base64url");
  const noStore = (_req: Request, res: Response, next: () => void) => {
    // Jeton dans l'URL : jamais en cache, jamais transmis en Referer.
    res.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer");
    next();
  };

  // --- Rappels par courriel (ADR 0029, point 5) ------------------------------------------------------

  const reminderDto = (r: ReminderRow) => ({
    id: r.id,
    kind: r.kind,
    sendOn: r.sendOn,
    title: r.title,
    detail: r.detail,
    link: r.link,
    sentAt: r.sentAt?.toISOString() ?? null,
  });

  app.get("/v1/reminders", auth, requireAccount(), async (_req, res) => {
    res.json((await store.reminders(me(res))).map(reminderDto));
  });

  app.post("/v1/reminders", auth, requireAccount(), async (req, res) => {
    const input = parseInput(ReminderInput, req.body);
    const today = parisNow().date;
    const limit = new Date(Date.parse(`${today}T00:00:00Z`) + 366 * 86_400_000).toISOString().slice(0, 10);
    // Un jour de tolérance : le navigateur du candidat peut être en retard d’un jour sur Paris.
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    if (input.sendOn < yesterday || input.sendOn > limit) {
      throw new AppError("entree_invalide", 400, "Certaines informations sont invalides.", [
        { champ: "sendOn", message: "Choisissez une date entre aujourd'hui et dans un an." },
      ]);
    }
    const contact = await upstreams.contact(me(res));
    if (!(await recipientOf(store, me(res), contact?.email ?? null))) {
      throw new AppError(
        "sans_adresse",
        409,
        "Ajoutez et confirmez d'abord votre adresse e-mail dans la veille emploi : c'est là que partent les rappels.",
      );
    }
    const row = await store.addReminder(me(res), input);
    if (!row) throw new AppError("trop_de_rappels", 409, "Vous avez déjà 20 rappels en attente.");
    logger.info({ event: "rappel_programme", kind: input.kind }, "rappels");
    res.status(201).json(reminderDto(row));
  });

  app.delete("/v1/reminders/:id", auth, requireAccount(), async (req, res) => {
    const { id } = parseInput(UserParam, req.params);
    if (!(await store.deleteReminder(me(res), id))) throw notFound("Ce rappel n'existe plus.");
    res.status(204).end();
  });

  app.get("/v1/subscriptions/me", auth, requireAccount(), async (_req, res) => {
    const s = await store.subscription(me(res));
    if (!s) throw notFound("Aucune veille enregistrée.");
    res.json(toDto(s));
  });

  app.put("/v1/subscriptions/me", auth, requireAccount(), async (req, res) => {
    const input = parseInput(SubscriptionInput, req.body);
    const userId = me(res);
    const [city, profile, contact] = await Promise.all([
      upstreams.resolveCity(principalOf(res).token, input.country, input.city),
      upstreams.profile(userId),
      upstreams.contact(userId),
    ]);
    if (!city) {
      throw new AppError("entree_invalide", 400, "Certaines informations sont invalides.", [
        {
          champ: "city",
          message:
            "Ville introuvable dans ce pays. Indiquez une ville de plus de 15 000 habitants (par exemple la plus proche).",
        },
      ]);
    }
    if (!profile) {
      throw new AppError(
        "profil_absent",
        409,
        "Enregistrez d'abord votre profil : la veille compare les offres à celui-ci.",
      );
    }
    if (!contact)
      throw new AppError("compte_inconnu", 409, "Votre compte est introuvable. Reconnectez-vous.");
    // Adresse d'un ancien compte par lien (déjà prouvée) : rien à stocker, elle suit le compte. Un compte par
    // identifiant n'a pas d'adresse (ADR 0030) : celle de la veille est obligatoire.
    const accountEmail = contact.email?.toLowerCase() ?? null;
    if (!input.email && !accountEmail) {
      throw new AppError("entree_invalide", 400, "Certaines informations sont invalides.", [
        { champ: "email", message: "Indiquez l'adresse e-mail où recevoir vos rapports de veille." },
      ]);
    }
    const recipient = input.email && input.email !== accountEmail ? input.email : null;
    const { row } = await store.saveSubscription(
      userId,
      {
        occupations: input.occupations,
        country: input.country,
        city: city.nom,
        lat: city.lat,
        lon: city.lon,
        radiusKm: input.radiusKm,
        workingTime: input.workingTime,
      },
      recipient,
      ipHash(req),
    );
    // Veille active tout de suite, sans lien de confirmation (ADR 0030, point 5).
    logger.info({ event: "veille_enregistree" }, "veille");
    res.json({ subscription: toDto(row), confirmationSent: false });
  });

  app.delete("/v1/subscriptions/me", auth, requireAccount(), async (req, res) => {
    await store.unsubscribeUser(me(res), ipHash(req));
    res.status(204).end();
  });

  app.get("/v1/subscriptions/me/matches", auth, requireAccount(), async (_req, res) => {
    res.json(await store.userMatches(me(res)));
  });

  app.post("/v1/subscriptions/confirm/:token", noStore, async (req, res) => {
    const params = Token.safeParse(req.params);
    if (!params.success || !(await store.confirm(params.data.token, ipHash(req)))) throw invalidLink();
    logger.info({ event: "veille_confirmee" }, "veille");
    res.status(204).end();
  });

  // RFC 8058 : la messagerie envoie « List-Unsubscribe=One-Click » en POST, sans cookie ni jeton d'accès.
  app.post(
    "/v1/subscriptions/unsubscribe/:token",
    noStore,
    express.urlencoded({ extended: false, limit: "1kb" }),
    async (req, res) => {
      const params = Token.safeParse(req.params);
      if (!params.success || !(await store.unsubscribeByToken(params.data.token))) throw invalidLink();
      logger.info({ event: "veille_desabonnement" }, "veille");
      res.status(200).type("text/plain").send("ok");
    },
  );

  app.post("/v1/webhooks/brevo", async (req, res) => {
    const expected = deps.brevoWebhookToken;
    const received = (req.get("authorization") ?? "").replace(/^Bearer /, "");
    // Comparaison à temps constant des empreintes : longueur fixe, quels que soient les octets reçus.
    const digest = (v: string) => createHash("sha256").update(v).digest();
    if (!expected || !timingSafeEqual(digest(received), digest(expected))) {
      logger.warn({ event: "webhook_refuse" }, "webhook brevo");
      return res.status(401).end();
    }
    const events = (Array.isArray(req.body) ? req.body : [req.body]) as Record<string, unknown>[];
    for (const e of events) {
      const kind = ({ spam: "plainte", hard_bounce: "rebond", unsubscribed: "desabonnement" } as const)[
        String(e.event) as "spam" | "hard_bounce" | "unsubscribed"
      ];
      if (!kind) continue;
      const text = (v: unknown) => (typeof v === "string" ? v : undefined);
      await store.providerEvent(
        { deliveryId: text(e["X-Mailin-custom"]), messageId: text(e["message-id"]) },
        kind,
      );
      logger[kind === "plainte" ? "warn" : "info"]({ event: `email_${kind}` }, "webhook brevo");
    }
    res.status(204).end();
  });

  // --- Administration --------------------------------------------------------------------------------

  app.get("/v1/admin/stats", auth, requireRole("admin"), async (_req, res) => {
    logger.info({ event: "admin_acces", route: "/v1/admin/stats" }, "administration");
    res.json({ service: "job-watch", counters: await store.stats() });
  });

  app.get("/v1/admin/runs", auth, requireRole("admin"), async (_req, res) => {
    const runs = await store.runs();
    res.json(
      runs.map((r) => ({
        ...r,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      })),
    );
  });

  let running: Promise<unknown> | undefined;
  app.post("/v1/admin/runs", auth, requireRole("admin"), (_req, res) => {
    if (running) throw new AppError("veille_en_cours", 409, "Une exécution de la veille est déjà en cours.");
    logger.info({ event: "admin_acces", route: "/v1/admin/runs" }, "administration");
    running = runDaily(deps, parisNow().date, "manuelle")
      .catch((error) => logger.error({ event: "veille_echec", errorType: (error as Error)?.name }, "veille"))
      .finally(() => (running = undefined));
    res
      .status(202)
      .json({ message: "Exécution lancée : son bilan apparaîtra dans la liste des exécutions." });
  });

  // --- Interne ----------------------------------------------------------------------------------------

  app.get("/internal/v1/users/:id/export", auth, requireScope("users:export"), async (req, res) => {
    const { id } = parseInput(UserParam, req.params);
    res.json({ service: "job-watch", data: await store.exportUser(id) });
  });

  app.delete("/internal/v1/users/:id", auth, requireScope("users:delete"), async (req, res) => {
    const { id } = parseInput(UserParam, req.params);
    await store.deleteUser(id);
    logger.info({ event: "rgpd_effacement" }, "rgpd");
    res.status(204).end();
  });
}
