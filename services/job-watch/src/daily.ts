import type { Logger } from "@attesta/logger";
import type { MatchedPosting, OffersReport } from "@attesta/shared-schemas";
import { skillGaps, type SkillGap } from "./gaps.js";
import { dailyReportMessage, MailError, type Mailer } from "./mail.js";
import type { SubscriptionRow, WatchStore } from "./store.js";
import type { Upstreams } from "./upstreams.js";

export interface DailyDeps {
  store: WatchStore;
  upstreams: Upstreams;
  mailer: Mailer;
  logger: Logger;
  /** Adresse publique : pages du frontend et API (même origine). */
  appBaseUrl: string;
}

export type SubscriptionOutcome =
  | { status: "envoye"; offers: number; degraded: boolean }
  | { status: "deja-envoye" | "aucune-offre" | "sans-profil" | "compte-inactif" };

const frDate = (iso: string) => iso.split("-").reverse().join("/");
const percent = (v: number | null) => (v === null ? null : Math.round(v * 100));

export function criteriaLabel(s: Pick<SubscriptionRow, "occupations" | "city" | "radiusKm" | "workingTime">) {
  const time = { indifferent: undefined, plein: "temps plein", partiel: "temps partiel" }[s.workingTime];
  return [s.occupations.join(", "), `${s.city} (${s.radiusKm} km)`, time].filter(Boolean).join(" · ");
}

function gapSalary(gap: SkillGap): string {
  if (gap.salary.status === "insuffisant") return "données insuffisantes";
  const k = (n: number) => `${Math.round(n / 1000)} k€`;
  const [low, high] = gap.salary.rangeWith;
  return `offres qui la demandent associées à ${k(low)}–${k(high)} brut/an (médiane ${k(gap.salary.medianWith)}, autres offres ${k(gap.salary.medianWithout)} ; ${gap.salary.sample} offres avec salaire)`;
}

const criteriaOf = (s: SubscriptionRow) => ({
  occupations: s.occupations,
  country: s.country,
  city: s.city,
  lat: s.lat,
  lon: s.lon,
  radiusKm: s.radiusKm,
  workingTime: s.workingTime,
});

function offersView(
  date: string,
  criteria: string,
  postings: MatchedPosting[],
  degraded: boolean,
): OffersReport {
  return {
    date: frDate(date),
    criteria,
    degraded,
    offers: postings.map((m) => ({
      title: m.posting.title,
      company: m.posting.company,
      city: m.posting.city,
      postedAt: frDate(m.posting.postedAt),
      url: m.posting.url,
      source: m.posting.source,
      attribution: m.posting.attribution,
      pertinence: m.rerankScore,
      similarity: percent(m.similarity),
      coverage: percent(m.coverage),
      location: percent(m.locationScore),
      missingSkills: m.missingSkills,
    })),
  };
}

/**
 * Un abonné : profil (jobs-matching l'anonymise), classement en excluant les offres déjà envoyées, rapports
 * PDF (letters-export), puis un seul e-mail par jour. Jamais d'e-mail vide.
 */
