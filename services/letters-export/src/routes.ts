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
  CvExportRequest,
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
} from "@attesta/shared-schemas";
import type { Express, Response } from "express";
import { z } from "zod";
import { demoLetter, draftLetter, prompts, verifiedLines } from "./letters.js";
import {
  longFrenchDate,
  renderCvHtml,
  renderGapsReportHtml,
  renderLetterHtml,
  renderOffersReportHtml,
  viewFromProfile,
  viewFromTailored,
  type PdfRenderer,
} from "./render/index.js";
import type { LetterRow, LetterStore } from "./store.js";
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
}

const UserParam = z.object({ id: z.string().regex(/^(guest_)?[0-9a-f-]{36}$/i, "Identifiant invalide") });

const pdfResponse = { description: "Document PDF (application/pdf)" };

export const operations: Operation[] = [
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
  async function cvHtml(res: Response, body: z.infer<typeof CvExportRequest>) {
    if (body.generationId) {
      const g = await verified(res, body.generationId);
      return {
        html: renderCvHtml(viewFromTailored(g.profile, g.cv!), { variant: body.variant }),
        name: g.profile.basics.name,
      };
    }
    const stored = await upstreams.profile(token(res));
    if (!stored)
      throw new AppError("profil_absent", 409, "Enregistrez d'abord votre profil pour l'exporter.");
    return {
      html: renderCvHtml(viewFromProfile(stored.profile), { variant: body.variant }),
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
    const pdf = await render(html);
    logger.info(
      { event: "pdf_export", document: "cv", targeted: Boolean(body.generationId), variant: body.variant },
      "export",
    );
    sendPdf(res, pdf, `cv-${slug(name)}.pdf`);
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
