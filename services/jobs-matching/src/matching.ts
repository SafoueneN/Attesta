import type { Logger } from "@attesta/logger";
import type { LlmProvider } from "@attesta/llm-client";
import type { MatchedPosting, MatchRequest, MatchResponse } from "@attesta/shared-schemas";
import { matchingProfile, type MatchingProfile } from "./anonymize.js";
import type { EmbeddingProvider } from "./embeddings.js";
import { searchTitles, type EscoClient } from "./esco.js";
import { mentions, technicalTerms } from "./postings-text.js";
import { locationScore, reciprocalRankFusion } from "./ranking.js";
import { RERANK_MAX_POSTINGS, rerankPostings } from "./rerank.js";
import { websearchQuery, type JobsRepository, type StoredPosting } from "./repository.js";
import type { JobSource } from "./types.js";

/** Offres présentées dans le rapport quotidien. */
export const REPORT_OFFERS = 10;
/** En dessous de cette pertinence (rerank réussi), l'offre n'est pas proposée. */
export const MIN_PERTINENCE = 20;
const MAX_MISSING = 5;
/** Plafond de coût du rerank d'un abonné, en USD. */
const RERANK_MAX_COST_USD = 0.2;

export interface MatchingDeps {
  repo: JobsRepository;
  embeddings: EmbeddingProvider;
  esco?: EscoClient;
  llm?: LlmProvider;
  sources: JobSource[];
  logger: Logger;
}

/** Intitulés en français et en allemand (pivot ESCO) ; en cas de panne d'ESCO, la saisie seule. */
export async function titlesFor(esco: EscoClient | undefined, occupations: string[], logger: Logger) {
  const found = [];
  if (esco) {
    for (const title of occupations) {
      try {
        found.push(...(await esco.occupations(title, "fr")));
      } catch (error) {
        logger.warn({ event: "esco_indisponible", errorType: (error as Error).name }, "esco");
      }
    }
  }
  return { fr: searchTitles(occupations, found, "fr"), de: searchTitles(occupations, found, "de") };
}

/** Compétences de l'offre absentes du profil, sans modèle (mode dégradé et complément du rerank). */
export function deterministicMissing(
  posting: Pick<StoredPosting, "title" | "body" | "lang">,
  profile: MatchingProfile,
) {
  return technicalTerms(`${posting.title}\n${posting.body}`, posting.lang).filter(
    (term) => !mentions(profile.corpus, term),
  );
}

/** Part des termes techniques de l'offre présents dans le profil ; null si l'offre n'en cite aucun. */
export function coverage(posting: Pick<StoredPosting, "title" | "body" | "lang">, profile: MatchingProfile) {
  const terms = technicalTerms(`${posting.title}\n${posting.body}`, posting.lang);
  if (terms.length === 0) return null;
  return terms.filter((t) => mentions(profile.corpus, t)).length / terms.length;
}

const sourceName = (source: string) =>
  source === "ba" ? "Bundesagentur für Arbeit" : source === "adzuna" ? "Adzuna" : source;

export function toJobPosting(p: StoredPosting, sources: JobSource[]) {
  const attribution = sources.find((s) => s.id === p.source)?.attribution ?? null;
  return {
    id: p.id,
    source: sourceName(p.source),
    title: p.title,
    company: p.company,
    city: p.city,
    country: p.country,
    postedAt: p.postedAt,
    url: p.url,
    excerpt: p.body.slice(0, 400),
    salaryMinEur: p.salaryMinEur,
    salaryMaxEur: p.salaryMaxEur,
    attribution,
  };
}

/**
 * Classement des offres pour un profil (docs/adr/0007) : rappel lexical et vectoriel fusionnés par rang
 * (RRF), puis rerank LLM du top 20 et compétences manquantes vérifiées dans l'offre. Le profil est anonymisé
 * avant tout calcul. Toute panne du modèle aboutit au classement de l'étage de rappel (mode dégradé).
 */
export async function matchPostings(deps: MatchingDeps, request: MatchRequest): Promise<MatchResponse> {
  const { criteria, date, excludePostingIds } = request;
  const profile = matchingProfile(request.profile);
  const titles = await titlesFor(deps.esco, criteria.occupations, deps.logger);
  const skills = profile.skills.slice(0, 20);
  const [vector] = await deps.embeddings.embed([profile.text]);
  const [lexical, semantic] = await Promise.all([
    deps.repo.lexicalCandidates(criteria, date, excludePostingIds, {
      fr: websearchQuery([...titles.fr, ...skills]),
      de: websearchQuery([...titles.de, ...skills]),
    }),
    deps.repo.vectorCandidates(criteria, date, excludePostingIds, vector!, deps.embeddings.minSimilarity),
  ]);
  const fused = reciprocalRankFusion([lexical, semantic.map((c) => c.id)]).slice(0, RERANK_MAX_POSTINGS);
  if (fused.length === 0) return { degraded: false, postings: [], profileSkills: profile.skills };

  const similarity = new Map(semantic.map((c) => [c.id, c.similarity]));
  const rrf = new Map(fused.map((f) => [f.id, f.score]));
  const postings = await deps.repo.postings(fused.map((f) => f.id));

  let reranked: Awaited<ReturnType<typeof rerankPostings>> | undefined;
  if (deps.llm) {
    try {
      reranked = await rerankPostings(
        { provider: deps.llm, maxCostUsd: RERANK_MAX_COST_USD },
        {
          profileText: profile.text,
          profileCorpus: profile.corpus,
          postings: postings.map((p) => ({ id: p.id, title: p.title, body: p.body })),
        },
      );
    } catch (error) {
      // Erreur inattendue : le classement de l'étage de rappel suffit, la veille continue.
      deps.logger.error({ event: "rerank_erreur", errorType: (error as Error)?.name }, "rerank");
      reranked = { status: "degraded", reason: "indisponible", usage: [] };
    }
  }
  const degraded = reranked?.status !== "ok";
  if (reranked?.status === "degraded") {
    deps.logger.warn({ event: "rerank_degrade", reason: reranked.reason }, "classement sans IA");
  }
  const byId = new Map(reranked?.status === "ok" ? reranked.postings.map((r) => [r.id, r]) : []);

  const ranked = postings
    .map((p, index) => {
      const llm = byId.get(p.id);
      const missing = [...new Set([...(llm?.missingSkills ?? []), ...deterministicMissing(p, profile)])];
      return { posting: p, index, score: llm?.score ?? null, missing: missing.slice(0, MAX_MISSING) };
    })
    .filter((r) => degraded || r.score === null || r.score >= MIN_PERTINENCE)
    .sort((a, b) => (degraded ? 0 : (b.score ?? -1) - (a.score ?? -1)) || a.index - b.index)
    .slice(0, REPORT_OFFERS);

  const matched: MatchedPosting[] = ranked.map((r, i) => ({
    posting: toJobPosting(r.posting, deps.sources),
    rank: i + 1,
    rrfScore: rrf.get(r.posting.id)!,
    similarity: similarity.get(r.posting.id) ?? null,
    coverage: coverage(r.posting, profile),
    locationScore: locationScore(criteria, r.posting, criteria.radiusKm),
    rerankScore: r.score,
    missingSkills: r.missing,
  }));
  return { degraded, postings: matched, profileSkills: profile.skills };
}
