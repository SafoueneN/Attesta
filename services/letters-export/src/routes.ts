import { createHash, randomBytes } from "node:crypto";
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
import type { Logger } from "@attesta/logger";
import {
  CvExportRequest,
  CvShare,
  CvShareCreate,
  GapsReport,
  IdParam,
  Letter,
  LetterCreate,
  LetterSummary,
  LetterUpdate,
  OffersReport,
  ServiceStats,
  UserExport,
  type Generation,
  type Profile,
} from "@attesta/shared-schemas";
import {
  ApplicationAnswerRequest,
  ApplicationCheck,
  ApplicationCheckRequest,
  ApplicationHistoryItem,
  ApplicationMessageRequest,
  ApplicationText,
  ApplicationTracking,
  ApplicationTrackingInput,
  AssistantVote,
  LetterTranslation,
  TranslateRequest,
} from "@attesta/shared-schemas";
import type { Express, Response } from "express";
import { z } from "zod";
import { demoLetter, draftLetter, prompts, verifiedLines } from "./letters.js";
import {
  applyNorms,
  longFrenchDate,
  NORMS,
  renderCvDocx,
  renderCvHtml,
  renderGapsReportHtml,
  renderLetterHtml,
  renderOffersReportHtml,
  viewFromProfile,
  viewFromTailored,
  type CvNorms,
  type CvView,
  type PdfRenderer,
} from "./render/index.js";
import {
  answerQuestion,
  applicationDemoHandlers,
  factFree,
  fitLinkedIn,
  recruiterMessage,
  translateLetter,
  type ApplicationOutput,
} from "./applications.js";
import { appendAnnex, EVIDENCE_KIND_LABELS, renderAnnexHtml, unreadablePdf } from "./render/annex.js";
import type { LetterRow, LetterStore, ShareRow, TrackingRow } from "./store.js";
import type { Upstreams } from "./upstreams.js";

export interface RouteDeps {
  store: LetterStore;
  upstreams: Upstreams;
  renderer: PdfRenderer;
  verifier: TokenVerifier;
  logger: Logger;
  llm?: BudgetedProvider | LlmProvider;
  /** Rendus en attente au-delà desquels le service répond 503 (ADR 0018, point 5). */
  maxPendingRenders?: number;
  /** Adresse publique du frontend (liens de CV en ligne). */
  appBaseUrl?: string;
}

const UserParam = z.object({ id: z.string().regex(/^(guest_)?[0-9a-f-]{36}$/i, "Identifiant invalide") });

const pdfResponse = { description: "Document PDF (application/pdf)" };

