import { randomBytes } from "node:crypto";
import express, { type Request, type Response } from "express";
import multer from "multer";
import type { OfferAnalysis, Profile } from "@attesta/schema";
import {
  extractPdfText,
  extractProfile,
  generateTailoredCv,
  groundExtraction,
  MAX_PDF_BYTES,
  PdfImportError,
  type GenerationResult,
  type LlmProvider,
  type LlmUsage,
  type ProgressEvent,
} from "@attesta/llm";
import { AppError, type Logger } from "@attesta/shared";
import { draftFromExtraction, emptyDraft, validProfile, type Draft } from "./draft.js";
import { applyCorrections, currentGeneration, generationKey } from "./generation.js";
import type { IaQuotaStore } from "./stores.js";

export interface IaOptions {
  provider?: LlmProvider;
  maxCostUsd: number;
  dailyQuota: number;
  logger: Logger;
  /** Verrou et quota partagés entre instances (PostgreSQL en préprod et en prod). */
  quotaStore: IaQuotaStore;
  /** Enregistrement durable du coût de chaque appel (sans contenu). */
  recordUsage?: (usage: LlmUsage) => void;
}

type Outcome =
  | { kind: "ok" }
  /** Session effacée pendant l'appel au modèle : rien n'est réécrit. */
  | { kind: "erased" }
  | { kind: "degraded" | "quota" | "incomplete" | "busy"; message: string };

const DEGRADED_MESSAGES: Record<string, string> = {
  indisponible:
    "La reformulation par IA est indisponible pour le moment. Votre CV reste disponible tel que vous l'avez saisi, sans réécriture.",
  refus:
    "La reformulation n'a pas pu être produite pour ce contenu. Votre CV reste disponible tel que vous l'avez saisi.",
  budget: "La génération a atteint son budget maximal. Votre CV reste disponible tel que vous l'avez saisi.",
  "non-conforme":
    "La reformulation obtenue ne respectait pas nos contrôles et a été écartée. Votre CV reste disponible tel que vous l'avez saisi ; vous pouvez réessayer.",
};

export function progressMessage(event: ProgressEvent): string {
  switch (event.stage) {
    case "analyse":
      return event.status === "start"
        ? "Analyse de l'offre…"
        : `Offre analysée : ${event.keywords} mots-clés repérés.`;
    case "redaction":
      return event.attempt === 1
        ? "Rédaction ciblée à partir de vos seuls faits…"
        : `Réponse non conforme, nouvelle tentative (${event.attempt} sur 3)…`;
    case "controle":
      return `Contrôle de fidélité : ${event.supported} lignes sur ${event.checked} rattachées à votre profil.`;
  }
}

const saveSession = (req: Request) =>
  new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));

/** Recharge la session depuis le store ; `false` si elle a été détruite entre-temps. */
const reloadSession = (req: Request) =>
  new Promise<boolean>((resolve) => req.session.reload((err) => resolve(!err)));

/**
 * Détache une session détruite de la requête : express-session ne la réécrit
 * pas, et un effacement demandé pendant l'appel au modèle reste effectif.
 */
const forgetSession = (req: Request) => {
  (req as { session?: unknown }).session = undefined;
};

/** Type d'erreur seulement : un message d'erreur peut citer du contenu personnel. */
const errorType = (error: unknown) => (error instanceof Error ? error.name : typeof error);

/**
 * Routes du pipeline IA : génération (classique et SSE), corrections, import PDF.
 * Le routeur renvoyé doit être monté après la vérification CSRF ; `multipart`, avant.
 */
