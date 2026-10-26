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
import { AssistUnavailableError, BudgetedProvider, type LlmProvider } from "@attesta/llm-client";
import {
  atsAdvice,
  atsCoverage,
  atsProposal,
  AtsProposalError,
  interviewFeedback,
  interviewPrep,
  judgeFidelity,
  learningOverview,
  learningPlan,
  translateCv,
  translationIssue,
  type GenerationSnapshot,
} from "./assistants.js";
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
import {
  AssistantResults,
  AssistantVote,
  AtsAdvice,
  AtsApplyRequest,
  AtsOverview,
  AtsProposal,
  CvTranslation,
  FidelityJudgement,
  InterviewAnswer,
  InterviewFeedback,
  InterviewPrep,
  InterviewPrepRequest,
  LearningOverview,
  LearningPlan,
  TranslateRequest,
  TranslationEdit,
} from "@attesta/shared-schemas";
import type { Express, Response } from "express";
import { z } from "zod";
import { AdditionError, applyCorrections } from "./corrections.js";
import { checkLine, cvLines, lineContext } from "./faithfulness.js";
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
    path: "/v1/generations/{id}/judge",
    operationId: "jugerFidelite",
    summary: "Juge de fidélité : verdict de sens par ligne (ADR 0028, rôle 2)",
    tags: ["assistants"],
    auth: true,
    responses: {
      200: { description: "Réponse de l'assistant", schema: FidelityJudgement },
      404: { description: "Génération inconnue" },
      409: { description: "Génération sans CV reformulé" },
      503: { description: "Assistant indisponible" },
    },
  },
  {
    method: "post",
    path: "/v1/generations/{id}/interview",
    operationId: "preparerEntretien",
    summary: "Coach d'entretien : questions probables, selon le niveau RH, manager ou technique (rôle 3)",
    tags: ["assistants"],
    auth: true,
    body: InterviewPrepRequest,
    responses: {
      200: { description: "Réponse de l'assistant", schema: InterviewPrep },
      404: { description: "Génération inconnue" },
      409: { description: "Génération sans CV reformulé" },
      503: { description: "Assistant indisponible" },
    },
  },
  {
    method: "post",
    path: "/v1/generations/{id}/interview/feedback",
    operationId: "commenterReponse",
    summary: "Coach d'entretien : retour sur une réponse (rôle 3)",
    tags: ["assistants"],
    auth: true,
    body: InterviewAnswer,
    responses: {
      200: { description: "Réponse de l'assistant", schema: InterviewFeedback },
      404: { description: "Génération inconnue" },
      409: { description: "Génération sans CV reformulé" },
      503: { description: "Assistant indisponible" },
    },
  },
  {
    method: "post",
    path: "/v1/generations/{id}/learning-plan",
    operationId: "planProgression",
    summary: "Plan de progression des compétences absentes (rôle 4)",
    tags: ["assistants"],
    auth: true,
    responses: {
      200: { description: "Réponse de l'assistant", schema: LearningPlan },
      404: { description: "Génération inconnue" },
      409: { description: "Génération sans CV reformulé" },
      503: { description: "Assistant indisponible" },
    },
  },
  {
    method: "post",
    path: "/v1/generations/{id}/translate",
    operationId: "traduireCv",
    summary: "Traduction fidèle du CV en anglais ou en allemand (rôle 6)",
    tags: ["assistants"],
    auth: true,
    body: TranslateRequest,
    responses: {
      200: { description: "Réponse de l'assistant", schema: CvTranslation },
      404: { description: "Génération inconnue" },
      409: { description: "Génération sans CV reformulé" },
      503: { description: "Assistant indisponible" },
    },
  },
  {
    method: "post",
    path: "/v1/generations/{id}/ats",
    operationId: "conseilsAts",
    summary: "Conseillère ATS : statut et conseil pour chaque mot-clé (rôle 8)",
    tags: ["assistants"],
    auth: true,
    responses: {
      200: { description: "Réponse de l'assistant", schema: AtsAdvice },
      404: { description: "Génération inconnue" },
      409: { description: "Génération sans CV reformulé" },
      503: { description: "Assistant indisponible" },
    },
  },
  {
    method: "get",
    path: "/v1/generations/{id}/assistants",
    operationId: "resultatsAssistants",
    summary: "Derniers résultats des assistants pour ce CV (ADR 0029)",
    tags: ["assistants"],
    auth: true,
    responses: { 200: { description: "Résultats par clé", schema: AssistantResults } },
  },
  {
    method: "put",
    path: "/v1/generations/{id}/translation/{lang}",
    operationId: "corrigerTraduction",
    summary: "Lignes traduites modifiées par le candidat ; mêmes chiffres et noms propres exigés",
    tags: ["assistants"],
    auth: true,
    body: TranslationEdit,
    responses: {
      200: { description: "Traduction conservée", schema: CvTranslation },
      400: { description: "Ligne refusée" },
      404: { description: "Traduction inconnue" },
    },
  },
  {
    method: "post",
    path: "/v1/generations/{id}/ats/apply",
    operationId: "appliquerConseilAts",
    summary: "Proposition d'ajout d'un fait du profil (recopié) qui contient le mot-clé ; à valider",
    tags: ["assistants"],
    auth: true,
    body: AtsApplyRequest,
    responses: {
      200: { description: "Proposition", schema: AtsProposal },
      409: { description: "Aucun fait reprenable" },
    },
  },
  {
    method: "get",
    path: "/v1/ats/overview",
    operationId: "couvertureAts",
    summary: "Couverture des mots-clés de chaque CV du candidat (code seul, sans IA)",
    tags: ["assistants"],
    auth: true,
    responses: { 200: { description: "Couverture par CV", schema: AtsOverview } },
  },
  {
    method: "post",
    path: "/v1/learning-plan",
    operationId: "planProgressionGlobal",
    summary: "Plan de progression sur tous les CV : compétences les plus demandées d'abord",
    tags: ["assistants"],
    auth: true,
    responses: {
      200: { description: "Plan", schema: LearningOverview },
      503: { description: "Assistant indisponible" },
    },
  },
  {
    method: "post",
    path: "/v1/assistants/feedback",
    operationId: "avisAssistant",
    summary: "Avis 👍 / 👎 anonyme sur une réponse d'assistant",
    tags: ["assistants"],
    auth: true,
    body: AssistantVote,
    responses: { 204: { description: "Enregistré" } },
  },
  {
    method: "get",
    path: "/internal/v1/generations/{id}/translation/{lang}",
    operationId: "traductionConservee",
    summary: "Traduction conservée d'un CV vérifié, pour l'export (jeton relayé)",
    tags: ["interne"],
    auth: true,
    responses: {
      200: { description: "Traduction", schema: CvTranslation },
      404: { description: "Aucune traduction" },
    },
  },
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