export const operations: Operation[] = [
  {
    method: "post",
    path: "/v1/applications/check",
    operationId: "controlerTexteCandidature",
    summary: "Texte modifié par le candidat, recontrôlé paragraphe par paragraphe (ADR 0029)",
    tags: ["assistants"],
    auth: true,
    body: ApplicationCheckRequest,
    responses: { 200: { description: "Paragraphes et leur statut", schema: ApplicationCheck } },
  },
  {
    method: "get",
    path: "/v1/applications/history/{id}",
    operationId: "historiqueCandidature",
    summary: "Textes de candidature déjà rédigés pour ce CV (comptes)",
    tags: ["assistants"],
    auth: true,
    responses: { 200: { description: "Historique", schema: z.array(ApplicationHistoryItem) } },
  },
  {
    method: "delete",
    path: "/v1/applications/history/{id}",
    operationId: "supprimerTexteCandidature",
    summary: "Supprime un texte de l'historique",
    tags: ["assistants"],
    auth: true,
    responses: { 204: { description: "Supprimé" } },
  },
  {
    method: "get",
    path: "/v1/applications/tracking",
    operationId: "suiviCandidatures",
    summary: "Suivi des candidatures, avec la date de relance conseillée (comptes)",
    tags: ["assistants"],
    auth: true,
    responses: { 200: { description: "Suivi", schema: z.array(ApplicationTracking) } },
  },
  {
    method: "put",
    path: "/v1/applications/tracking/{id}",
    operationId: "suivreCandidature",
    summary: "Met à jour le suivi de la candidature d'un CV (comptes)",
    tags: ["assistants"],
    auth: true,
    body: ApplicationTrackingInput,
    responses: { 200: { description: "Suivi", schema: ApplicationTracking } },
  },
  {
    method: "post",
    path: "/v1/letters/{id}/translate",
    operationId: "traduireLettre",
    summary: "Lettre traduite en anglais ou en allemand ; paragraphe écarté si ses chiffres changent",
    tags: ["assistants"],
    auth: true,
    body: TranslateRequest,
    responses: {
      200: { description: "Lettre traduite", schema: LetterTranslation },
      503: { description: "Assistant indisponible" },
    },
  },
  {
    method: "post",
    path: "/v1/assistants/feedback",
    operationId: "avisAssistantLettres",
    summary: "Avis 👍 / 👎 anonyme sur une réponse d'assistant (ADR 0029)",
    tags: ["assistants"],
    auth: true,
    body: AssistantVote,
    responses: { 204: { description: "Enregistré" } },
  },
  {
    method: "post",
    path: "/v1/applications/answer",
    operationId: "repondreFormulaire",
    summary: "Réponse à une question de formulaire, contrôlée contre le CV vérifié (ADR 0028, rôle 7)",
    tags: ["assistants"],
    auth: true,
    body: ApplicationAnswerRequest,
    responses: {
      200: { description: "Texte contrôlé", schema: ApplicationText },
      409: { description: "CV non vérifié" },
      503: { description: "Assistant indisponible" },
    },
  },
  {
    method: "post",
    path: "/v1/applications/message",
    operationId: "messageRecruteur",
    summary: "Message au recruteur (LinkedIn, relance, remerciement), contrôlé contre le CV vérifié",
    tags: ["assistants"],
    auth: true,
    body: ApplicationMessageRequest,
    responses: {
      200: { description: "Texte contrôlé", schema: ApplicationText },
      409: { description: "CV non vérifié" },
      503: { description: "Assistant indisponible" },
    },
  },
  {
    method: "post",
    path: "/v1/letters",
    operationId: "redigerLettre",
    summary: "Rédige une lettre de motivation à partir d'un CV vérifié ; chaque paragraphe est contrôlé",
    tags: ["lettres"],
    auth: true,
    body: LetterCreate,
    responses: {
      201: { description: "Lettre", schema: Letter },
      409: { description: "CV non vérifié" },
    },
  },
  {
    method: "get",
    path: "/v1/letters",
    operationId: "mesLettres",
    summary: "Lettres de l'utilisateur",
    tags: ["lettres"],
    auth: true,
    responses: { 200: { description: "Lettres", schema: z.array(LetterSummary) } },
  },
  {
    method: "get",
    path: "/v1/letters/{id}",
    operationId: "uneLettre",
    summary: "Une lettre et le contrôle de chaque paragraphe",
    tags: ["lettres"],
    auth: true,
    responses: { 200: { description: "Lettre", schema: Letter }, 404: { description: "Inconnue" } },
  },
  {
    method: "put",
    path: "/v1/letters/{id}",
    operationId: "modifierLettre",
    summary: "Modifie la lettre ; les paragraphes sont recontrôlés, les écarts signalés",
    tags: ["lettres"],
    auth: true,
    body: LetterUpdate,
    responses: { 200: { description: "Lettre", schema: Letter } },
  },
  {
    method: "delete",
    path: "/v1/letters/{id}",
    operationId: "supprimerLettre",
    summary: "Supprime une lettre",
    tags: ["lettres"],
    auth: true,
    responses: { 204: { description: "Supprimée" } },
  },
  {
    method: "post",
    path: "/v1/letters/{id}/pdf",
    operationId: "lettrePdf",
    summary: "PDF de la lettre, produit à la demande et jamais stocké",
    tags: ["lettres"],
    auth: true,
    responses: { 200: pdfResponse },
  },
  {
    method: "post",
    path: "/v1/exports/cv",
    operationId: "exporterCv",
    summary: "PDF du CV : ciblé (génération vérifiée) ou non adapté (profil enregistré)",
    tags: ["export"],
    auth: true,
    body: CvExportRequest,
    responses: {
      200: pdfResponse,
      409: { description: "CV non vérifié ou profil absent" },
      503: { description: "File de rendu pleine" },
    },
  },
  {
    method: "post",
    path: "/v1/shares",
    operationId: "partagerCv",
    summary: "Crée un lien secret vers un instantané du CV (90 jours, révocable, non indexé ; ADR 0042)",
    tags: ["partage"],
    auth: true,
    body: CvShareCreate,
    responses: { 201: { description: "Lien créé", schema: CvShare } },
  },
  {
    method: "get",
    path: "/v1/shares",
    operationId: "mesPartages",
    summary: "Liens de partage actifs, avec le nombre de consultations",
    tags: ["partage"],
    auth: true,
    responses: { 200: { description: "Partages", schema: z.array(CvShare) } },
  },
  {
    method: "delete",
    path: "/v1/shares/{id}",
    operationId: "revoquerPartage",
    summary: "Révoque un lien de partage",
    tags: ["partage"],
    auth: true,
    responses: { 204: { description: "Révoqué" } },
  },
  {
    method: "get",
    path: "/v1/public/cv/{token}",
    operationId: "cvPartage",
    summary: "CV partagé, public par le lien (non indexé)",
    tags: ["partage"],
    responses: { 200: { description: "Document HTML" }, 404: { description: "Lien invalide ou expiré" } },
  },
  {
    method: "post",
    path: "/v1/exports/cv/docx",
    operationId: "exporterCvWord",
    summary: "CV au format Word (.docx), même contenu et mêmes usages du pays que le PDF (ADR 0037)",
    tags: ["export"],
    auth: true,
    body: CvExportRequest,
    responses: { 200: { description: "Document Word" } },
  },
  {
    method: "post",
    path: "/v1/exports/cv/preview",
    operationId: "apercuCv",
    summary: "HTML exact du PDF, pour l'aperçu (sans script, sans ressource externe)",
    tags: ["export"],
    auth: true,
    body: CvExportRequest,
    responses: { 200: { description: "Document HTML" } },
  },
  {
    method: "get",
    path: "/v1/admin/stats",
    operationId: "statistiquesLettres",
    summary: "Compteurs et consommation du LLM, sans donnée personnelle",
    tags: ["administration"],
    auth: true,
    responses: { 200: { description: "Statistiques", schema: ServiceStats } },
  },
  {
    method: "post",
    path: "/internal/v1/reports/offers",
    operationId: "rapportOffres",
    summary: "PDF du rapport des offres de la veille (jeton de service reports:render)",
    tags: ["interne"],
    auth: true,
    body: OffersReport,
    responses: { 200: pdfResponse },
  },
  {
    method: "post",
    path: "/internal/v1/reports/gaps",
    operationId: "rapportAmeliorations",
    summary: "PDF du rapport des points à améliorer (jeton de service reports:render)",
    tags: ["interne"],
    auth: true,
    body: GapsReport,
    responses: { 200: pdfResponse },
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
    summary: "Efface les lettres d'un utilisateur, idempotent (users:delete)",
    tags: ["interne"],
    auth: true,
    responses: { 204: { description: "Effacé" } },
  },
];

