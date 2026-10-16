import { Profile } from "@attesta/schema";
import { rerankPostings, RERANK_MAX_POSTINGS, type LlmProvider, type LlmUsage } from "@attesta/llm";
import {
  renderGapsReportHtml,
  renderOffersReportHtml,
  type PdfRenderer,
  type ReportOffer,
} from "@attesta/render";
import type { Logger } from "@attesta/shared";
import { matchingProfile, type MatchingProfile } from "./anonymize.js";
import type { EmbeddingProvider } from "./embeddings.js";
import { searchTitles, type EscoClient } from "./esco.js";
import { skillGaps, type SkillGap } from "./gaps.js";
import { dailyReportMessage, MailError, type Mailer } from "./mail.js";
import { locationScore, reciprocalRankFusion } from "./ranking.js";
import {
  websearchQuery,
  type ActiveSubscription,
  type JobwatchRepository,
  type MatchRow,
  type StoredPosting,
} from "./repository.js";
import { mentions, technicalTerms } from "./text.js";
import type { JobSource } from "./types.js";

/** Offres présentées dans le rapport 1. */
export const REPORT_OFFERS = 10;
/** En dessous de cette pertinence (rerank réussi), l'offre n'est pas proposée. */
export const MIN_PERTINENCE = 20;
const MAX_MISSING = 5;

export interface MatchingDeps {
  repo: JobwatchRepository;
  embeddings: EmbeddingProvider;
  esco?: EscoClient;
  llm?: { provider: LlmProvider; maxCostUsd: number; onUsage?: (usage: LlmUsage) => void };
  renderer: PdfRenderer;
  mailer: Mailer;
  sources: JobSource[];
  /** URL publique de l'application, pour les liens des e-mails. */
  baseUrl: string;
  logger: Logger;
}

export type SubscriptionOutcome =
  | { status: "envoye"; offers: number; degraded: boolean }
  | { status: "deja-envoye" | "aucune-offre" | "inactif" };

const frDate = (iso: string) => iso.split("-").reverse().join("/");

export function criteriaLabel(
  s: Pick<ActiveSubscription, "occupations" | "city" | "radiusKm" | "workingTime">,
) {
  const time = { indifferent: undefined, plein: "temps plein", partiel: "temps partiel" }[s.workingTime];
  return [s.occupations.join(", "), `${s.city} (${s.radiusKm} km)`, time].filter(Boolean).join(" · ");
}