export function createIaRoutes(options: IaOptions) {
  const { provider, logger } = options;
  const cv = express.Router();
  const analysisCache = new Map<string, OfferAnalysis>();
  const draftOf = (req: Request): Draft => (req.session.draft ??= emptyDraft());
  /**
   * Un seul appel au modèle à la fois par session, et quota du jour (générations
   * et imports confondus), réservés de façon atomique dans le store partagé.
   */
  async function withReservation(req: Request, work: () => Promise<Outcome>): Promise<Outcome> {
    const id = req.sessionID;
    const reservation = await options.quotaStore.reserve(id, options.dailyQuota);
    if (reservation === "busy") {
      return {
        kind: "busy",
        message: "Un traitement par l'IA est déjà en cours pour votre session. Patientez quelques instants.",
      };
    }
    if (reservation === "quota") {
      return {
        kind: "quota",
        message: `Limite de ${options.dailyQuota} appels à l'IA par jour atteinte. Votre CV non adapté reste exportable.`,
      };
    }
    try {
      return await work();
    } finally {
      await options.quotaStore.release(id);
    }
  }

  async function runGeneration(
    req: Request,
    onProgress: (e: ProgressEvent) => void,
    signal: AbortSignal,
  ): Promise<Outcome> {
    const draft = draftOf(req);
    const profile = validProfile(draft);
    if (!profile || !provider) {
      return { kind: "incomplete", message: "Complétez d'abord votre profil et l'offre." };
    }
    return withReservation(req, () => generate(req, provider, profile, draft, onProgress, signal));
  }

  async function generate(
    req: Request,
    llm: LlmProvider,
    profile: Profile,
    draft: Draft,
    onProgress: (e: ProgressEvent) => void,
    signal: AbortSignal,
  ): Promise<Outcome> {
    const key = generationKey(profile, draft);
    const started = Date.now();
    const result: GenerationResult = await generateTailoredCv(
      {
        provider: llm,
        maxCostUsd: options.maxCostUsd,
        analysisCache,
        onUsage: (usage) => {
          logger.info({ event: "llm_usage", ...usage }, "llm");
          options.recordUsage?.(usage);
        },
      },
      { profile, offerText: draft.offer.rawText },
      { onProgress, signal },
    );

    if (!(await reloadSession(req))) {
      forgetSession(req);
      return { kind: "erased" };
    }
    const costUsd = result.usage.reduce((sum, u) => sum + u.costUsd, 0);
    const metrics = {
      costUsd,
      durationMs: Date.now() - started,
      redactionAttempts: result.usage.filter((u) => u.step === "redaction").length,
    };
    if (result.status === "degraded") {
      logger.warn(
        { event: "generation", status: "degraded", reason: result.reason, ...metrics },
        "generation",
      );
      return { kind: "degraded", message: DEGRADED_MESSAGES[result.reason]! };
    }
    const current = validProfile(draftOf(req));
    if (!current || generationKey(current, draftOf(req)) !== key) {
      return {
        kind: "degraded",
        message: "Votre profil ou l'offre ont changé pendant la génération. Relancez-la.",
      };
    }
    logger.info(
      {
        event: "generation",
        status: "ok",
        score: result.report.score,
        removed: result.removed.length,
        missingKeywords: result.cv.missingKeywords.length,
        ...metrics,
        pipelineVersion: result.pipelineVersion,
      },
      "generation",
    );
    req.session.generation = {
      id: randomBytes(12).toString("base64url"),
      key,
      cv: result.cv,
      report: result.report,
      removed: result.removed,
      edited: [],
      providerKind: result.providerKind,
      model: result.model,
      pipelineVersion: result.pipelineVersion,
    };
    return { kind: "ok" };
  }

  const notify = (req: Request, outcome: Outcome) => {
    if (outcome.kind !== "ok" && outcome.kind !== "erased") {
      req.session.notice = { kind: "error", text: outcome.message };
    }
  };
  const redirectAfter = (outcome: Outcome) => (outcome.kind === "erased" ? "/?efface=1" : "/cv/etape/4");

  // Sans JavaScript : génération pendant la requête, puis retour à l'aperçu.
  cv.post("/generer", async (req, res) => {
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    const outcome = await runGeneration(req, () => undefined, controller.signal);
    notify(req, outcome);
    res.redirect(303, redirectAfter(outcome));
  });

  // Avec JavaScript : même génération, progression diffusée en SSE. Le jeton à
  // usage unique (présent seulement dans la page) protège ce GET contre le CSRF.
  cv.get("/generer/flux", async (req, res) => {
    const token = typeof req.query.jeton === "string" ? req.query.jeton : "";
    if (!token || token !== req.session.generationToken) {
      throw new AppError("generation_token", 403, "Lien de génération expiré. Rechargez la page.");
    }
    // Consommation enregistrée tout de suite : un rejeu, même concurrent, est refusé.
    delete req.session.generationToken;
    await saveSession(req);

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    });
    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const controller = new AbortController();
    req.on("close", () => controller.abort());

    try {
      const outcome = await runGeneration(
        req,
        (e) => send("progress", { message: progressMessage(e) }),
        controller.signal,
      );
      if (outcome.kind !== "erased") {
        notify(req, outcome);
        await saveSession(req);
      }
      send("done", { redirect: redirectAfter(outcome) });
    } catch (error) {
      if (!controller.signal.aborted) {
        logger.error({ errorType: errorType(error) }, "generation: erreur inattendue");
      }
      send("failure", { message: "Une erreur inattendue est survenue. Réessayez dans un instant." });
    } finally {
      res.end();
    }
  });

  cv.post("/generation/corrections", (req, res) => {
    const profile = validProfile(draftOf(req));
    const { generation } = currentGeneration(req.session.generation, profile, draftOf(req));
    if (!generation || !profile) return res.redirect(303, "/cv/etape/4");
    // Formulaire affiché pour une génération précédente (autre onglet) : les
    // numéros de ligne ne correspondent plus, on refuse plutôt que d'écraser.
    if (req.body.generation !== generation.id) {
      req.session.notice = {
        kind: "error",
        text: "Ces corrections concernent une version précédente de votre CV. Elles n'ont pas été appliquées.",
      };
      return res.redirect(303, "/cv/etape/4#relecture");
    }
    req.session.generation = applyCorrections(generation, profile, draftOf(req).offer.rawText, req.body);
    req.session.notice = { kind: "info", text: "Vos corrections sont enregistrées." };
    res.redirect(303, "/cv/etape/4#relecture");
  });

  cv.post("/generation/abandonner", (req, res) => {
    delete req.session.generation;
    req.session.notice = { kind: "info", text: "Vous êtes revenu à votre CV non adapté." };
    res.redirect(303, "/cv/etape/4");
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 5 },
  });

  cv.post("/import", async (req: Request, res: Response) => {
    if (!provider || provider.kind !== "ia") {
      req.session.notice = { kind: "error", text: "L'import de CV n'est pas disponible sur ce serveur." };
      return res.redirect(303, "/cv/etape/1");
    }
    const file = req.file;
    if (!file) {
      req.session.notice = { kind: "error", text: "Choisissez un fichier PDF à importer." };
      return res.redirect(303, "/cv/etape/1");
    }

    let text: string;
    try {
      text = await extractPdfText(new Uint8Array(file.buffer));
    } catch (error) {
      req.session.notice = {
        kind: "error",
        text: error instanceof PdfImportError ? error.publicMessage : "Ce PDF n'a pas pu être lu.",
      };
      return res.redirect(303, "/cv/etape/1");
    }

    const outcome = await withReservation(req, async () => {
      try {
        const { profile, usage } = await extractProfile(provider, text);
        logger.info({ event: "llm_usage", ...usage }, "llm");
        options.recordUsage?.(usage);
        if (!(await reloadSession(req))) {
          forgetSession(req);
          return { kind: "erased" };
        }
        // Tout élément extrait doit se retrouver dans le texte du PDF.
        const { profile: grounded, dropped } = groundExtraction(profile, text);
        req.session.draft = { ...draftOf(req), ...draftFromExtraction(grounded) };
        delete req.session.generation;
        req.session.notice = {
          kind: "info",
          text:
            "Profil pré-rempli à partir de votre CV. Relisez et corrigez chaque champ : rien ne sera utilisé sans votre validation." +
            (dropped
              ? ` ${dropped} élément(s) proposé(s) par l'IA mais absent(s) de votre PDF ont été écarté(s).`
              : ""),
        };
        return { kind: "ok" };
      } catch (error) {
        logger.warn({ errorType: errorType(error) }, "import: échec");
        return {
          kind: "degraded",
          message: "L'import est indisponible pour le moment. Vous pouvez saisir votre profil à la main.",
        };
      }
    });
    if (outcome.kind === "erased") return res.redirect(303, "/?efface=1");
    notify(req, outcome);
    res.redirect(303, "/cv/etape/1");
  });

  return {
    router: cv,
    /** Analyse du multipart avant la vérification CSRF (le jeton est un champ du formulaire). */
    multipart: (req: Request, res: Response, next: (err?: unknown) => void) => {
      if (req.method !== "POST" || req.path !== "/import") return next();
      upload.single("cv")(req, res, (err) =>
        next(
          err
            ? new AppError("import_invalide", 413, "Le fichier dépasse 5 Mo ou n'est pas accepté.")
            : undefined,
        ),
      );
    },
    /** Jeton SSE à usage unique, renouvelé à chaque affichage de l'étape 4. */
    issueToken: (req: Request) => (req.session.generationToken = randomBytes(24).toString("base64url")),
  };
}