const toDto = (row: LetterRow): Letter => ({
  id: row.id,
  generationId: row.generationId,
  offerTitle: row.offerTitle,
  company: row.company,
  tone: row.tone,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  greeting: row.greeting,
  closing: row.closing,
  paragraphs: row.paragraphs,
  removed: row.removed,
  providerKind: row.providerKind,
});

/** « Léa Martin » → « lea-martin » : nom de fichier sans accent ni espace. */
const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "document";

export function registerRoutes(app: Express, deps: RouteDeps): void {
  const { store, upstreams, renderer, verifier, logger, llm } = deps;
  const auth = authenticate(verifier);
  const user = requireRole("candidate", "admin", "guest");
  const me = (res: Response) => principalOf(res).sub;
  const token = (res: Response) => principalOf(res).token;

  let pending = 0;
  /** Rendu borné : au-delà de la file, 503 avec un message en français plutôt qu'une attente sans fin. */
  async function render(html: string): Promise<Uint8Array> {
    if (pending >= (deps.maxPendingRenders ?? 6)) {
      throw new AppError(
        "rendu_sature",
        503,
        "Trop de documents sont en cours de création. Réessayez dans un instant.",
      );
    }
    pending++;
    try {
      return await renderer.render(html);
    } catch (error) {
      logger.error({ event: "rendu_echec", errorType: (error as Error)?.name }, "rendu");
      throw new AppError("rendu_echec", 503, "Le document n'a pas pu être créé. Réessayez dans un instant.");
    } finally {
      pending--;
    }
  }

  const sendPdf = (res: Response, pdf: Uint8Array, filename: string) => {
    res.set("Cache-Control", "no-store").type("application/pdf").attachment(filename).send(Buffer.from(pdf));
  };

  /**
   * Annexe « Justificatifs » (ADR 0027) : les pièces choisies par le candidat, lues chez `profiles` avec son
   * jeton relayé (il ne peut joindre que les siennes), après une page de garde qui les décrit.
   */
  async function withAnnex(res: Response, name: string, cv: Uint8Array, ids: string[]): Promise<Uint8Array> {
    if (principalOf(res).role === "guest")
      throw new AppError("compte_requis", 403, "Les justificatifs sont réservés aux comptes.");
    const all = await upstreams.evidence(token(res));
    const chosen = ids.map((id) => all.find((e) => e.id === id));
    if (chosen.some((e) => !e))
      throw new AppError("piece_inconnue", 404, "Une pièce choisie n'existe plus. Actualisez la page.");
    const items = await Promise.all(
      chosen.map(async (e) => {
        const bytes = await upstreams.evidenceFile(token(res), e!.id);
        if (!bytes)
          throw new AppError("piece_inconnue", 404, "Une pièce choisie n'existe plus. Actualisez la page.");
        const unreadable = e!.mimeType === "application/pdf" && (await unreadablePdf(bytes));
        return {
          item: {
            label: e!.label,
            kind: EVIDENCE_KIND_LABELS[e!.kind] ?? e!.kind,
            anchor: e!.anchor,
            mimeType: e!.mimeType,
            bytes,
          },
          note: unreadable
            ? "PDF protégé ou illisible : non reproduit ici, disponible sur demande."
            : e!.current
              ? undefined
              : "L'élément du profil a changé depuis le dépôt de cette pièce.",
        };
      }),
    );
    const cover = await render(
      renderAnnexHtml({ name, items: items.map(({ item, note }) => ({ ...item, note })) }),
    );
    return appendAnnex(
      cv,
      cover,
      items.map(({ item }) => item),
    );
  }

  async function verified(res: Response, generationId: string): Promise<Generation> {
    const generation = await upstreams.generation(token(res), generationId);
    if (!generation) {
      throw new AppError(
        "cv_non_verifie",
        409,
        "Ce CV n'est pas disponible : seul un CV vérifié peut être exporté.",
      );
    }
    return generation;
  }

  /** CV à rendre : ciblé et vérifié, ou non adapté depuis le profil enregistré (sans IA). */
  /**
   * Usages du pays (ADR 0036) : informations personnelles du profil le plus récent (saisies après la
   * génération comprises), photo seulement si le pays l'admet.
   */
  async function withNorms(res: Response, view: CvView, basics: Profile["basics"], norms: CvNorms) {
    const current = await upstreams.profile(token(res)).catch(() => undefined);
    const photo = NORMS[norms].photo ? await upstreams.photo(token(res)).catch(() => undefined) : undefined;
    return applyNorms(view, { ...basics, ...current?.profile.basics }, norms, photo);
  }

  async function cvHtml(res: Response, body: z.infer<typeof CvExportRequest>) {
    const { view, name } = await cvView(res, body);
    return { html: renderCvHtml(view, { variant: body.variant }), name };
  }

  async function cvView(res: Response, body: z.infer<typeof CvExportRequest>) {
    if (body.generationId) {
      const g = await verified(res, body.generationId);
      let cv = g.cv!;
      if (body.lang !== "fr") {
        // CV traduit (ADR 0029, point 6) : traduction conservée ; une ligne sans traduction garde l'original.
        const translation = await upstreams.translation(token(res), body.generationId, body.lang);
        if (!translation)
          throw new AppError("traduction_absente", 409, "Traduisez d'abord votre CV dans cette langue.");
        const byPath = new Map(translation.lines.map((l) => [l.path, l.text]));
        const tr = <T extends { text: string }>(line: T, path: string) => ({
          ...line,
          text: byPath.get(path) ?? line.text,
        });
        cv = {
          ...cv,
          headline: cv.headline && tr(cv.headline, "/headline"),
          summary: cv.summary.map((l, i) => tr(l, `/summary/${i}`)),
          work: cv.work.map((e, i) => ({
            ...e,
            highlights: e.highlights.map((l, j) => tr(l, `/work/${i}/highlights/${j}`)),
          })),
          projects: cv.projects.map((e, i) => ({
            ...e,
            highlights: e.highlights.map((l, j) => tr(l, `/projects/${i}/highlights/${j}`)),
          })),
        };
      }
      return {
        view: await withNorms(res, viewFromTailored(g.profile, cv, body.lang), g.profile.basics, body.norms),
        name: g.profile.basics.name,
      };
    }
    const stored = await upstreams.profile(token(res));
    if (!stored)
      throw new AppError("profil_absent", 409, "Enregistrez d'abord votre profil pour l'exporter.");
    return {
      view: await withNorms(res, viewFromProfile(stored.profile), stored.profile.basics, body.norms),
      name: stored.profile.basics.name,
    };
  }

  // --- Lettres --------------------------------------------------------------------------------------

  /**
   * Contrôle de fidélité des paragraphes par cv-generation : un paragraphe rédigé et non prouvé est retiré
   * (comme une ligne de CV) ; un paragraphe modifié par le candidat est gardé, l'écart signalé.
   */
  async function checked(
    res: Response,
    generationId: string,
    paragraphs: { text: string; sources: string[] }[],
    edited: boolean[],
  ) {
    const result = await upstreams.check(token(res), generationId, paragraphs);
    return paragraphs.map((p, i) => {
      const line = result.lines[i]!;
      const status = edited[i] ? ("edited" as const) : line.status;
      return { text: p.text, sources: p.sources, status, issues: line.issues };
    });
  }

  // --- Rédactrice de candidature (ADR 0028, rôle 7 ; ADR 0029) : même contrôle que la lettre. ----------

  const isGuest = (res: Response) => principalOf(res).role === "guest";

  /** Texte d'un fait du profil désigné par son pointeur, pour le montrer au survol d'un paragraphe. */
  const factLabel = (g: Generation, pointer: string) => {
    let node: unknown = g.profile;
    for (const token of pointer.split("/").slice(1))
      node = (node as Record<string, unknown> | undefined)?.[token];
    if (typeof node === "string") return node;
    if (node && typeof node === "object" && "name" in node) return String((node as { name: string }).name);
    return pointer;
  };

  /**
   * Rédige, contrôle chaque paragraphe porteur de faits, retire ceux sans source et assemble le texte.
   * Panne du modèle ou budget atteint : texte de démonstration à partir des lignes vérifiées. Pour un
   * compte, le texte entre dans l'historique du CV.
   */
  async function controlledText(
    res: Response,
    g: Generation,
    meta: {
      role: string;
      kind: "formulaire" | "linkedin" | "relance" | "remerciement";
      question: string | null;
    },
    write: (provider: LlmProvider) => Promise<{ data: ApplicationOutput; kind: "ia" | "demo" }>,
    demo: () => ApplicationOutput,
    defaults: { opening: string; closing: string },
  ) {
    if (!llm)
      throw new AppError("assistant_indisponible", 503, "L'assistant n'est pas disponible sur ce serveur.");
    let draft: ApplicationOutput;
    let providerKind: "ia" | "demo";
    try {
      ({ data: draft, kind: providerKind } = await write(llm));
    } catch (error) {
      logger.warn(
        { event: "assistant_degrade", role: meta.role, errorType: (error as Error)?.name },
        "assistant",
      );
      draft = demo();
      providerKind = "demo";
    }
    const paragraphs = draft.paragraphs.length
      ? await checked(
          res,
          g.id,
          draft.paragraphs,
          draft.paragraphs.map(() => false),
        )
      : [];
    const supported = paragraphs.filter((p) => p.status === "supported");
    let parts = {
      opening: factFree(draft.opening, defaults.opening),
      kept: supported,
      closing: factFree(draft.closing, defaults.closing),
    };
    // Note d'invitation LinkedIn : 300 caractères au plus, coupée à la phrase par le code (ADR 0029).
    if (meta.kind === "linkedin") parts = fitLinkedIn(parts);
    const removed = paragraphs.length - parts.kept.length;
    logger.info({ event: "assistant", role: meta.role, kept: parts.kept.length, removed }, "assistant");
    const formule = (text: string) => ({ text, sources: [], sourceLabels: [], status: "formule" as const });
    const text = [parts.opening, ...parts.kept.map((p) => p.text), parts.closing].join("\n\n");
    const id = isGuest(res)
      ? null
      : await store.saveApplicationText(me(res), {
          generationId: g.id,
          kind: meta.kind,
          question: meta.question,
          text,
        });
    return {
      id,
      text,
      paragraphs: [
        formule(parts.opening),
        ...parts.kept.map((p) => ({
          text: p.text,
          sources: p.sources,
          sourceLabels: p.sources.map((s) => factLabel(g, s)),
          status: "supported" as const,
        })),
        formule(parts.closing),
      ],
      removed,
      providerKind,
    };
  }

  app.post("/v1/applications/answer", auth, user, async (req, res) => {
    const { generationId, question, tone, length } = parseInput(ApplicationAnswerRequest, req.body);
    const g = await verified(res, generationId);
    res.json(
      await controlledText(
        res,
        g,
        { role: "reponse-formulaire", kind: "formulaire", question },
        (p) => answerQuestion(p, g, { question, tone, length }),
        () =>
          applicationDemoHandlers["reponse-formulaire"]!({
            question,
            ton: tone,
            longueur: length,
            lignes_verifiees: verifiedLines(g),
          }) as ApplicationOutput,
        { opening: "Voici ma réponse.", closing: "Je reste à votre disposition." },
      ),
    );
  });

  app.post("/v1/applications/message", auth, user, async (req, res) => {
    const { generationId, kind, tone } = parseInput(ApplicationMessageRequest, req.body);
    const g = await verified(res, generationId);
    res.json(
      await controlledText(
        res,
        g,
        { role: "message-recruteur", kind, question: null },
        (p) => recruiterMessage(p, g, kind, tone),
        () =>
          applicationDemoHandlers["message-recruteur"]!({
            offre: { titre: g.offerTitle },
            type_de_message: kind,
            ton: tone,
            lignes_verifiees: verifiedLines(g),
          }) as ApplicationOutput,
        { opening: "Bonjour,", closing: "Bien cordialement." },
      ),
    );
  });

  /**
   * Texte modifié par le candidat : chaque paragraphe qui porte un fait (chiffre, outil, majuscule interne)
   * est rattaché à la ligne vérifiée la plus proche puis recontrôlé ; les autres sont des formules.
   */
  app.post("/v1/applications/check", auth, user, async (req, res) => {
    const { generationId, text } = parseInput(ApplicationCheckRequest, req.body);
    const g = await verified(res, generationId);
    const lines = verifiedLines(g);
    const words = (t: string) =>
      new Set(
        t
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((w) => w.length > 3),
      );
    const blocks = text
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean)
      .slice(0, 20);
    const factual = (b: string) => /\d/.test(b) || /\p{Lu}.*\p{Lu}/u.test(b.slice(1)) || b.length > 160;
    const withSources = blocks.map((b) => {
      if (!factual(b)) return { text: b, sources: [] as string[] };
      const own = words(b);
      const best = lines
        .map((l) => ({ l, score: [...words(l.text)].filter((w) => own.has(w)).length }))
        .sort((x, y) => y.score - x.score)[0];
      return { text: b, sources: best && best.score > 0 ? best.l.sources : [] };
    });
    const toCheck = withSources.filter((p) => p.sources.length);
    const result = toCheck.length ? await upstreams.check(token(res), generationId, toCheck) : { lines: [] };
    let k = 0;
    res.json({
      paragraphs: withSources.map((p) => {
        if (!factual(p.text))
          return { text: p.text, sources: [], sourceLabels: [], status: "formule" as const };
        if (!p.sources.length)
          return { text: p.text, sources: [], sourceLabels: [], status: "unsupported" as const };
        const status = result.lines[k++]!.status;
        return {
          text: p.text,
          sources: p.sources,
          sourceLabels: p.sources.map((s) => factLabel(g, s)),
          status,
        };
      }),
    });
  });

  app.get("/v1/applications/history/:id", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    res.json(isGuest(res) ? [] : await store.applicationHistory(me(res), id));
  });

  app.delete("/v1/applications/history/:id", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    if (!(await store.deleteApplicationText(me(res), id))) throw notFound("Ce texte n'existe plus.");
    res.status(204).end();
  });

  const trackingDto = (t: TrackingRow) => {
    const followUp =
      t.sentAt && t.status === "envoyee"
        ? new Date(Date.parse(`${t.sentAt}T00:00:00Z`) + 10 * 86_400_000).toISOString().slice(0, 10)
        : null;
    return { ...t, followUpOn: followUp, updatedAt: t.updatedAt.toISOString() };
  };

  const accountOnly = (res: Response) => {
    if (isGuest(res))
      throw new AppError("compte_requis", 403, "Le suivi des candidatures est réservé aux comptes.");
  };

  app.get("/v1/applications/tracking", auth, user, async (_req, res) => {
    accountOnly(res);
    res.json((await store.trackings(me(res))).map(trackingDto));
  });

  app.put("/v1/applications/tracking/:id", auth, user, async (req, res) => {
    accountOnly(res);
    const { id } = parseInput(IdParam, req.params);
    const input = parseInput(ApplicationTrackingInput, req.body);
    const g = await verified(res, id);
    const row = await store.saveTracking(me(res), { generationId: id, offerTitle: g.offerTitle, ...input });
    res.json(trackingDto(row));
  });

  app.post("/v1/assistants/feedback", auth, user, async (req, res) => {
    const { role, vote, providerKind } = parseInput(AssistantVote, req.body);
    await store.vote(role, vote, providerKind);
    res.status(204).end();
  });

  app.post("/v1/letters", auth, user, async (req, res) => {
    const { generationId, tone } = parseInput(LetterCreate, req.body);
    if (!llm)
      throw new AppError(
        "lettre_indisponible",
        503,
        "La rédaction de lettres n'est pas disponible sur ce serveur.",
      );
    const g = await verified(res, generationId);
    let draft;
    let providerKind = llm.kind;
    try {
      draft = await draftLetter(llm, g, tone);
    } catch (error) {
      // Panne ou budget atteint : lettre de démonstration à partir des lignes vérifiées (mode dégradé).
      logger.warn({ event: "lettre_degradee", errorType: (error as Error)?.name }, "lettre");
      const offer = g.analysis ?? { title: g.offerTitle, requirements: [], keywords: [] };
      draft = demoLetter({ offer, lines: verifiedLines(g), tone });
      providerKind = "demo";
    }
    const paragraphs = draft.paragraphs.length
      ? await checked(
          res,
          generationId,
          draft.paragraphs,
          draft.paragraphs.map(() => false),
        )
      : [];
    const kept = paragraphs.filter((p) => p.status === "supported");
    if (kept.length === 0) {
      throw new AppError(
        "lettre_non_conforme",
        422,
        "Aucun paragraphe de la lettre n'a passé le contrôle de fidélité. Réessayez.",
      );
    }
    const row = await store.create(
      me(res),
      {
        generationId,
        offerTitle: g.offerTitle,
        company: g.analysis?.company ?? null,
        tone,
        greeting: draft.greeting,
        closing: draft.closing,
        paragraphs: kept,
        removed: paragraphs.length - kept.length,
        providerKind,
      },
      prompts.signature("lettre"),
    );
    logger.info({ event: "lettre", paragraphs: kept.length, removed: row.removed, providerKind }, "lettre");
    res.status(201).json(toDto(row));
  });

  app.get("/v1/letters", auth, user, async (_req, res) => {
    const rows = await store.list(me(res));
    res.json(
      rows.map((r) => ({
        id: r.id,
        generationId: r.generationId,
        offerTitle: r.offerTitle,
        company: r.company,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    );
  });

  const own = async (res: Response, id: string) => {
    const row = await store.get(me(res), id);
    if (!row) throw notFound("Cette lettre n'existe pas.");
    return row;
  };

  app.get("/v1/letters/:id", auth, user, async (req, res) => {
    res.json(toDto(await own(res, parseInput(IdParam, req.params).id)));
  });

  app.put("/v1/letters/:id", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    const body = parseInput(LetterUpdate, req.body);
    const row = await own(res, id);
    // Un paragraphe inchangé garde ses sources ; un paragraphe modifié ou nouveau est recontrôlé.
    const paragraphs = body.paragraphs.map((p, i) => {
      const before = row.paragraphs[i];
      return before && before.text === p.text
        ? { text: p.text, sources: before.sources, edited: before.status === "edited" }
        : { text: p.text, sources: before?.sources ?? [], edited: true };
    });
    const rechecked = await checked(
      res,
      row.generationId,
      paragraphs.map(({ text, sources }) => ({ text, sources })),
      paragraphs.map((p) => p.edited),
    );
    const saved = await store.update(me(res), id, {
      greeting: body.greeting,
      closing: body.closing,
      paragraphs: rechecked,
    });
    res.json(toDto(saved!));
  });

  app.delete("/v1/letters/:id", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    if (!(await store.delete(me(res), id))) throw notFound("Cette lettre n'existe pas.");
    res.status(204).end();
  });

  app.post("/v1/letters/:id/translate", auth, user, async (req, res) => {
    const row = await own(res, parseInput(IdParam, req.params).id);
    const { lang } = parseInput(TranslateRequest, req.body);
    if (!llm)
      throw new AppError("assistant_indisponible", 503, "L'assistant n'est pas disponible sur ce serveur.");
    try {
      const result = await translateLetter(
        llm,
        { greeting: row.greeting, paragraphs: row.paragraphs.map((p) => p.text), closing: row.closing },
        lang,
      );
      logger.info({ event: "assistant", role: "traduction-lettre", rejected: result.rejected }, "assistant");
      res.json(result);
    } catch (error) {
      if (!(error instanceof AssistUnavailableError)) throw error;
      throw new AppError(
        "assistant_indisponible",
        503,
        "L'assistant est indisponible pour le moment. Réessayez dans un instant.",
      );
    }
  });

  app.post("/v1/letters/:id/pdf", auth, user, async (req, res) => {
    const row = await own(res, parseInput(IdParam, req.params).id);
    const g = await verified(res, row.generationId);
    const { basics } = g.profile;
    const html = renderLetterHtml({
      name: basics.name,
      contact: [basics.email, basics.phone, basics.location?.city].filter((c): c is string => Boolean(c)),
      date: longFrenchDate(new Date()),
      city: basics.location?.city,
      company: row.company ?? undefined,
      subject: `Candidature au poste de ${row.offerTitle}`,
      greeting: row.greeting,
      paragraphs: row.paragraphs.map((p) => p.text),
      closing: row.closing,
    });
    const pdf = await render(html);
    logger.info({ event: "pdf_export", document: "lettre" }, "export");
    sendPdf(res, pdf, `lettre-${slug(basics.name)}.pdf`);
  });

  // --- Export du CV ---------------------------------------------------------------------------------

  app.post("/v1/exports/cv", auth, user, async (req, res) => {
    const body = parseInput(CvExportRequest, req.body);
    const { html, name } = await cvHtml(res, body);
    const cv = await render(html);
    const pdf = body.evidenceIds.length ? await withAnnex(res, name, cv, body.evidenceIds) : cv;
    logger.info(
      {
        event: "pdf_export",
        document: "cv",
        targeted: Boolean(body.generationId),
        variant: body.variant,
        langue: body.lang,
        justificatifs: body.evidenceIds.length,
      },
      "export",
    );
    sendPdf(res, pdf, `cv-${slug(name)}.pdf`);
  });

  // --- CV en ligne (ADR 0042) : instantané servi par un lien secret, non indexé, révocable, 90 jours. ---

  const SHARE_DAYS = 90;
  const shareDto = (row: ShareRow, url?: string) => ({
    id: row.id,
    generationId: row.generationId,
    offerTitle: row.offerTitle,
    ...(url ? { url } : {}),
    views: row.views,
    lastViewedAt: row.lastViewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  });

  app.post("/v1/shares", auth, user, async (req, res) => {
    accountOnly(res);
    const body = parseInput(CvShareCreate, req.body);
    const g = await verified(res, body.generationId);
    const { html } = await cvHtml(res, { ...body, evidenceIds: [] });
    const token = randomBytes(24).toString("base64url");
    const row = await store.createShare(me(res), {
      tokenHash: createHash("sha256").update(token).digest(),
      generationId: body.generationId,
      offerTitle: g.offerTitle,
      html,
      days: SHARE_DAYS,
    });
    logger.info({ event: "cv_partage", usages: body.norms, modele: body.variant }, "partage");
    res
      .status(201)
      .json(shareDto(row, new URL(`/cv-en-ligne/${token}`, deps.appBaseUrl ?? "http://localhost:8080").href));
  });

  app.get("/v1/shares", auth, user, async (_req, res) => {
    accountOnly(res);
    res.json((await store.shares(me(res))).map((row) => shareDto(row)));
  });

  app.delete("/v1/shares/:id", auth, user, async (req, res) => {
    accountOnly(res);
    if (!(await store.deleteShare(me(res), parseInput(IdParam, req.params).id)))
      throw notFound("Ce lien n'existe plus.");
    res.status(204).end();
  });

  // Lecture publique : sans compte, jamais indexée, document sans script ni ressource externe.
  app.get("/v1/public/cv/:token", async (req, res) => {
    const token = String(req.params.token ?? "");
    const html = /^[A-Za-z0-9_-]{20,64}$/.test(token)
      ? await store.viewShare(createHash("sha256").update(token).digest())
      : undefined;
    if (!html) throw new AppError("lien_invalide", 404, "Ce CV n'est plus partagé ou le lien est incorrect.");
    res
      .set("Cache-Control", "no-store")
      .set("X-Robots-Tag", "noindex, nofollow")
      .set("Referrer-Policy", "no-referrer")
      .set(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:",
      )
      .type("text/html")
      .send(html);
  });

  // Export Word (ADR 0037) : même contenu que le PDF, retouchable par un cabinet de recrutement.
  app.post("/v1/exports/cv/docx", auth, user, async (req, res) => {
    const body = parseInput(CvExportRequest, req.body);
    const { view, name } = await cvView(res, body);
    logger.info(
      { event: "docx_export", targeted: Boolean(body.generationId), langue: body.lang, usages: body.norms },
      "export",
    );
    res
      .set("Cache-Control", "no-store")
      .type("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      .attachment(`cv-${slug(name)}.docx`)
      .send(renderCvDocx(view));
  });

  app.post("/v1/exports/cv/preview", auth, user, async (req, res) => {
    const body = parseInput(CvExportRequest, req.body);
    const { html } = await cvHtml(res, body);
    // Aperçu affiché dans un iframe isolé (sandbox) : le document interdit déjà tout script.
    res
      .set("Cache-Control", "no-store")
      .set(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:",
      )
      .type("text/html")
      .send(html);
  });

  app.get("/v1/admin/stats", auth, requireRole("admin"), async (_req, res) => {
    logger.info({ event: "admin_acces", route: "/v1/admin/stats" }, "administration");
    res.json({
      service: "letters-export",
      votes: await store.voteStats(),
      counters: { ...(await store.stats()), rendersPending: pending },
      ...(llm instanceof BudgetedProvider && { llm: await llm.summary() }),
    });
  });

  // --- Interne --------------------------------------------------------------------------------------

  app.post("/internal/v1/reports/offers", auth, requireScope("reports:render"), async (req, res) => {
    const view = parseInput(OffersReport, req.body);
    sendPdf(res, await render(renderOffersReportHtml(view)), "offres.pdf");
  });

  app.post("/internal/v1/reports/gaps", auth, requireScope("reports:render"), async (req, res) => {
    const view = parseInput(GapsReport, req.body);
    sendPdf(res, await render(renderGapsReportHtml(view)), "points-a-ameliorer.pdf");
  });

  app.get("/internal/v1/users/:id/export", auth, requireScope("users:export"), async (req, res) => {
    const { id } = parseInput(UserParam, req.params);
    res.json({ service: "letters-export", data: await store.exportUser(id) });
  });

  app.delete("/internal/v1/users/:id", auth, requireScope("users:delete"), async (req, res) => {
    const { id } = parseInput(UserParam, req.params);
    const count = await store.deleteUser(id);
    logger.info({ event: "rgpd_effacement", count }, "rgpd");
    res.status(204).end();
  });
}
