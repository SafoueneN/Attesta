import { createHash } from "node:crypto";
import type { PgBoss } from "pg-boss";
import { SourceError } from "./sources/http.js";
import { processSubscription, subscriptionTitles, type MatchingDeps } from "./matching.js";
import { RequestBudget, type JobSource, type SourceQuery } from "./types.js";

/**
 * Exécution quotidienne de la veille (docs/adr/0010), lancée par Cloud Scheduler
 * (un Cloud Run Job) ou à la main en local. Les jobs passent par pg-boss : relances
 * avec attente croissante, un seul job en file par clé. L'idempotence d'une
 * relance le même jour est garantie par la base (une offre stockée une fois, un
 * envoi par abonné et par jour).
 */

export const QUEUES = { ingestion: "veille-ingestion", subscriber: "veille-abonne" } as const;
export const RETRY_LIMIT = 2;
/** Offres demandées aux sources : publiées depuis 3 jours (marge si une exécution a manqué). */
export const SINCE_DAYS = 3;
const EMBED_BATCH = 64;

export interface DailyDeps extends MatchingDeps {
  boss: PgBoss;
  /** Requêtes par jour et par source (Adzuna : 250 au plus selon ses conditions). */
  dailyRequestLimits: Record<string, number>;
  /** Attente avant la première relance d'un job en échec (doublée à chaque relance). */
  retryDelaySeconds?: number;
}

export interface DailySummary {
  date: string;
  ingestion: Record<
    string,
    { requests: number; fetched: number; inserted: number; duplicates: number; errors: number }
  >;
  embedded: number;
  subscribers: Record<string, number>;
  failedJobs: number;
}

interface IngestionJob {
  source: string;
  query: SourceQuery;
}

const keyOf = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

/** Requêtes à lancer : une par source, intitulé (dans la langue de la source), ville et rayon. */
export async function ingestionJobs(deps: DailyDeps): Promise<IngestionJob[]> {
  const jobs = new Map<string, IngestionJob>();
  for (const s of await deps.repo.activeSubscriptions()) {
    const titles = await subscriptionTitles(deps.esco, s.occupations, deps.logger);
    for (const source of deps.sources.filter((src) => src.countries.includes(s.country))) {
      for (const occupation of s.country === "DE" ? titles.de : titles.fr) {
        const query: SourceQuery = {
          country: s.country,
          occupation,
          city: s.city,
          radiusKm: s.radiusKm,
          sinceDays: SINCE_DAYS,
        };
        jobs.set(keyOf([source.id, query]), { source: source.id, query });
      }
    }
  }
  return [...jobs.values()];
}

async function ingest(
  deps: DailyDeps,
  source: JobSource,
  query: SourceQuery,
  budget: RequestBudget,
  date: string,
  summary: DailySummary,
) {
  const stats = (summary.ingestion[source.id] ??= {
    requests: 0,
    fetched: 0,
    inserted: 0,
    duplicates: 0,
    errors: 0,
  });
  const runId = await deps.repo.startSourceRun(source.id, date);
  const before = budget.spent;
  const run = { fetched: 0, inserted: 0, duplicates: 0, errors: 0 };
  try {
    for await (const posting of source.search(query, {
      isKnown: (id) => deps.repo.isKnown(source.id, id),
      onSkip: () => run.errors++,
      budget,
    })) {
      run.fetched++;
      if (await deps.repo.insertPosting(posting)) run.inserted++;
      else run.duplicates++;
    }
  } catch (error) {
    run.errors++;
    // Format inattendu (Zod) ou source en erreur : journalisé sans contenu ni URL.
    deps.logger.error(
      {
        event: "ingestion_erreur",
        source: source.id,
        errorType: (error as Error).name,
        status: error instanceof SourceError ? error.status : undefined,
      },
      "veille: source en erreur",
    );
    throw error;
  } finally {
    const requests = budget.spent - before;
    await deps.repo.finishSourceRun(runId, { requests, ...run });
    stats.requests += requests;
    stats.fetched += run.fetched;
    stats.inserted += run.inserted;
    stats.duplicates += run.duplicates;
    stats.errors += run.errors;
  }
}

