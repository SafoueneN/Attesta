import {
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
  City,
  Country,
  IdParam,
  IngestionRequest,
  IngestionSummary,
  JobOfferInput,
  JobPosting,
  MatchRequest,
  MatchResponse,
  OfferSummary,
  PostingSearch,
  ServiceStats,
  StoredOffer,
  UserExport,
} from "@attesta/shared-schemas";
import type { Express, Response } from "express";
import { z } from "zod";
import { analyseOffer, demoAnalysis, prompts, toOfferAnalysis } from "./analysis.js";
import { findCity, suggestCities } from "./geo.js";
import { ingest, type IngestionDeps } from "./ingestion.js";
import { matchPostings, toJobPosting } from "./matching.js";
import type { OfferRow } from "./repository.js";

export interface RouteDeps extends IngestionDeps {
  verifier: TokenVerifier;
  logger: Logger;
  llm?: BudgetedProvider | LlmProvider;
}

const UserParam = z.object({ id: z.string().regex(/^(guest_)?[0-9a-f-]{36}$/i, "Identifiant invalide") });
const CityQuery = z.object({ country: Country, q: z.string().trim().max(100) });
const CityResolve = z.object({ country: Country, name: z.string().trim().min(1).max(100) });

export const operations: Operation[] = [
  {
    method: "post",
    path: "/v1/offers",
    operationId: "enregistrerOffre",
    summary: "Enregistre une offre collée et l'analyse (exigences, mots-clés)",
    tags: ["offres"],
    auth: true,
    body: JobOfferInput,
    responses: {
      201: { description: "Offre analysée", schema: StoredOffer },
      400: { description: "Offre invalide" },
    },
  },
  {
    method: "post",
    path: "/v1/offers/from-posting/{id}",
    operationId: "reprendreOffreCollectee",
    summary: "Reprend une offre collectée comme offre visée",
    tags: ["offres"],
    auth: true,
    responses: {
      201: { description: "Offre analysée", schema: StoredOffer },
      404: { description: "Offre inconnue" },
    },
  },
  {
    method: "get",
    path: "/v1/offers",
    operationId: "mesOffres",
    summary: "Offres enregistrées par l'utilisateur, des plus récentes aux plus anciennes",
    tags: ["offres"],
    auth: true,
    responses: { 200: { description: "Offres", schema: z.array(OfferSummary) } },
  },
  {
    method: "get",
    path: "/v1/offers/{id}",
    operationId: "uneOffre",
    summary: "Une offre et son analyse",
    tags: ["offres"],
    auth: true,
    responses: { 200: { description: "Offre", schema: StoredOffer }, 404: { description: "Offre inconnue" } },
  },
  {
    method: "delete",
    path: "/v1/offers/{id}",
    operationId: "supprimerOffre",
    summary: "Supprime une offre",
    tags: ["offres"],
    auth: true,
    responses: { 204: { description: "Supprimée" }, 404: { description: "Offre inconnue" } },
  },
  {
    method: "get",
    path: "/v1/postings",
    operationId: "offresCollectees",
    summary: "Recherche dans les offres collectées auprès des sources publiques",
    tags: ["offres collectées"],
    auth: true,
    responses: { 200: { description: "Offres", schema: z.array(JobPosting) } },
  },
  {
    method: "get",
    path: "/v1/cities",
    operationId: "villes",
    summary: "Suggestions de villes de plus de 15 000 habitants (GeoNames)",
    tags: ["référentiel"],
    auth: true,
    responses: { 200: { description: "Villes", schema: z.array(City) } },
  },
  {
    method: "get",
    path: "/v1/admin/stats",
    operationId: "statistiquesOffres",
    summary: "Compteurs de collecte et consommation du LLM, sans donnée personnelle",
    tags: ["administration"],
    auth: true,
    responses: { 200: { description: "Statistiques", schema: ServiceStats } },
  },
  {
    method: "get",
    path: "/internal/v1/offers/{id}",
    operationId: "offreInterne",
    summary: "Offre et analyse pour la génération (jeton relayé)",
    tags: ["interne"],
    auth: true,
    responses: { 200: { description: "Offre", schema: StoredOffer }, 404: { description: "Offre inconnue" } },
  },
  {
    method: "get",
    path: "/internal/v1/cities/resolve",
    operationId: "resoudreVille",
    summary: "Coordonnées d'une ville du référentiel (jeton relayé)",
    tags: ["interne"],
    auth: true,
    responses: { 200: { description: "Ville", schema: City }, 404: { description: "Ville inconnue" } },
  },
  {
    method: "post",
    path: "/internal/v1/ingestion",
    operationId: "collecte",
    summary: "Collecte du jour pour des critères de veille (jeton de service matching:run)",
    tags: ["interne"],
    auth: true,
    body: IngestionRequest,
    responses: { 200: { description: "Bilan", schema: IngestionSummary } },
  },
  {
    method: "post",
    path: "/internal/v1/matching",
    operationId: "classement",
    summary: "Classement des offres pour un profil (jeton de service matching:run)",
    tags: ["interne"],
    auth: true,
    body: MatchRequest,
    responses: { 200: { description: "Offres classées", schema: MatchResponse } },
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
    summary: "Efface les offres d'un utilisateur, idempotent (users:delete)",
    tags: ["interne"],
    auth: true,
    responses: { 204: { description: "Effacé" } },
  },
];

const toDto = (row: OfferRow) => ({
  id: row.id,
  title: row.analysis.title,
  company: row.analysis.company ?? null,
  createdAt: row.createdAt.toISOString(),
  sourceUrl: row.sourceUrl,
  rawText: row.rawText,
  analysis: row.analysis,
  providerKind: row.providerKind,
  postingId: row.postingId,
});

