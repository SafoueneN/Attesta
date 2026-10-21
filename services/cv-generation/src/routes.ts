import {
  AppError,
  authenticate,
  notFound,
  parseInput,
  principalOf,
  requireRole,
  requireScope,
  type Operation,
  type TokenVerifier,
} from "@attesta/http-kit";
import { BudgetedProvider, type LlmProvider } from "@attesta/llm-client";
import type { Logger } from "@attesta/logger";
import {
  Corrections,
  Generation,
  GenerationCreate,
  GenerationSummary,
  IdParam,
  LinesCheck,
  LinesCheckResult,
  ServiceStats,
  UserExport,
} from "@attesta/shared-schemas";
import type { Express, Response } from "express";
import { z } from "zod";
import { applyCorrections } from "./corrections.js";
import { checkLine, lineContext } from "./faithfulness.js";
import { generateTailoredCv, type ProgressEvent } from "./pipeline.js";
import type { GenerationRow, GenerationStore, IaQuota } from "./store.js";
import type { Upstreams } from "./upstreams.js";

export interface RouteDeps {
  store: GenerationStore;
  quota: IaQuota;
  upstreams: Upstreams;
  verifier: TokenVerifier;
  logger: Logger;
  llm?: BudgetedProvider | LlmProvider;
  /** Plafond de coût d'un CV, en USD. */
  maxCostUsd: number;
  /** Appels à l'IA par utilisateur et par jour. */
  dailyQuota: number;
}

const UserParam = z.object({ id: z.string().regex(/^(guest_)?[0-9a-f-]{36}$/i, "Identifiant invalide") });

/** Messages du mode dégradé, en français, pour le candidat. */
export const DEGRADED_MESSAGES: Record<string, string> = {
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
      return `Offre analysée : ${event.keywords} mots-clés repérés.`;
    case "redaction":
      return event.attempt === 1
        ? "Rédaction ciblée à partir de vos seuls faits…"
        : `Réponse non conforme, nouvelle tentative (${event.attempt} sur 3)…`;
    case "controle":
      return `Contrôle de fidélité : ${event.supported} lignes sur ${event.checked} rattachées à votre profil.`;
  }
}

export const operations: Operation[] = [
  {
    method: "post",
    path: "/v1/generations",
    operationId: "genererCv",
    summary:
      "Génère un CV ciblé pour une offre ; avec « Accept: text/event-stream », progression en SSE puis événement done",
    tags: ["génération"],
    auth: true,
    body: GenerationCreate,
    responses: {
      201: { description: "Génération (vérifiée, ou en mode dégradé)", schema: Generation },
      404: { description: "Offre inconnue" },
      409: { description: "Profil absent, ou génération déjà en cours" },
      429: { description: "Quota quotidien atteint" },
    },
  },
  {
    method: "get",
    path: "/v1/generations",
    operationId: "mesGenerations",
    summary: "Historique des générations",
    tags: ["génération"],
    auth: true,
    responses: { 200: { description: "Générations", schema: z.array(GenerationSummary) } },
  },
  {
    method: "get",
    path: "/v1/generations/{id}",
    operationId: "uneGeneration",
    summary: "Génération, rapport de fidélité et trace des lignes écartées",
    tags: ["génération"],
    auth: true,
    responses: { 200: { description: "Génération", schema: Generation }, 404: { description: "Inconnue" } },
  },
  {
    method: "patch",
    path: "/v1/generations/{id}/lines",
    operationId: "corrigerLignes",
    summary: "Corrections du candidat (texte modifié ou ligne retirée) ; le score est recalculé",
    tags: ["génération"],
    auth: true,
    body: Corrections,
    responses: {
      200: { description: "Génération corrigée", schema: Generation },
      409: { description: "Version périmée (corrigée ailleurs entre-temps)" },
    },
  },
  {
    method: "delete",
    path: "/v1/generations/{id}",
    operationId: "supprimerGeneration",
    summary: "Supprime une génération",
    tags: ["génération"],
    auth: true,
    responses: { 204: { description: "Supprimée" } },
  },
  {
    method: "get",
    path: "/v1/admin/stats",
    operationId: "statistiquesGenerations",
    summary: "Compteurs, score moyen de fidélité et consommation du LLM, sans donnée personnelle",
    tags: ["administration"],
    auth: true,
    responses: { 200: { description: "Statistiques", schema: ServiceStats } },
  },
  {
    method: "get",
    path: "/internal/v1/generations/{id}",
    operationId: "generationVerifiee",
    summary: "CV vérifié pour l'export et les lettres (jeton relayé) ; refusé s'il n'est pas vérifié",
    tags: ["interne"],
    auth: true,
    responses: {
      200: { description: "Génération", schema: Generation },
      409: { description: "Non vérifiée" },
    },
  },
  {
    method: "post",
    path: "/internal/v1/generations/{id}/check",
    operationId: "controlerLignes",
    summary:
      "Contrôle de fidélité de lignes libres (paragraphes d'une lettre) contre le profil de la génération",
    tags: ["interne"],
    auth: true,
    body: LinesCheck,
    responses: { 200: { description: "Résultat par ligne", schema: LinesCheckResult } },
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
    summary: "Efface les générations d'un utilisateur, idempotent (users:delete)",
    tags: ["interne"],
    auth: true,
    responses: { 204: { description: "Effacé" } },
  },
];

