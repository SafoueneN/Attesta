import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import connectPgSimple from "connect-pg-simple";
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import session from "express-session";
import helmet from "helmet";
import type { Pool } from "pg";
import { z } from "zod";
import type { LlmProvider } from "@attesta/llm";
import { renderCvHtml, viewFromProfile, viewFromTailored, type PdfRenderer } from "@attesta/render";
import { AppError, type Config, type Logger } from "@attesta/shared";
import {
  emptyDraft,
  emptyEducation,
  emptyWork,
  lastReachableStep,
  mergeStep,
  validateStep,
  validProfile,
  Variant,
  type Draft,
  type FieldError,
} from "./draft.js";
import { currentGeneration, describeIssue, describePointer, type StoredGeneration } from "./generation.js";
import { fr } from "./i18n.js";
import { createIaRoutes } from "./ia-routes.js";
import { absoluteSessionLimit, csrfToken, cspNonce, verifyCsrf } from "./security.js";

declare module "express-session" {
  interface SessionData {
    draft: Draft;
    createdAt: number;
    csrfToken: string;
    generation: StoredGeneration;
    generationToken: string;
    quota: { day: string; count: number };
    /** Message à afficher une fois, à la page suivante. */
    notice: { kind: "info" | "error"; text: string };
  }
}

z.config(z.locales.fr());

export interface AppDeps {
  config: Config;
  logger: Logger;
  renderer: PdfRenderer;
  /** Requis si SESSION_STORE=postgres ; sert aussi au contrôle de santé. */
  pool?: Pool;
  /** Plafonds de requêtes par IP : 15 min pour le général et l'export, 1 h pour la génération. */
  limits?: { general: number; export: number; generation?: number };
  /** Pipeline IA ; absent : génération désactivée, parcours sans IA (Phase 1). */
  ia?: { provider: LlmProvider; maxCostUsd: number; dailyQuota: number };
}

const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
const TOTAL_STEPS = 5;
const viewsDir = fileURLToPath(new URL("../views", import.meta.url));
const publicDir = fileURLToPath(new URL("../public", import.meta.url));