/** Instantané d'une génération vérifiée, tel que les assistants le lisent. */
export function toSnapshot(row: GenerationRow): GenerationSnapshot {
  return {
    profile: row.profile,
    cv: row.cv!,
    offerTitle: row.offerTitle,
    offerText: row.offerText,
    analysis: row.analysis ?? { title: row.offerTitle, language: "fr", requirements: [], keywords: [] },
  };
}

const cvLinesOf = (g: GenerationSnapshot) =>
  cvLines(g.cv).map(({ path, line }) => ({ path, text: line.text }));

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
    let corrected;
    try {
      corrected = applyCorrections(
        { cv: row.cv, edited: row.edited },
        row.profile,
        row.offerText,
        body.lines,
        body.additions,
      );
    } catch (error) {
      if (error instanceof AdditionError) throw new AppError("ajout_refuse", 400, error.message);
      throw error;
    }
    const saved = await store.saveCorrections(me(res), id, body.revision, corrected);
    if (!saved) throw conflict();
    logger.info(
      { event: "corrections", lines: body.lines.length, score: corrected.report.score },
      "generation",
    );
    res.json(toDto(saved));
  });

  // --- Assistants du CV (ADR 0028) : l'IA explique et conseille, le code garde la main sur le vérifiable.

  /** Instantané d'une génération reformulée, ou 409 : les assistants travaillent sur un CV vérifié. */
  async function snapshot(res: Response, id: string): Promise<GenerationSnapshot> {
    const row = await own(res, id);
    if (row.status !== "ok" || !row.cv)
      throw new AppError("generation_degradee", 409, "Cette génération n'a pas de CV reformulé.");
    return toSnapshot(row);
  }

  /** Exécute un assistant ; panne, refus ou budget atteint : 503 explicite, jamais une sortie non validée. */
  async function withAssistant<T>(role: string, run: (provider: LlmProvider) => Promise<T>): Promise<T> {
    if (!llm)
      throw new AppError("assistant_indisponible", 503, "L'assistant n'est pas disponible sur ce serveur.");
    try {
      const result = await run(llm);
      logger.info({ event: "assistant", role }, "assistant");
      return result;
    } catch (error) {
      if (!(error instanceof AssistUnavailableError)) throw error;
      logger.warn({ event: "assistant_indisponible", role, reason: error.reason }, "assistant");
      throw new AppError(
        "assistant_indisponible",
        503,
        "L'assistant est indisponible pour le moment. Réessayez dans un instant.",
      );
    }
  }

  /** Exécute un assistant sur un CV et conserve son résultat sous `key` (ADR 0029, point 1). */
  async function kept<T>(res: Response, id: string, key: string, result: T): Promise<T> {
    await store.saveResult(me(res), id, key, result);
    return result;
  }

  app.get("/v1/generations/:id/assistants", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    await own(res, id);
    res.json(await store.results(me(res), id));
  });

  app.post("/v1/generations/:id/judge", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    const g = await snapshot(res, id);
    const result = await withAssistant("juge-fidelite", (p) => judgeFidelity(p, g));
    // Un verdict vaut pour une révision donnée du CV : corrigé ensuite, le CV doit être rejugé.
    const { revision } = await own(res, id);
    res.json(await kept(res, id, "juge-fidelite", { ...result, revision }));
  });

  app.post("/v1/generations/:id/interview", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    const g = await snapshot(res, id);
    const { level } = parseInput(InterviewPrepRequest, req.body ?? {});
    const result = await withAssistant("coach-questions", (p) => interviewPrep(p, g, level));
    res.json(await kept(res, id, `coach-questions:${level}`, result));
  });

  app.post("/v1/generations/:id/interview/feedback", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    const g = await snapshot(res, id);
    const input = parseInput(InterviewAnswer, req.body);
    const result = await withAssistant("coach-retour", (p) => interviewFeedback(p, g, input));
    // Historique des entraînements : les 30 dernières réponses, pour mesurer la progression.
    const history = ((await store.result(me(res), id, "coach-historique")) as unknown[] | undefined) ?? [];
    await store.saveResult(me(res), id, "coach-historique", [
      ...history.slice(-29),
      { question: input.question, answer: input.answer, feedback: result, at: new Date().toISOString() },
    ]);
    res.json(result);
  });

  app.post("/v1/generations/:id/learning-plan", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    const g = await snapshot(res, id);
    const result = await withAssistant("plan-progression", (p) => learningPlan(p, g));
    res.json(await kept(res, id, "plan-progression", result));
  });

  app.post("/v1/learning-plan", auth, user, async (_req, res) => {
    const rows = await store.listVerified(me(res));
    res.json(await withAssistant("plan-progression", (p) => learningOverview(p, rows.map(toSnapshot))));
  });

  app.post("/v1/generations/:id/translate", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    const g = await snapshot(res, id);
    const { lang } = parseInput(TranslateRequest, req.body);
    const result = await withAssistant("traduction", (p) => translateCv(p, g, lang));
    res.json(await kept(res, id, `traduction:${lang}`, result));
  });

  /** Lignes traduites modifiées par le candidat : chacune garde les chiffres et noms propres de l'original. */
  app.put("/v1/generations/:id/translation/:lang", auth, user, async (req, res) => {
    const { id, lang } = parseInput(IdParam.extend({ lang: TranslateRequest.shape.lang }), req.params);
    const g = await snapshot(res, id);
    const { lines } = parseInput(TranslationEdit, req.body);
    const stored = (await store.result(me(res), id, `traduction:${lang}`)) as CvTranslation | undefined;
    if (!stored) throw notFound("Traduisez d'abord votre CV dans cette langue.");
    const source = new Map(cvLinesOf(g).map((l) => [l.path, l.text]));
    const byPath = new Map(stored.lines.map((l) => [l.path, l]));
    const edited = new Set(stored.edited ?? []);
    for (const line of lines) {
      const original = source.get(line.path);
      if (original === undefined)
        throw new AppError("ligne_inconnue", 400, "Cette ligne n'existe pas dans le CV.");
      const issue = translationIssue(g.profile, original, line.text);
      if (issue) throw new AppError("traduction_refusee", 400, issue);
      byPath.set(line.path, { path: line.path, source: original, text: line.text });
      edited.add(line.path);
    }
    const order = [...source.keys()];
    const result: CvTranslation = {
      ...stored,
      lines: order.flatMap((p) => byPath.get(p) ?? []),
      rejectedPaths: order.filter((p) => !byPath.has(p)),
      rejected: order.filter((p) => !byPath.has(p)).length,
      edited: [...edited],
    };
    res.json(await kept(res, id, `traduction:${lang}`, result));
  });

  app.post("/v1/generations/:id/ats", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    const g = await snapshot(res, id);
    const result = await withAssistant("conseils-ats", (p) => atsAdvice(p, g));
    res.json(await kept(res, id, "conseils-ats", result));
  });

  app.post("/v1/generations/:id/ats/apply", auth, user, async (req, res) => {
    const g = await snapshot(res, parseInput(IdParam, req.params).id);
    const { term, entry } = parseInput(AtsApplyRequest, req.body);
    try {
      res.json(atsProposal(g, term, entry));
    } catch (error) {
      if (error instanceof AtsProposalError) throw new AppError("ajout_impossible", 409, error.message);
      throw error;
    }
  });

  app.get("/v1/ats/overview", auth, user, async (_req, res) => {
    const rows = await store.listVerified(me(res));
    res.json(
      rows.map((row) => ({
        generationId: row.id,
        offerTitle: row.offerTitle,
        ...atsCoverage(toSnapshot(row)),
      })),
    );
  });

  app.post("/v1/assistants/feedback", auth, user, async (req, res) => {
    const { role, vote, providerKind } = parseInput(AssistantVote, req.body);
    await store.vote(role, vote, providerKind);
    res.status(204).end();
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
      votes: await store.voteStats(),
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

  app.get("/internal/v1/generations/:id/translation/:lang", auth, user, async (req, res) => {
    const { id, lang } = parseInput(IdParam.extend({ lang: TranslateRequest.shape.lang }), req.params);
    const row = await own(res, id);
    if (row.status !== "ok" || !row.cv)
      throw new AppError("cv_non_verifie", 409, "Ce CV n'a pas passé le contrôle de fidélité.");
    const stored = await store.result(me(res), id, `traduction:${lang}`);
    if (!stored) throw notFound("Ce CV n'a pas encore été traduit dans cette langue.");
    res.json(stored);
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