export function toDto(row: GenerationRow): Generation {
  return {
    id: row.id,
    offerId: row.offerId,
    offerTitle: row.offerTitle,
    profileVersion: row.profileVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    status: row.status,
    degradedReason: (row.degradedReason as Generation["degradedReason"]) ?? null,
    message: row.degradedReason ? (DEGRADED_MESSAGES[row.degradedReason] ?? null) : null,
    cv: row.cv,
    report: row.report,
    removed: row.removed,
    edited: row.edited,
    revision: row.revision,
    analysis: row.analysis,
    profile: row.profile,
    providerKind: row.providerKind,
    model: row.model,
    pipelineVersion: row.pipelineVersion,
  };
}

export function registerRoutes(app: Express, deps: RouteDeps): void {
  const { store, quota, upstreams, verifier, logger, llm } = deps;
  const auth = authenticate(verifier);
  const user = requireRole("candidate", "admin", "guest");
  const me = (res: Response) => principalOf(res).sub;

  async function prepare(res: Response, offerId: string) {
    const token = principalOf(res).token;
    const [profile, offer] = await Promise.all([upstreams.profile(token), upstreams.offer(token, offerId)]);
    if (!offer) throw notFound("Cette offre n'existe pas ou a été supprimée.");
    if (!profile) {
      throw new AppError(
        "profil_absent",
        409,
        "Enregistrez d'abord votre profil : le CV ciblé n'utilise que ses faits.",
      );
    }
    if (!llm)
      throw new AppError(
        "generation_indisponible",
        503,
        "La génération n'est pas disponible sur ce serveur.",
      );
    return { profile, offer, llm };
  }

  async function run(
    userId: string,
    input: Awaited<ReturnType<typeof prepare>>,
    onProgress: (e: ProgressEvent) => void,
    signal: AbortSignal,
  ): Promise<GenerationRow> {
    const { profile, offer } = input;
    const started = Date.now();
    const result = await generateTailoredCv(
      { provider: input.llm, maxCostUsd: deps.maxCostUsd },
      { profile: profile.profile, offerText: offer.rawText, analysis: offer.analysis },
      { onProgress, signal },
    );
    const costUsd = result.usage.reduce((sum, u) => sum + u.costUsd, 0);
    const metrics = { costUsd, durationMs: Date.now() - started, calls: result.usage.length };
    const base = {
      offerId: offer.id,
      offerTitle: offer.title,
      offerText: offer.rawText,
      analysis: offer.analysis,
      profileVersion: profile.version,
      profile: profile.profile,
      costUsd,
      model: input.llm.model,
    };
    if (result.status === "degraded") {
      logger.warn(
        { event: "generation", status: "degraded", reason: result.reason, ...metrics },
        "generation",
      );
      return store.create(userId, {
        ...base,
        status: "degraded",
        degradedReason: result.reason,
        cv: null,
        report: null,
        removed: [],
        providerKind: input.llm.kind,
        pipelineVersion: "-",
      });
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
    return store.create(userId, {
      ...base,
      status: "ok",
      degradedReason: null,
      cv: result.cv,
      report: result.report,
      removed: result.removed,
      providerKind: result.providerKind,
      pipelineVersion: result.pipelineVersion,
    });
  }

  /** Un seul appel à l'IA à la fois par utilisateur, et quota quotidien, réservés de façon atomique. */
  async function reserved<T>(userId: string, work: () => Promise<T>): Promise<T> {
    const reservation = await quota.reserve(userId, deps.dailyQuota);
    if (reservation.status !== "ok") {
      if (reservation.status === "busy") {
        throw new AppError(
          "generation_en_cours",
          409,
          "Une génération est déjà en cours. Patientez quelques instants.",
        );
      }
      throw new AppError(
        "quota_atteint",
        429,
        `Limite de ${deps.dailyQuota} générations par jour atteinte. Votre CV non adapté reste exportable.`,
      );
    }
    try {
      return await work();
    } finally {
      await quota.release(userId, reservation.token);
    }
  }

  app.post("/v1/generations", auth, user, async (req, res) => {
    const { offerId } = parseInput(GenerationCreate, req.body);
    const userId = me(res);
    const input = await prepare(res, offerId);
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });

    if (!(req.get("accept") ?? "").includes("text/event-stream")) {
      const row = await reserved(userId, () => run(userId, input, () => undefined, controller.signal));
      return res.status(201).json(toDto(row));
    }

    // Flux SSE (ADR 0012, point 6) : lu par fetch côté navigateur, relayé sans tampon par la gateway.
    await reserved(userId, async () => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      });
      const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
      try {
        const row = await run(
          userId,
          input,
          (e) => send({ type: "progress", message: progressMessage(e) }),
          controller.signal,
        );
        send({ type: "done", generationId: row.id, status: row.status });
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error({ event: "generation_erreur", errorType: (error as Error)?.name }, "generation");
        }
        send({ type: "failure", message: "Une erreur inattendue est survenue. Réessayez dans un instant." });
      } finally {
        res.end();
      }
    });
  });

  app.get("/v1/generations", auth, user, async (_req, res) => {
    const rows = await store.list(me(res));
    res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  });

  const own = async (res: Response, id: string) => {
    const row = await store.get(me(res), id);
    if (!row) throw notFound("Cette génération n'existe pas.");
    return row;
  };

  app.get("/v1/generations/:id", auth, user, async (req, res) => {
    res.json(toDto(await own(res, parseInput(IdParam, req.params).id)));
  });

  app.patch("/v1/generations/:id/lines", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    const body = parseInput(Corrections, req.body);
    const row = await own(res, id);
    if (row.status !== "ok" || !row.cv) {
      throw new AppError("generation_degradee", 409, "Cette génération n'a pas de CV reformulé à corriger.");
    }
    const conflict = () =>
      new AppError(
        "version_perimee",
        409,
        "Ces corrections concernent une version précédente de votre CV. Rechargez la page avant de corriger.",
      );
    if (row.revision !== body.revision) throw conflict();
    const corrected = applyCorrections(
      { cv: row.cv, edited: row.edited },
      row.profile,
      row.offerText,
      body.lines,
    );
    const saved = await store.saveCorrections(me(res), id, body.revision, corrected);
    if (!saved) throw conflict();
    logger.info(
      { event: "corrections", lines: body.lines.length, score: corrected.report.score },
      "generation",
    );
    res.json(toDto(saved));
  });

  app.delete("/v1/generations/:id", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    if (!(await store.delete(me(res), id))) throw notFound("Cette génération n'existe pas.");
    res.status(204).end();
  });

  app.get("/v1/admin/stats", auth, requireRole("admin"), async (_req, res) => {
    logger.info({ event: "admin_acces", route: "/v1/admin/stats" }, "administration");
    res.json({
      service: "cv-generation",
      counters: await store.stats(),
      ...(llm instanceof BudgetedProvider && { llm: await llm.summary() }),
    });
  });

  // --- Interne ------------------------------------------------------------------------------------

  // Fidélité (ADR 0018, point 3) : seul un CV vérifié sort du service, pour l'export ou une lettre.
  app.get("/internal/v1/generations/:id", auth, user, async (req, res) => {
    const row = await own(res, parseInput(IdParam, req.params).id);
    if (row.status !== "ok" || !row.cv || !row.report) {
      throw new AppError("cv_non_verifie", 409, "Ce CV n'a pas passé le contrôle de fidélité.");
    }
    res.json(toDto(row));
  });

  // Contrôle des paragraphes d'une lettre (letters-export) contre le profil de la génération : sans
  // rattachement à une entrée, comme le titre et l'accroche (compétences déclarées admises).
  app.post("/internal/v1/generations/:id/check", auth, user, async (req, res) => {
    const row = await own(res, parseInput(IdParam, req.params).id);
    const { lines } = parseInput(LinesCheck, req.body);
    if (!row.cv) throw new AppError("cv_non_verifie", 409, "Ce CV n'a pas passé le contrôle de fidélité.");
    const ctx = lineContext(row.profile, row.cv.missingKeywords, row.offerText);
    res.json({
      lines: lines.map((line) => {
        // Une source qui n'est pas un pointeur de fait valide compte comme introuvable.
        const issues = checkLine({ text: line.text, sources: line.sources }, ctx);
        return { status: issues.length ? "unsupported" : "supported", issues };
      }),
    });
  });

  app.get("/internal/v1/users/:id/export", auth, requireScope("users:export"), async (req, res) => {
    const { id } = parseInput(UserParam, req.params);
    res.json({ service: "cv-generation", data: await store.exportUser(id) });
  });

  app.delete("/internal/v1/users/:id", auth, requireScope("users:delete"), async (req, res) => {
    const { id } = parseInput(UserParam, req.params);
    const count = await store.deleteUser(id);
    logger.info({ event: "rgpd_effacement", count }, "rgpd");
    res.status(204).end();
  });
}
