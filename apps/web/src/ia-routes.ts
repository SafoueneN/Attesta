import { randomBytes } from "node:crypto";
import express, { type Request, type Response } from "express";
import multer from "multer";
import type { OfferAnalysis } from "@attesta/schema";
import {
  extractPdfText,
  extractProfile,
  generateTailoredCv,
  MAX_PDF_BYTES,
  PdfImportError,
  type GenerationResult,
  type LlmProvider,
  type ProgressEvent,
} from "@attesta/llm";
import { AppError, type Logger } from "@attesta/shared";
import { draftFromExtraction, emptyDraft, validProfile, type Draft } from "./draft.js";
import { applyCorrections, currentGeneration, generationKey } from "./generation.js";

export interface IaOptions {
  provider?: LlmProvider;
  maxCostUsd: number;
  dailyQuota: number;
  logger: Logger;
}

type Outcome =
  | { kind: "ok"; supported: number; checked: number }
  | { kind: "degraded" | "quota" | "incomplete"; message: string };

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

/**
 * Routes du pipeline IA : génération (classique et SSE), corrections, import PDF.
 * Le routeur renvoyé doit être monté après la vérification CSRF ; `multipart`, avant.
 */
export function createIaRoutes(options: IaOptions) {
  const { provider, logger } = options;
  const cv = express.Router();
  const analysisCache = new Map<string, OfferAnalysis>();
  const draftOf = (req: Request): Draft => (req.session.draft ??= emptyDraft());

  async function runGeneration(
    req: Request,
    onProgress: (e: ProgressEvent) => void,
    signal: AbortSignal,
  ): Promise<Outcome> {
    const draft = draftOf(req);
    const profile = validProfile(draft);
    if (!profile || !provider)
      return { kind: "incomplete", message: "Complétez d'abord votre profil et l'offre." };

    const today = new Date().toISOString().slice(0, 10);
    const quota = req.session.quota?.day === today ? req.session.quota : { day: today, count: 0 };
    if (quota.count >= options.dailyQuota) {
      return {
        kind: "quota",
        message: `Limite de ${options.dailyQuota} générations par jour atteinte. Votre CV non adapté reste exportable.`,
      };
    }
    req.session.quota = { day: today, count: quota.count + 1 };

    const result: GenerationResult = await generateTailoredCv(
      {
        provider,
        maxCostUsd: options.maxCostUsd,
        analysisCache,
        onUsage: (usage) => logger.info({ event: "llm_usage", ...usage }, "llm"),
      },
      { profile, offerText: draft.offer.rawText },
      { onProgress, signal },
    );

    const costUsd = result.usage.reduce((sum, u) => sum + u.costUsd, 0);
    if (result.status === "degraded") {
      logger.warn({ event: "generation", status: "degraded", reason: result.reason, costUsd }, "generation");
      return { kind: "degraded", message: DEGRADED_MESSAGES[result.reason]! };
    }
    logger.info(
      {
        event: "generation",
        status: "ok",
        score: result.report.score,
        removed: result.removed.length,
        missingKeywords: result.cv.missingKeywords.length,
        costUsd,
        pipelineVersion: result.pipelineVersion,
      },
      "generation",
    );
    req.session.generation = {
      key: generationKey(profile, draft),
      cv: result.cv,
      report: result.report,
      removed: result.removed,
      edited: [],
      providerKind: result.providerKind,
      model: result.model,
      pipelineVersion: result.pipelineVersion,
    };
    return { kind: "ok", supported: result.report.supportedLines, checked: result.report.checkedLines };
  }

  const notify = (req: Request, outcome: Outcome) => {
    if (outcome.kind !== "ok") req.session.notice = { kind: "error", text: outcome.message };
  };

  // Sans JavaScript : génération pendant la requête, puis retour à l'aperçu.
  cv.post("/generer", async (req, res) => {
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    notify(req, await runGeneration(req, () => undefined, controller.signal));
    res.redirect(303, "/cv/etape/4");
  });

  // Avec JavaScript : même génération, progression diffusée en SSE. Le jeton à
  // usage unique (présent seulement dans la page) protège ce GET contre le CSRF.
  cv.get("/generer/flux", async (req, res) => {
    const token = typeof req.query.jeton === "string" ? req.query.jeton : "";
    if (!token || token !== req.session.generationToken) {
      throw new AppError("generation_token", 403, "Lien de génération expiré. Rechargez la page.");
    }
    delete req.session.generationToken;

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
      notify(req, outcome);
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve())),
      );
      send("done", { redirect: "/cv/etape/4" });
    } catch (error) {
      if (!controller.signal.aborted) logger.error({ err: error }, "generation: erreur inattendue");
      send("failure", { message: "Une erreur inattendue est survenue. Réessayez dans un instant." });
    } finally {
      res.end();
    }
  });

  cv.post("/generation/corrections", (req, res) => {
    const profile = validProfile(draftOf(req));
    const { generation } = currentGeneration(req.session.generation, profile, draftOf(req));
    if (!generation || !profile) return res.redirect(303, "/cv/etape/4");
    req.session.generation = applyCorrections(generation, profile, req.body);
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
    const back = () => res.redirect(303, "/cv/etape/1");
    if (!provider || provider.kind !== "ia") {
      req.session.notice = { kind: "error", text: "L'import de CV n'est pas disponible sur ce serveur." };
      return back();
    }
    const file = req.file;
    if (!file) {
      req.session.notice = { kind: "error", text: "Choisissez un fichier PDF à importer." };
      return back();
    }
    try {
      const text = await extractPdfText(new Uint8Array(file.buffer));
      const { profile, usage } = await extractProfile(provider, text);
      logger.info({ event: "llm_usage", ...usage }, "llm");
      req.session.draft = { ...draftOf(req), ...draftFromExtraction(profile) };
      delete req.session.generation;
      req.session.notice = {
        kind: "info",
        text: "Profil pré-rempli à partir de votre CV. Relisez et corrigez chaque champ : rien ne sera utilisé sans votre validation.",
      };
    } catch (error) {
      const message =
        error instanceof PdfImportError
          ? error.publicMessage
          : "L'import est indisponible pour le moment. Vous pouvez saisir votre profil à la main.";
      if (!(error instanceof PdfImportError)) logger.warn({ err: error }, "import: échec");
      req.session.notice = { kind: "error", text: message };
    }
    back();
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