/** Vectorise les offres qui ne le sont pas encore, par lots. */
export async function embedPending(deps: Pick<DailyDeps, "repo" | "embeddings">): Promise<number> {
  let total = 0;
  for (;;) {
    const batch = await deps.repo.postingsWithoutEmbedding(EMBED_BATCH);
    if (batch.length === 0) return total;
    const vectors = await deps.embeddings.embed(batch.map((p) => p.text));
    await deps.repo.saveEmbeddings(
      batch.map((p, i) => ({ id: p.id, vector: vectors[i]! })),
      deps.embeddings.model,
    );
    total += batch.length;
  }
}

/**
 * Envoie les jobs d'une file et les traite jusqu'au dernier. Un job en échec après
 * toutes ses relances est compté, sans interrompre les autres.
 */
async function runQueue<T extends object>(
  boss: PgBoss,
  name: string,
  items: { key: string; data: T }[],
  handler: (data: T) => Promise<void>,
  options: { concurrency: number; retryDelaySeconds: number },
): Promise<number> {
  if (!(await boss.getQueue(name))) await boss.createQueue(name, { policy: "short" });
  const pending = new Set<string>();
  let failed = 0;
  let settle: () => void = () => {};
  const done = new Promise<void>((resolve) => (settle = resolve));
  const finish = (id: string) => {
    pending.delete(id);
    if (pending.size === 0) settle();
  };

  for (const item of items) {
    // Clé unique : un job déjà en file pour la même clé (autre exécution) n'est pas dupliqué.
    const id = await boss.send(name, item.data, {
      singletonKey: item.key,
      retryLimit: RETRY_LIMIT,
      retryDelay: options.retryDelaySeconds,
      retryBackoff: true,
      expireInSeconds: 15 * 60,
    });
    if (id) pending.add(id);
  }
  if (pending.size === 0) return 0;

  await boss.work<T>(
    name,
    { localConcurrency: options.concurrency, pollingIntervalSeconds: 1 },
    async ([job]) => {
      if (!job) return;
      try {
        await handler(job.data);
        finish(job.id);
      } catch (error) {
        if (job.retryCount >= RETRY_LIMIT) {
          failed++;
          finish(job.id);
        }
        throw error;
      }
    },
  );
  await done;
  await boss.offWork(name);
  return failed;
}

export async function runDaily(deps: DailyDeps, date: string): Promise<DailySummary> {
  const summary: DailySummary = { date, ingestion: {}, embedded: 0, subscribers: {}, failedJobs: 0 };
  const retryDelaySeconds = deps.retryDelaySeconds ?? 20;

  // 1. Ingestion : budgets journaliers partagés par toutes les requêtes d'une source.
  const budgets = new Map<string, RequestBudget>();
  for (const source of deps.sources) {
    const limit = deps.dailyRequestLimits[source.id] ?? 0;
    const used = await deps.repo.requestsToday(source.id, date);
    budgets.set(source.id, new RequestBudget(Math.max(0, limit - used)));
  }
  const sources = new Map(deps.sources.map((s) => [s.id, s]));
  const jobs = await ingestionJobs(deps);
  summary.failedJobs += await runQueue(
    deps.boss,
    QUEUES.ingestion,
    jobs.map((job) => ({ key: `${date}:${keyOf(job)}`, data: job })),
    (job) => ingest(deps, sources.get(job.source)!, job.query, budgets.get(job.source)!, date, summary),
    { concurrency: 1, retryDelaySeconds },
  );

  // 2. Vecteurs des nouvelles offres.
  summary.embedded = await embedPending(deps);

  // 3. Un job par abonné : matching, rapports, envoi (au plus un e-mail par jour).
  const subscribers = await deps.repo.activeSubscriptions();
  summary.failedJobs += await runQueue(
    deps.boss,
    QUEUES.subscriber,
    subscribers.map((s) => ({ key: `${date}:${s.id}`, data: { id: s.id } })),
    async ({ id }) => {
      const outcome = await processSubscription(deps, id, date);
      summary.subscribers[outcome.status] = (summary.subscribers[outcome.status] ?? 0) + 1;
    },
    { concurrency: 2, retryDelaySeconds },
  );

  // 4. Taux de plaintes sur 30 jours : au-delà de 0,1 %, alerte (journal ERROR).
  const { sent, complaints } = await deps.repo.complaintRate();
  const rate = sent ? complaints / sent : 0;
  deps.logger[rate > 0.001 ? "error" : "info"](
    { event: "taux_plaintes", rate, sent, complaints },
    rate > 0.001 ? "veille: taux de plaintes au-delà de 0,1 %" : "veille: taux de plaintes",
  );
  return summary;
}
