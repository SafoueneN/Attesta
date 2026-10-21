import { createHash } from "node:crypto";
import type { IngestionSummary, WatchCriteria } from "@attesta/shared-schemas";
import type { MatchingDeps } from "./matching.js";
import { titlesFor } from "./matching.js";
import { SourceError } from "./sources/http.js";
import { RequestBudget, type JobSource, type SourceQuery } from "./types.js";

/** Offres demandées aux sources : publiées depuis 3 jours (marge si une exécution a manqué). */
export const SINCE_DAYS = 3;
const EMBED_BATCH = 64;

export interface IngestionDeps extends MatchingDeps {
  /** Requêtes par jour et par source (Adzuna : 250 au plus selon ses conditions). */
  dailyRequestLimits: Record<string, number>;
}

const keyOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Requêtes à lancer : une par source, intitulé (dans la langue de la source), ville et rayon, sans doublon. */
export async function ingestionQueries(deps: IngestionDeps, criteria: WatchCriteria[]) {
  const queries = new Map<string, { source: JobSource; query: SourceQuery }>();
  for (const c of criteria) {
    const titles = await titlesFor(deps.esco, c.occupations, deps.logger);
    for (const source of deps.sources.filter((s) => (s.countries as readonly string[]).includes(c.country))) {
      for (const occupation of c.country === "DE" ? titles.de : titles.fr) {
        const query: SourceQuery = {
          country: c.country,
          occupation,
          city: c.city,
          radiusKm: c.radiusKm,
          sinceDays: SINCE_DAYS,
        };
        queries.set(keyOf([source.id, query]), { source, query });
      }
    }
  }
  return [...queries.values()];
}

/** Vectorise les offres qui ne le sont pas encore, par lots. */
export async function embedPending(deps: Pick<MatchingDeps, "repo" | "embeddings">): Promise<number> {
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
 * Collecte du jour pour un ensemble de critères (docs/adr/0007) : budgets journaliers partagés par toutes
 * les requêtes d'une source ; une source en erreur est journalisée sans interrompre les autres. Idempotent :
 * une offre déjà stockée (même source ou même empreinte) n'est pas dupliquée.
 */
export async function ingest(
  deps: IngestionDeps,
  criteria: WatchCriteria[],
  date: string,
): Promise<IngestionSummary> {
  const summary: IngestionSummary = { sources: {}, embedded: 0 };
  const budgets = new Map<string, RequestBudget>();
  for (const source of deps.sources) {
    const used = await deps.repo.requestsToday(source.id, date);
    budgets.set(source.id, new RequestBudget(Math.max(0, (deps.dailyRequestLimits[source.id] ?? 0) - used)));
  }
  for (const { source, query } of await ingestionQueries(deps, criteria)) {
    const stats = (summary.sources[source.id] ??= {
      requests: 0,
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      errors: 0,
    });
    const budget = budgets.get(source.id)!;
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
      // Format inattendu (Zod) ou source en erreur : journalisé sans contenu ni URL (clé d'API possible).
      deps.logger.error(
        {
          event: "ingestion_erreur",
          source: source.id,
          errorType: (error as Error).name,
          status: error instanceof SourceError ? error.status : undefined,
        },
        "source en erreur",
      );
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
  summary.embedded = await embedPending(deps);
  return summary;
}