export function createApp({ config, logger, renderer, pool, limits, ia }: AppDeps) {
  const app = express();
  const production = config.NODE_ENV === "production";
  const httpsOnly = config.HTTPS_ONLY ?? production;

  app.set("view engine", "ejs");
  app.set("views", viewsDir);
  app.set("trust proxy", config.TRUST_PROXY);
  app.disable("x-powered-by");

  // Journal d'accès : méthode, chemin, statut, durée. Jamais de corps ni de paramètres.
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info(
        {
          method: req.method,
          path: req.originalUrl.split("?")[0],
          status: res.statusCode,
          ms: Math.round(ms),
        },
        "http",
      );
    });
    next();
  });

  app.use(cspNonce);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            (_req: IncomingMessage, res: ServerResponse) =>
              `'nonce-${(res as unknown as Response).locals.cspNonce}'`,
          ],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'", "data:"],
          frameAncestors: ["'self'"],
          formAction: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          upgradeInsecureRequests: httpsOnly ? [] : null,
        },
      },
    }),
  );

  app.get("/health", async (_req, res) => {
    try {
      if (pool) await pool.query("SELECT 1");
      res.json({ status: "ok" });
    } catch (error) {
      logger.error({ err: error }, "health: base de données injoignable");
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.use("/static", express.static(publicDir, { maxAge: production ? "1h" : 0 }));
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: limits?.general ?? 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: "200kb", parameterLimit: 2000 }));

  const store =
    config.SESSION_STORE === "postgres"
      ? new (connectPgSimple(session))({ pool, tableName: "session", pruneSessionInterval: 15 * 60 })
      : undefined;
  if (config.SESSION_STORE === "postgres" && !pool)
    throw new Error("SESSION_STORE=postgres exige un pool PostgreSQL");

  const sessions = session({
    name: "attesta.sid",
    secret: config.SESSION_SECRET,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: "lax", secure: httpsOnly, maxAge: SESSION_IDLE_MS },
  });

  app.use((_req, res, next) => {
    res.locals.t = fr;
    res.locals.errors = [];
    next();
  });

  app.get("/", (req, res) => {
    res.render("home", { title: fr.tagline, cleared: req.query.efface === "1" });
  });

  // Tout le parcours CV : session, plafond de 24 h, CSRF, aucune mise en cache.
  const cv = express.Router();
  cv.use(sessions, absoluteSessionLimit(), csrfToken, (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const iaRoutes = createIaRoutes({
    provider: ia?.provider,
    maxCostUsd: ia?.maxCostUsd ?? 0,
    dailyQuota: ia?.dailyQuota ?? 0,
    logger,
  });
  cv.use(iaRoutes.multipart);
  cv.use((req, res, next) => (req.method === "POST" ? verifyCsrf(req, res, next) : next()));
  cv.use(iaRoutes.router);

  const draftOf = (req: Request): Draft => (req.session.draft ??= emptyDraft());
  const stepParam = (req: Request) => {
    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n < 1 || n > TOTAL_STEPS)
      throw new AppError("not_found", 404, "Page introuvable.");
    return n;
  };

  /** CV à afficher et exporter : la génération si elle correspond encore au profil, sinon le profil seul. */
  function cvViewOf(req: Request) {
    const draft = draftOf(req);
    const profile = validProfile(draft);
    if (!profile) return undefined;
    const { generation, stale } = currentGeneration(req.session.generation, profile, draft);
    return {
      profile,
      generation,
      stale,
      view: generation ? viewFromTailored(profile, generation.cv) : viewFromProfile(profile),
    };
  }

  function renderStep(req: Request, res: Response, step: number, errors: FieldError[] = []) {
    const draft = draftOf(req);
    const variant = Variant.parse(req.query.variant);
    const title =
      (errors.length ? fr.errorTitlePrefix : "") + `${fr.steps[step - 1]} – ${fr.stepOf(step, TOTAL_STEPS)}`;
    const notice = req.session.notice;
    delete req.session.notice;
    const current = step >= 4 ? cvViewOf(req) : undefined;
    res.status(errors.length ? 422 : 200).render("step", {
      title,
      step,
      total: TOTAL_STEPS,
      draft,
      errors,
      variant,
      notice,
      ia: {
        available: Boolean(ia),
        importAvailable: ia?.provider.kind === "ia",
        demo: ia?.provider.kind === "demo",
        token: step === 4 && ia ? iaRoutes.issueToken(req) : undefined,
        dailyQuota: ia?.dailyQuota,
      },
      profile: current?.profile,
      generation: current?.generation,
      stale: current?.stale ?? false,
      describePointer,
      describeIssue,
    });
  }

  cv.get("/etape/:n", (req, res) => {
    const step = stepParam(req);
    const reachable = lastReachableStep(draftOf(req));
    if (step > reachable) return res.redirect(303, `/cv/etape/${reachable}`);
    renderStep(req, res, step);
  });

  cv.post("/etape/:n", async (req, res) => {
    const step = stepParam(req);
    const action = typeof req.body.action === "string" ? req.body.action : "next";
    const draft = (req.session.draft = mergeStep(draftOf(req), step, req.body));

    if (action === "prev") return res.redirect(303, `/cv/etape/${Math.max(1, step - 1)}`);

    const entry = /^(add|remove)-(work|education)(?:-(\d+))?$/.exec(action);
    if (step === 2 && entry) {
      const [, op, section, index] = entry as unknown as [
        string,
        "add" | "remove",
        "work" | "education",
        string?,
      ];
      const list: object[] = draft[section];
      if (op === "add" && list.length < 30) list.push(section === "work" ? emptyWork() : emptyEducation());
      if (op === "remove") list.splice(Number(index), 1);
      const focus = op === "add" ? `#${section}-${list.length - 1}` : `#${section}-section`;
      return res.redirect(303, `/cv/etape/2${focus}`);
    }

    if (step === TOTAL_STEPS) return exportPdf(req, res);

    const errors = validateStep(draft, step);
    if (errors.length) return renderStep(req, res, step, errors);
    res.redirect(303, `/cv/etape/${step + 1}`);
  });

  async function exportPdf(req: Request, res: Response) {
    const current = cvViewOf(req);
    if (!current) return res.redirect(303, `/cv/etape/${lastReachableStep(draftOf(req))}`);
    if (req.body.reviewed !== "yes") {
      return renderStep(req, res, TOTAL_STEPS, [
        { field: "reviewed", message: "Confirmez que vous avez relu votre CV avant de l'exporter." },
      ]);
    }
    const variant = Variant.parse(req.body.variant);
    const pdf = await renderer.render(renderCvHtml(current.view, { variant }));
    res.type("application/pdf").attachment(`cv-attesta-${variant}.pdf`).send(Buffer.from(pdf));
  }

  // Aperçu : exactement le HTML qui sera imprimé en PDF, affiché dans un iframe.
  cv.get("/apercu", (req, res) => {
    const current = cvViewOf(req);
    if (!current) return res.status(404).type("text/plain").send("Aperçu indisponible : profil incomplet.");
    const variant = Variant.parse(req.query.variant);
    res.type("html").send(renderCvHtml(current.view, { variant, styleNonce: res.locals.cspNonce }));
  });

  cv.post("/effacer", (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie("attesta.sid");
      res.redirect(303, "/?efface=1");
    });
  });

  app.use("/cv", rateLimit({ windowMs: 15 * 60 * 1000, limit: limits?.export ?? 20, skip: isNotExport }));
  app.use(
    "/cv",
    rateLimit({ windowMs: 60 * 60 * 1000, limit: limits?.generation ?? 10, skip: isNotGeneration }),
  );
  app.use("/cv", cv);

  app.use((_req, _res, next) => next(new AppError("not_found", 404, "Page introuvable.")));

  // Gestionnaire d'erreurs : message public pour le candidat, détail technique au journal seulement.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const known = err instanceof AppError ? err : undefined;
    const status = known?.status ?? 500;
    if (status >= 500) logger.error({ err, path: req.path }, "erreur serveur");
    else logger.warn({ code: known?.code, path: req.path }, "requête refusée");
    res.status(status).render("error", {
      title: status === 404 ? "Page introuvable" : "Une erreur est survenue",
      message: known?.publicMessage ?? "Une erreur inattendue est survenue. Réessayez dans un instant.",
    });
  });

  return app;
}

function isNotGeneration(req: Request) {
  return !req.path.startsWith("/generer");
}

function isNotExport(req: Request) {
  return !(req.method === "POST" && req.path === `/etape/${TOTAL_STEPS}`);
}
