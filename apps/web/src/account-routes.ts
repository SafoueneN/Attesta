import { createHash, timingSafeEqual } from "node:crypto";
import express, { type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { confirmSubscriptionMessage, findCity, loginLinkMessage, type Mailer } from "@attesta/jobwatch";
import { AppError, type Logger } from "@attesta/shared";
import { AccountStore, type SubscriptionInput } from "./accounts.js";
import { validProfile } from "./draft.js";
import { fr } from "./i18n.js";
import { verifyCsrf } from "./security.js";
import { fingerprint } from "./stores.js";

/**
 * Comptes et veille emploi (docs/adr/0010) :
 * - /compte : connexion par lien, profil enregistré, abonnement, export, suppression ;
 * - /veille : confirmation (double opt-in) et désabonnement par jeton, sans session ;
 * - /webhooks/brevo : plaintes, rebonds et désabonnements signalés par le fournisseur.
 */

export interface AccountDeps {
  store: AccountStore;
  mailer: Mailer;
  baseUrl: string;
  secret: string;
  logger: Logger;
  /** Session, plafond de 24 h et jeton CSRF : les mêmes que le parcours CV. */
  sessionStack: RequestHandler[];
  /** Limiteurs des demandes de lien de connexion : par IP, et par adresse demandée. */
  loginLimiter: RequestHandler;
  loginEmailLimiter: RequestHandler;
  brevoWebhookToken?: string;
}

const Email = z
  .email()
  .max(254)
  .transform((e) => e.toLowerCase());
const Token = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/);
const RADII = [10, 25, 50, 100] as const;