export function registerRoutes(app: Express, deps: RouteDeps): void {
  const { repo, verifier, logger, llm } = deps;
  const auth = authenticate(verifier);
  const user = requireRole("candidate", "admin", "guest");
  const me = (res: Response) => principalOf(res).sub;

  /**
   * Analyse par le modèle ; en cas de panne, de refus ou de budget atteint, analyse sans IA (mode dégradé,
   * signalé par `providerKind`) : l'offre reste utilisable.
   */
  async function analysed(text: string) {
    if (llm) {
      try {
        return { analysis: await analyseOffer(llm, text), providerKind: llm.kind };
      } catch (error) {
        logger.warn({ event: "analyse_degradee", errorType: (error as Error)?.name }, "analyse d'offre");
      }
    }
    return { analysis: toOfferAnalysis(demoAnalysis(text)), providerKind: "demo" as const };
  }

  async function createOffer(
    res: Response,
    input: { rawText: string; sourceUrl?: string; postingId?: string },
  ) {
    const { analysis, providerKind } = await analysed(input.rawText);
    const row = await repo.createOffer(
      me(res),
      input,
      analysis,
      providerKind,
      prompts.signature("analyse-offre"),
    );
    logger.info({ event: "offre_analysee", keywords: analysis.keywords.length, providerKind }, "offres");
    res.status(201).json(toDto(row));
  }

  app.post("/v1/offers", auth, user, async (req, res) => {
    const input = parseInput(JobOfferInput, req.body);
    await createOffer(res, input);
  });

  app.post("/v1/offers/from-posting/:id", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    const [posting] = await repo.postings([id]);
    if (!posting) throw notFound("Cette offre collectée n'existe plus.");
    const rawText = [posting.title, posting.company, posting.city, "", posting.body]
      .filter((l) => l !== null)
      .join("\n")
      .slice(0, 20_000);
    await createOffer(res, {
      rawText: rawText.padEnd(50, " "),
      sourceUrl: posting.url,
      postingId: posting.id,
    });
  });

  app.get("/v1/offers", auth, user, async (_req, res) => {
    const rows = await repo.offers(me(res));
    res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.analysis.title,
        company: r.analysis.company ?? null,
        createdAt: r.createdAt.toISOString(),
        keywords: r.analysis.keywords.length,
      })),
    );
  });

  const ownOffer = async (res: Response, id: string) => {
    const row = await repo.offer(me(res), id);
    if (!row) throw notFound("Offre introuvable.");
    return toDto(row);
  };

  app.get("/v1/offers/:id", auth, user, async (req, res) => {
    res.json(await ownOffer(res, parseInput(IdParam, req.params).id));
  });

  app.delete("/v1/offers/:id", auth, user, async (req, res) => {
    const { id } = parseInput(IdParam, req.params);
    if (!(await repo.deleteOffer(me(res), id))) throw notFound("Offre introuvable.");
    res.status(204).end();
  });

  app.get("/v1/postings", auth, user, async (req, res) => {
    const filters = parseInput(PostingSearch, req.query);
    const rows = await repo.searchPostings(filters);
    res.json(rows.map((p) => toJobPosting(p, deps.sources)));
  });

  const city = (c: { nom: string; pays: "DE" | "FR"; lat: number; lon: number }) => ({
    nom: c.nom,
    pays: c.pays,
    lat: c.lat,
    lon: c.lon,
  });

  app.get("/v1/cities", auth, user, (req, res) => {
    const { country, q } = parseInput(CityQuery, req.query);
    res.set("Cache-Control", "private, max-age=3600").json(suggestCities(q, country).map(city));
  });

  app.get("/v1/admin/stats", auth, requireRole("admin"), async (_req, res) => {
    logger.info({ event: "admin_acces", route: "/v1/admin/stats" }, "administration");
    res.json({
      service: "jobs-matching",
      counters: await repo.stats(),
      ...(llm instanceof BudgetedProvider && { llm: await llm.summary() }),
    });
  });

  // --- Interne ------------------------------------------------------------------------------------

  app.get("/internal/v1/offers/:id", auth, user, async (req, res) => {
    res.json(await ownOffer(res, parseInput(IdParam, req.params).id));
  });

  app.get("/internal/v1/cities/resolve", auth, user, (req, res) => {
    const { country, name } = parseInput(CityResolve, req.query);
    const found = findCity(name, country);
    if (!found) throw notFound("Ville introuvable dans ce pays.");
    res.json(city(found));
  });

  app.post("/internal/v1/ingestion", auth, requireScope("matching:run"), async (req, res) => {
    const { criteria, date } = parseInput(IngestionRequest, req.body);
    const summary = await ingest(deps, criteria, date);
    logger.info({ event: "collecte", ...summary }, "collecte");
    res.json(summary);
  });

  app.post("/internal/v1/matching", auth, requireScope("matching:run"), async (req, res) => {
    const request = parseInput(MatchRequest, req.body);
    const result = await matchPostings(deps, request);
    logger.info(
      { event: "classement", offers: result.postings.length, degraded: result.degraded },
      "classement",
    );
    res.json(result);
  });

  app.get("/internal/v1/users/:id/export", auth, requireScope("users:export"), async (req, res) => {
    const { id } = parseInput(UserParam, req.params);
    res.json({ service: "jobs-matching", data: await repo.exportUser(id) });
  });

  app.delete("/internal/v1/users/:id", auth, requireScope("users:delete"), async (req, res) => {
    const { id } = parseInput(UserParam, req.params);
    const count = await repo.deleteUser(id);
    logger.info({ event: "rgpd_effacement", count }, "rgpd");
    res.status(204).end();
  });
}