export async function processSubscription(
  deps: DailyDeps,
  s: SubscriptionRow,
  date: string,
): Promise<SubscriptionOutcome> {
  const { store, upstreams } = deps;
  if (await store.deliveredToday(s.id, date)) return { status: "deja-envoye" };
  const contact = await upstreams.contact(s.userId);
  if (!contact || contact.status !== "active") return { status: "compte-inactif" };
  const profile = await upstreams.profile(s.userId);
  if (!profile) return { status: "sans-profil" };

  const result = await upstreams.match({
    profile: profile.profile,
    criteria: criteriaOf(s),
    excludePostingIds: await store.sentPostingIds(s.id, date),
    date,
  });
  if (result.postings.length === 0) return { status: "aucune-offre" };
  await store.saveMatches(s.id, date, result.postings);

  const criteria = criteriaLabel(s);
  const recent = await store.recentMatches(s.id, date);
  const gaps = skillGaps(recent, result.profileSkills);
  const [offersPdf, gapsPdf] = await Promise.all([
    upstreams.offersReport(offersView(date, criteria, result.postings, result.degraded)),
    upstreams.gapsReport({
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
  ]);

  const delivery = await store.claimDelivery(s.id, date, result.postings.length);
  if (!delivery) return { status: "deja-envoye" };
  let messageId: string;
  try {
    ({ messageId } = await deps.mailer.send(
      dailyReportMessage({
        to: contact.email,
        deliveryId: delivery,
        date: frDate(date),
        offers: result.postings.map((m) => ({
          title: m.posting.title,
          company: m.posting.company,
          url: m.posting.url,
        })),
        unsubscribeUrl: new URL(`/veille/desabonner/${s.unsubscribeToken}`, deps.appBaseUrl).href,
        oneClickUrl: new URL(`/api/watch/v1/subscriptions/unsubscribe/${s.unsubscribeToken}`, deps.appBaseUrl)
          .href,
        attachments: [
          { filename: `offres-${date}.pdf`, content: offersPdf, contentType: "application/pdf" },
          { filename: `points-a-ameliorer-${date}.pdf`, content: gapsPdf, contentType: "application/pdf" },
        ],
      }),
    ));
  } catch (error) {
    // Message certainement pas parti : réservation levée, la relance réessaiera. Sinon, au plus un envoi.
    if (error instanceof MailError && error.notSent) await store.releaseDelivery(delivery);
    throw error;
  }
  await store.completeDelivery(delivery, messageId);
  return { status: "envoye", offers: result.postings.length, degraded: result.degraded };
}

/**
 * Exécution quotidienne (docs/adr/0010), sous verrou : collecte du jour pour tous les critères actifs, puis
 * un traitement par abonné, avec une relance en cas d'échec. Une relance le même jour est idempotente (un
 * envoi par abonné et par jour, une offre stockée une fois).
 */
export async function runDaily(deps: DailyDeps, date: string, trigger: "planifiee" | "manuelle") {
  return deps.store.withRunLock(async () => {
    const runId = await deps.store.startRun(date, trigger);
    const summary: Record<string, unknown> = { abonnes: {} as Record<string, number>, echecs: 0 };
    const outcomes = summary.abonnes as Record<string, number>;
    try {
      const subscriptions = await deps.store.activeSubscriptions();
      if (subscriptions.length) {
        try {
          summary.collecte = await deps.upstreams.ingest(subscriptions.map(criteriaOf), date);
        } catch (error) {
          // Sans collecte du jour, le classement porte sur les offres déjà stockées.
          deps.logger.error({ event: "collecte_echec", errorType: (error as Error)?.name }, "veille");
          summary.collecte = "echec";
        }
      }
      for (const s of subscriptions) {
        let outcome: SubscriptionOutcome | undefined;
        for (let attempt = 1; attempt <= 2 && !outcome; attempt++) {
          try {
            outcome = await processSubscription(deps, s, date);
          } catch (error) {
            deps.logger.warn({ event: "abonne_echec", attempt, errorType: (error as Error)?.name }, "veille");
          }
        }
        if (outcome) outcomes[outcome.status] = (outcomes[outcome.status] ?? 0) + 1;
        else summary.echecs = (summary.echecs as number) + 1;
      }
      // Taux de plaintes sur 30 jours : au-delà de 0,1 %, alerte (journal ERROR).
      const { sent, complaints } = await deps.store.complaintRate();
      const rate = sent ? complaints / sent : 0;
      summary.tauxPlaintes = rate;
      deps.logger[rate > 0.001 ? "error" : "info"](
        { event: "taux_plaintes", rate, sent, complaints },
        "veille",
      );
      return summary;
    } finally {
      await deps.store.finishRun(runId, summary);
      deps.logger.info({ event: "veille_terminee", ...summary }, "veille");
    }
  });
}

/** Date du jour à Paris (AAAA-MM-JJ) et heure locale, pour la planification. */
export function parisNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** Planification locale : une exécution par jour, à l'heure dite (heure de Paris), vérifiée chaque minute. */
export function startScheduler(deps: DailyDeps, hour: number) {
  const tick = async () => {
    const { date, hour: current } = parisNow();
    if (current !== hour || (await deps.store.ranToday(date, "planifiee"))) return;
    await runDaily(deps, date, "planifiee");
  };
  const timer = setInterval(() => {
    tick().catch((error) =>
      deps.logger.error({ event: "planification_echec", errorType: error?.name }, "veille"),
    );
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