const SubscriptionForm = z.object({
  occupations: z
    .string()
    .transform((v) =>
      v
        .split(/[\n,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(
          z.string().min(2, "Chaque métier compte au moins 2 caractères").max(80, "80 caractères au plus"),
        )
        .min(1, "Indiquez au moins un métier")
        .max(5, "5 métiers au plus"),
    ),
  country: z.enum(["DE", "FR"], "Choisissez un pays"),
  city: z.string().trim().min(1, "Indiquez une ville").max(100),
  radiusKm: z.coerce
    .number()
    .refine((n) => (RADII as readonly number[]).includes(n), "Choisissez un rayon dans la liste"),
  workingTime: z.enum(["indifferent", "plein", "partiel"]),
  consent: z.literal("yes", "Cochez la case pour accepter de recevoir la veille par e-mail"),
});

type FieldError = { field: string; message: string };

export function createAccountRoutes(deps: AccountDeps) {
  const { store, mailer, baseUrl, logger } = deps;
  const link = (path: string) => new URL(path, baseUrl).href;
  const ipHash = (req: Request) => fingerprint(deps.secret, req.ip ?? "");

  // --- /compte : avec session -------------------------------------------------------
  const compte = express.Router();
  compte.use(...deps.sessionStack, (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  compte.use((req, res, next) => (req.method === "POST" ? verifyCsrf(req, res, next) : next()));

  const requireUser = async (req: Request, res: Response) => {
    const user = req.session.userId ? await store.user(req.session.userId) : undefined;
    if (!user) {
      delete req.session.userId;
      res.redirect(303, "/compte/connexion");
    }
    return user;
  };

  compte.get("/connexion", (req, res) => {
    if (req.session.userId) return res.redirect(303, "/compte");
    // Adresse déjà saisie dans le CV : proposée par défaut, c'est elle qui recevra les rapports.
    res.render("compte/connexion", {
      title: fr.account.loginTitle,
      values: { email: req.session.draft?.basics.email ?? "" },
      errors: [],
    });
  });

  compte.post("/connexion", deps.loginLimiter, deps.loginEmailLimiter, async (req, res) => {
    const email = Email.safeParse(String(req.body.email ?? "").trim());
    const errors: FieldError[] = [];
    if (!email.success) errors.push({ field: "email", message: "Saisissez une adresse e-mail valide." });
    if (req.body.policy !== "yes")
      errors.push({ field: "policy", message: "Acceptez la politique de confidentialité pour continuer." });
    if (errors.length || !email.success) {
      return res.status(422).render("compte/connexion", {
        title: fr.errorTitlePrefix + fr.account.loginTitle,
        values: { email: req.body.email ?? "" },
        errors,
      });
    }
    const token = await store.createLoginToken(email.data);
    await mailer.send(loginLinkMessage(email.data, link(`/compte/connexion/${token}`)));
    logger.info({ event: "lien_connexion_envoye" }, "compte");
    // Réponse identique que l'adresse ait un compte ou non : aucune énumération possible.
    res.render("compte/lien-envoye", { title: fr.account.linkSentTitle });
  });

  // Le lien de l'e-mail ouvre une page de confirmation : les antivirus de messagerie
  // qui visitent les liens ne consomment donc pas le jeton.
  // L'adresse du compte est affichée (masquée) : un lien reçu d'un tiers ne connecte
  // pas, à son insu, le candidat au compte de ce tiers.
  compte.get("/connexion/:token", async (req, res, next) => {
    const token = Token.safeParse(req.params.token);
    const email = token.success ? await store.loginTokenEmail(token.data) : undefined;
    if (!email) return next(invalidLink());
    res.render("compte/confirmer-connexion", {
      title: fr.account.loginTitle,
      token: req.params.token,
      maskedEmail: maskEmail(email),
    });
  });

  compte.post("/connexion/:token", async (req, res, next) => {
    const token = Token.safeParse(req.params.token);
    const result = token.success ? await store.consumeLoginToken(token.data, ipHash(req)) : undefined;
    if (!result) return next(invalidLink());
    // Nouvelle session à la connexion (fixation de session), en gardant le CV en cours.
    const { draft, generation } = req.session;
    req.session.regenerate((err) => {
      if (err) return next(err);
      Object.assign(req.session, { draft, generation, userId: result.userId, createdAt: Date.now() });
      logger.info({ event: result.created ? "compte_cree" : "connexion" }, "compte");
      res.redirect(303, "/compte");
    });
  });

  compte.get("/", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const notice = req.session.notice;
    delete req.session.notice;
    await renderAccount(req, res, user, { notice });
  });

  async function renderAccount(
    req: Request,
    res: Response,
    user: { id: string; email: string },
    extra: { notice?: unknown; errors?: FieldError[]; values?: Record<string, unknown> } = {},
  ) {
    const [profile, subscription] = await Promise.all([
      store.latestProfile(user.id),
      store.subscription(user.id),
    ]);
    const errors = extra.errors ?? [];
    res.status(errors.length ? 422 : 200).render("compte/index", {
      title: (errors.length ? fr.errorTitlePrefix : "") + fr.account.title,
      user,
      profile,
      subscription,
      draftReady: Boolean(req.session.draft && validProfile(req.session.draft)),
      values: extra.values ?? subscriptionValues(subscription),
      errors,
      notice: extra.notice,
      radii: RADII,
    });
  }

  compte.post("/profil", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const profile = req.session.draft ? validProfile(req.session.draft) : undefined;
    if (!profile) {
      req.session.notice = { kind: "error", text: fr.account.noDraft };
      return res.redirect(303, "/compte");
    }
    const version = await store.saveProfile(user.id, profile);
    req.session.notice = { kind: "info", text: fr.account.profileSaved(version) };
    res.redirect(303, "/compte");
  });

  compte.post("/veille", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const profile = await store.latestProfile(user.id);
    if (!profile) {
      req.session.notice = { kind: "error", text: fr.account.profileFirst };
      return res.redirect(303, "/compte");
    }
    const parsed = SubscriptionForm.safeParse(req.body);
    const errors: FieldError[] = parsed.success
      ? []
      : parsed.error.issues.map((i) => ({ field: `sub-${String(i.path[0])}`, message: i.message }));
    // Ville vérifiée même si un autre champ est en erreur : toutes les erreurs d'un coup.
    const country = req.body.country === "FR" ? "FR" : "DE";
    const cityText = typeof req.body.city === "string" ? req.body.city.trim() : "";
    const city = cityText ? findCity(cityText, country) : undefined;
    if (cityText && !city) errors.push({ field: "sub-city", message: fr.account.unknownCity });
    if (!parsed.success || !city || errors.length) {
      return renderAccount(req, res, user, { errors, values: req.body });
    }
    const input: SubscriptionInput = {
      occupations: parsed.data.occupations,
      country: parsed.data.country,
      city: city.nom,
      lat: city.lat,
      lon: city.lon,
      radiusKm: parsed.data.radiusKm,
      workingTime: parsed.data.workingTime,
    };
    const { confirmToken } = await store.saveSubscription(user.id, profile.id, input);
    await store.recordConsent(user.id, "veille", true, ipHash(req));
    if (confirmToken) {
      await mailer.send(confirmSubscriptionMessage(user.email, link(`/veille/confirmer/${confirmToken}`)));
      req.session.notice = { kind: "info", text: fr.account.confirmSent };
    } else {
      req.session.notice = { kind: "info", text: fr.account.subscriptionUpdated };
    }
    res.redirect(303, "/compte");
  });

  compte.post("/veille/arreter", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    await store.unsubscribeUser(user.id, ipHash(req));
    req.session.notice = { kind: "info", text: fr.account.unsubscribed };
    res.redirect(303, "/compte");
  });

  compte.get("/export", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    logger.info({ event: "export_donnees" }, "compte");
    res
      .type("application/json")
      .attachment("attesta-mes-donnees.json")
      .send(JSON.stringify(await store.exportData(user.id), null, 2));
  });

  compte.post("/supprimer", async (req, res, next) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (req.body.confirm !== "yes") {
      req.session.notice = { kind: "error", text: fr.account.deleteConfirm };
      return res.redirect(303, "/compte");
    }
    await store.deleteUser(user.id);
    logger.info({ event: "compte_supprime" }, "compte");
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie("attesta.sid");
      res.redirect(303, "/?efface=1");
    });
  });

  compte.post("/deconnexion", (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie("attesta.sid");
      res.redirect(303, "/");
    });
  });

  // --- /veille : jetons des e-mails, sans session ---------------------------------
  const veille = express.Router();
  veille.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    // Le jeton est dans l'URL : la page ne doit pas le transmettre en Referer.
    res.set("Referrer-Policy", "no-referrer");
    next();
  });

  veille.get("/confirmer/:token", (req, res) => {
    if (!Token.safeParse(req.params.token).success) throw invalidLink();
    res.render("veille/confirmer", { title: fr.account.confirmTitle, token: req.params.token });
  });

  veille.post("/confirmer/:token", async (req, res, next) => {
    const token = Token.safeParse(req.params.token);
    if (!token.success || !(await store.confirmSubscription(token.data, ipHash(req))))
      return next(invalidLink());
    logger.info({ event: "veille_confirmee" }, "veille");
    res.render("veille/message", { title: fr.account.confirmedTitle, message: fr.account.confirmed });
  });

  veille.get("/desabonner/:token", (req, res) => {
    if (!Token.safeParse(req.params.token).success) throw invalidLink();
    res.render("veille/desabonner", { title: fr.account.unsubscribeTitle, token: req.params.token });
  });

  // Désabonnement en un clic (RFC 8058) : la messagerie envoie un POST
  // « List-Unsubscribe=One-Click » sans cookie ; le jeton suffit à l'authentifier.
  veille.post("/desabonner/:token", async (req, res, next) => {
    const token = Token.safeParse(req.params.token);
    if (!token.success || !(await store.unsubscribeByToken(token.data))) return next(invalidLink());
    logger.info({ event: "veille_desabonnement" }, "veille");
    if (req.body?.["List-Unsubscribe"] === "One-Click") return res.status(200).type("text/plain").send("ok");
    res.render("veille/message", { title: fr.account.unsubscribedTitle, message: fr.account.unsubscribed });
  });

  // --- /webhooks/brevo ------------------------------------------------------------
  const webhooks = express.Router();
  webhooks.post("/brevo", express.json({ limit: "64kb" }), async (req, res) => {
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
      const kind = { spam: "plainte", hard_bounce: "rebond", unsubscribed: "desabonnement" }[
        String(e.event)
      ] as "plainte" | "rebond" | "desabonnement" | undefined;
      const text = (v: unknown) => (typeof v === "string" ? v : undefined);
      if (!kind) continue;
      await store.providerEvent(
        { deliveryId: text(e["X-Mailin-custom"]), messageId: text(e["message-id"]) },
        kind,
      );
      logger[kind === "plainte" ? "warn" : "info"]({ event: `email_${kind}` }, "webhook brevo");
    }
    res.status(204).end();
  });

  return { compte, veille, webhooks };
}

/** « lea.martin@example.org » → « l***@example.org ». */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

function invalidLink() {
  return new AppError(
    "lien_invalide",
    410,
    "Ce lien n'est plus valide : il a déjà servi ou il a expiré. Vous pouvez en demander un nouveau.",
  );
}

function subscriptionValues(subscription: Awaited<ReturnType<AccountStore["subscription"]>>) {
  if (!subscription) return { country: "DE", radiusKm: "25", workingTime: "indifferent" };
  return {
    occupations: subscription.occupations.join(", "),
    country: subscription.country,
    city: subscription.city,
    radiusKm: String(subscription.radiusKm),
    workingTime: subscription.workingTime,
  };
}