/** Intitulés en français et en allemand (pivot ESCO), en cas de panne d'ESCO : la saisie seule. */
export async function subscriptionTitles(
  esco: EscoClient | undefined,
  occupations: string[],
  logger: Logger,
) {
  const found = [];
  if (esco) {
    for (const title of occupations) {
      try {
        found.push(...(await esco.occupations(title, "fr")));
      } catch (error) {
        logger.warn({ errorType: (error as Error).name }, "esco: rapprochement impossible, saisie seule");
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

const percent = (v: number | null) => (v === null ? null : Math.round(v * 100));

function gapSalary(gap: SkillGap): string {
  if (gap.salary.status === "insuffisant") return "données insuffisantes";
  const k = (n: number) => `${Math.round(n / 1000)} k€`;
  const [low, high] = gap.salary.rangeWith;
  return `offres qui la demandent associées à ${k(low)}–${k(high)} brut/an (médiane ${k(gap.salary.medianWith)}, autres offres ${k(gap.salary.medianWithout)} ; ${gap.salary.sample} offres avec salaire)`;
}

export async function processSubscription(
  deps: MatchingDeps,
  subscriptionId: string,
  date: string,
): Promise<SubscriptionOutcome> {
  const s = await deps.repo.subscription(subscriptionId);
  if (!s) return { status: "inactif" };
  if (await deps.repo.deliveredToday(s.id, date)) return { status: "deja-envoye" };

  const profile = matchingProfile(Profile.parse(s.profile));
  const titles = await subscriptionTitles(deps.esco, s.occupations, deps.logger);
  const skills = profile.skills.slice(0, 20);
  const [vector] = await deps.embeddings.embed([profile.text]);
  const [lexical, semantic] = await Promise.all([
    deps.repo.lexicalCandidates(s, date, {
      fr: websearchQuery([...titles.fr, ...skills]),
      de: websearchQuery([...titles.de, ...skills]),
    }),
    deps.repo.vectorCandidates(s, date, vector!, deps.embeddings.minSimilarity),
  ]);
  // Rappel : un candidat doit être trouvé par la recherche lexicale, ou être
  // proche du profil au sens des vecteurs. Les deux listes sont fusionnées par rang.
  const fused = reciprocalRankFusion([lexical, semantic.map((c) => c.id)]).slice(0, RERANK_MAX_POSTINGS);
  if (fused.length === 0) return { status: "aucune-offre" };

  const similarity = new Map(semantic.map((c) => [c.id, c.similarity]));
  const postings = await deps.repo.postings(fused.map((f) => f.id));
  const rrf = new Map(fused.map((f) => [f.id, f.score]));

  const reranked = deps.llm
    ? await rerankPostings(deps.llm, {
        profileText: profile.text,
        profileCorpus: profile.corpus,
        postings: postings.map((p) => ({ id: p.id, title: p.title, body: p.body })),
      })
    : undefined;
  const degraded = reranked?.status !== "ok";
  if (reranked?.status === "degraded") {
    deps.logger.warn({ event: "rerank_degrade", reason: reranked.reason }, "veille: classement sans IA");
  }
  const llmById = new Map(reranked?.status === "ok" ? reranked.postings.map((r) => [r.id, r]) : []);

  const ranked = postings
    .map((p, index) => {
      const llm = llmById.get(p.id);
      const missing = [...new Set([...(llm?.missingSkills ?? []), ...deterministicMissing(p, profile)])];
      return {
        posting: p,
        index,
        score: llm?.score ?? null,
        missing: missing.slice(0, MAX_MISSING),
      };
    })
    .filter((r) => degraded || r.score === null || r.score >= MIN_PERTINENCE)
    .sort((a, b) => (degraded ? 0 : (b.score ?? -1) - (a.score ?? -1)) || a.index - b.index)
    .slice(0, REPORT_OFFERS);
  if (ranked.length === 0) return { status: "aucune-offre" };

  const matches: MatchRow[] = ranked.map((r, i) => ({
    postingId: r.posting.id,
    rank: i + 1,
    rrfScore: rrf.get(r.posting.id)!,
    similarity: similarity.get(r.posting.id) ?? null,
    coverage: coverage(r.posting, profile),
    locationScore: locationScore(s, r.posting, s.radiusKm),
    rerankScore: r.score,
    missingSkills: r.missing,
  }));
  await deps.repo.saveMatches(s.id, date, matches);

  const attribution = new Map(deps.sources.map((src) => [src.id, src.attribution ?? null]));
  const offers: ReportOffer[] = ranked.map((r, i) => ({
    title: r.posting.title,
    company: r.posting.company,
    city: r.posting.city,
    postedAt: frDate(r.posting.postedAt),
    url: r.posting.url,
    source: r.posting.source === "ba" ? "Bundesagentur für Arbeit" : r.posting.source,
    attribution: attribution.get(r.posting.source) ?? null,
    pertinence: r.score,
    similarity: percent(matches[i]!.similarity),
    coverage: percent(matches[i]!.coverage),
    location: percent(matches[i]!.locationScore),
    missingSkills: r.missing,
  }));
  const criteria = criteriaLabel(s);
  const recent = await deps.repo.recentMatches(s.id, date);
  const gaps = skillGaps(recent, profile.skills);

  const [offersPdf, gapsPdf] = await Promise.all([
    deps.renderer.render(renderOffersReportHtml({ date: frDate(date), criteria, offers, degraded })),
    deps.renderer.render(
      renderGapsReportHtml({
        date: frDate(date),
        criteria,
        basis: recent.length,
        gaps: gaps.map((g) => ({
          skill: g.skill,
          count: g.count,
          frequency: Math.round(g.frequency * 100),
          salary: gapSalary(g),
          effort: g.effort === 0.25 ? "faible" : "moyen",
          priority: g.priority,
        })),
      }),
    ),
  ]);

  const delivery = await deps.repo.claimDelivery(s.id, date, offers.length);
  if (!delivery) return { status: "deja-envoye" };
  let messageId: string;
  try {
    ({ messageId } = await deps.mailer.send(
      dailyReportMessage({
        to: s.email,
        deliveryId: delivery,
        date: frDate(date),
        offers: offers.map((o) => ({ title: o.title, company: o.company, url: o.url })),
        unsubscribeUrl: new URL(`/veille/desabonner/${s.unsubscribeToken}`, deps.baseUrl).href,
        attachments: [
          { filename: `offres-${date}.pdf`, content: offersPdf, contentType: "application/pdf" },
          { filename: `points-a-ameliorer-${date}.pdf`, content: gapsPdf, contentType: "application/pdf" },
        ],
      }),
    ));
  } catch (error) {
    // Message certainement pas parti : la réservation est levée, la relance réessaiera.
    // Sinon (délai, coupure pendant la transmission), elle reste : au plus un envoi.
    if (error instanceof MailError && error.notSent) await deps.repo.releaseDelivery(delivery);
    throw error;
  }
  await deps.repo.completeDelivery(delivery, messageId);
  return { status: "envoye", offers: offers.length, degraded };
}
