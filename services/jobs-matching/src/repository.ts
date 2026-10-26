import type { OfferAnalysis, WatchCriteria } from "@attesta/shared-schemas";
import type pg from "pg";
import { toPgVector } from "./embeddings.js";
import type { Occupation } from "./esco.js";
import { postingFingerprint } from "./postings-text.js";
import type { Country, Posting, SourceRunStats } from "./types.js";

/**
 * Accès SQL du service (ADR 0004 : SQL explicite, sans ORM). Les recherches lexicale et vectorielle sont
 * deux requêtes distinctes, fusionnées par RRF dans le code (ranking.ts).
 */

/** Fenêtre de fraîcheur : une offre plus ancienne n'est plus proposée. */
export const FRESHNESS_DAYS = 14;
/** Candidats retenus par chaque recherche avant fusion. */
export const RECALL_LIMIT = 100;

export interface StoredPosting {
  id: string;
  source: string;
  title: string;
  company: string | null;
  city: string | null;
  country: Country;
  lat: number | null;
  lon: number | null;
  lang: string;
  postedAt: string;
  url: string;
  body: string;
  salaryMinEur: number | null;
  salaryMaxEur: number | null;
}

export interface OfferRow {
  id: string;
  rawText: string;
  sourceUrl: string | null;
  postingId: string | null;
  analysis: OfferAnalysis;
  providerKind: "ia" | "demo";
  createdAt: Date;
}

/** Filtres durs communs aux deux recherches : pays, fraîcheur, rayon, temps de travail, déjà envoyées. */
const HARD_FILTERS = `
  p.country = $1
  AND p.posted_at >= $2::date - ${FRESHNESS_DAYS}
  AND (
    (p.lat IS NOT NULL AND 2 * 6371 * asin(sqrt(
      sin(radians(p.lat - $3) / 2) ^ 2 +
      cos(radians($3)) * cos(radians(p.lat)) * sin(radians(p.lon - $4) / 2) ^ 2
    )) <= $5)
    OR (p.lat IS NULL AND lower(p.city) = lower($6))
  )
  AND ($7 = 'indifferent' OR p.working_time IS NULL OR p.working_time = $7)
  AND NOT (p.id = ANY($8::uuid[]))`;

const filterParams = (c: WatchCriteria, date: string, exclude: string[]) => [
  c.country,
  date,
  c.lat,
  c.lon,
  c.radiusKm,
  c.city,
  c.workingTime,
  exclude,
];

const POSTING_COLUMNS = `id, source, title, company, city, country, lat, lon, lang,
  to_char(posted_at, 'YYYY-MM-DD') AS "postedAt", url, body,
  salary_min_eur AS "salaryMinEur", salary_max_eur AS "salaryMaxEur"`;

const OFFER_COLUMNS = `id, raw_text AS "rawText", source_url AS "sourceUrl", posting_id AS "postingId",
  analysis, provider_kind AS "providerKind", created_at AS "createdAt"`;

/** Expression de recherche « websearch » : termes entre guillemets reliés par OR. */
export function websearchQuery(terms: string[]): string {
  return terms
    .map((t) => t.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((t) => `"${t}"`)
    .join(" OR ");
}

export class JobsRepository {
  constructor(private readonly pool: pg.Pool) {}

  // --- Offres des candidats -----------------------------------------------------------------------

  async createOffer(
    userId: string,
    input: { rawText: string; sourceUrl?: string; postingId?: string },
    analysis: OfferAnalysis,
    providerKind: "ia" | "demo",
    promptVersion: string,
  ): Promise<OfferRow> {
    const { rows } = await this.pool.query<OfferRow>(
      `INSERT INTO user_offer (user_id, raw_text, source_url, posting_id, analysis, provider_kind, prompt_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${OFFER_COLUMNS}`,
      [
        userId,
        input.rawText,
        input.sourceUrl ?? null,
        input.postingId ?? null,
        JSON.stringify(analysis),
        providerKind,
        promptVersion,
      ],
    );
    return rows[0]!;
  }

  async offer(userId: string, id: string): Promise<OfferRow | undefined> {
    const { rows } = await this.pool.query<OfferRow>(
      `SELECT ${OFFER_COLUMNS} FROM user_offer WHERE user_id = $1 AND id = $2`,
      [userId, id],
    );
    return rows[0];
  }

  async offers(userId: string): Promise<OfferRow[]> {
    const { rows } = await this.pool.query<OfferRow>(
      `SELECT ${OFFER_COLUMNS} FROM user_offer WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId],
    );
    return rows;
  }

  async deleteOffer(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query("DELETE FROM user_offer WHERE user_id = $1 AND id = $2", [
      userId,
      id,
    ]);
    return (rowCount ?? 0) > 0;
  }

  async deleteUser(userId: string): Promise<number> {
    const { rowCount } = await this.pool.query("DELETE FROM user_offer WHERE user_id = $1", [userId]);
    return rowCount ?? 0;
  }

  async exportUser(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT raw_text, source_url, analysis, created_at FROM user_offer WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    );
    return { offres: rows };
  }

  // --- Ingestion ----------------------------------------------------------------------------------

  async requestsToday(source: string, date: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      "SELECT coalesce(sum(requests), 0)::int AS n FROM job_source_run WHERE source = $1 AND run_date = $2",
      [source, date],
    );
    return rows[0]!.n;
  }

  async startSourceRun(source: string, date: string): Promise<number> {
    const { rows } = await this.pool.query<{ id: number }>(
      "INSERT INTO job_source_run (source, run_date) VALUES ($1, $2) RETURNING id",
      [source, date],
    );
    return rows[0]!.id;
  }

  async finishSourceRun(id: number, stats: SourceRunStats & { inserted: number; duplicates: number }) {
    await this.pool.query(
      `UPDATE job_source_run SET finished_at = now(), requests = $2, fetched = $3, inserted = $4,
         duplicates = $5, errors = $6 WHERE id = $1`,
      [id, stats.requests, stats.fetched, stats.inserted, stats.duplicates, stats.errors],
    );
  }

  async isKnown(source: string, externalId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "SELECT 1 FROM job_posting WHERE source = $1 AND external_id = $2",
      [source, externalId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Vrai si l'offre est nouvelle ; faux si elle existe déjà (même source ou même empreinte). */
  async insertPosting(p: Posting): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO job_posting (source, external_id, title, company, city, country, lat, lon, lang,
         working_time, posted_at, url, body, salary_min_eur, salary_max_eur, fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT DO NOTHING`,
      [
        p.source,
        p.externalId,
        p.title,
        p.company,
        p.city,
        p.country,
        p.lat,
        p.lon,
        p.lang,
        p.workingTime,
        p.postedAt,
        p.url,
        p.body,
        p.salaryMinEur,
        p.salaryMaxEur,
        postingFingerprint(p),
      ],
    );
    return (rowCount ?? 0) > 0;
  }

  async postingsWithoutEmbedding(limit: number): Promise<{ id: string; text: string }[]> {
    const { rows } = await this.pool.query<{ id: string; text: string }>(
      `SELECT p.id, p.title || E'\\n' || p.body AS text FROM job_posting p
       WHERE NOT EXISTS (SELECT 1 FROM job_embedding e WHERE e.posting_id = p.id)
       ORDER BY p.fetched_at LIMIT $1`,
      [limit],
    );
    return rows;
  }

  async saveEmbeddings(items: { id: string; vector: number[] }[], model: string) {
    for (const { id, vector } of items) {
      await this.pool.query(
        `INSERT INTO job_embedding (posting_id, embedding, model) VALUES ($1, $2, $3)
         ON CONFLICT (posting_id) DO UPDATE SET embedding = EXCLUDED.embedding, model = EXCLUDED.model`,
        [id, toPgVector(vector), model],
      );
    }
  }

  escoCache() {
    return {
      get: async (key: string) => {
        const { rows } = await this.pool.query<{ result: Occupation[] }>(
          "SELECT result FROM esco_cache WHERE query = $1 AND fetched_at > now() - interval '30 days'",
          [key],
        );
        return rows[0]?.result;
      },
      set: async (key: string, value: Occupation[]) => {
        await this.pool.query(
          `INSERT INTO esco_cache (query, result) VALUES ($1, $2)
           ON CONFLICT (query) DO UPDATE SET result = EXCLUDED.result, fetched_at = now()`,
          [key, JSON.stringify(value)],
        );
      },
    };
  }

  // --- Classement ---------------------------------------------------------------------------------

  async lexicalCandidates(
    c: WatchCriteria,
    date: string,
    exclude: string[],
    queries: { fr: string; de: string; en: string },
  ): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT p.id FROM job_posting p,
         (SELECT websearch_to_tsquery('french', $9) || websearch_to_tsquery('german', $10)
            || websearch_to_tsquery('english', $11) AS q) query
       WHERE p.tsv @@ query.q AND ${HARD_FILTERS}
       ORDER BY ts_rank_cd(p.tsv, query.q) DESC, p.posted_at DESC, p.id
       LIMIT ${RECALL_LIMIT}`,
      [...filterParams(c, date, exclude), queries.fr, queries.de, queries.en],
    );
    return rows.map((r) => r.id);
  }

  async vectorCandidates(
    c: WatchCriteria,
    date: string,
    exclude: string[],
    vector: number[],
    minSimilarity: number,
  ): Promise<{ id: string; similarity: number }[]> {
    const client = await this.pool.connect();
    try {
      // pgvector ≥ 0.8 : l'index HNSW poursuit la recherche tant que les filtres écartent des candidats.
      await client.query("BEGIN");
      await client.query("SET LOCAL hnsw.iterative_scan = relaxed_order");
      const { rows } = await client.query<{ id: string; similarity: number }>(
        `SELECT p.id, 1 - (e.embedding <=> $9) AS similarity
         FROM job_embedding e JOIN job_posting p ON p.id = e.posting_id
         WHERE ${HARD_FILTERS} AND 1 - (e.embedding <=> $9) >= $10
         ORDER BY e.embedding <=> $9, p.id
         LIMIT ${RECALL_LIMIT}`,
        [...filterParams(c, date, exclude), toPgVector(vector), minSimilarity],
      );
      await client.query("COMMIT");
      return rows;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async postings(ids: string[]): Promise<StoredPosting[]> {
    const { rows } = await this.pool.query<StoredPosting>(
      `SELECT ${POSTING_COLUMNS} FROM job_posting WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((p): p is StoredPosting => Boolean(p));
  }

  /** Recherche publique dans les offres collectées encore fraîches (60 jours au plus). */
  async searchPostings(filters: {
    q?: string;
    country?: string;
    limit: number;
    offset?: number;
  }): Promise<StoredPosting[]> {
    const { rows } = await this.pool.query<StoredPosting>(
      `SELECT ${POSTING_COLUMNS} FROM job_posting p
       WHERE ($1::text IS NULL OR p.country = $1)
         AND ($2::text IS NULL OR p.tsv @@ (websearch_to_tsquery('french', $2) || websearch_to_tsquery('german', $2)
           || websearch_to_tsquery('english', $2)))
       ORDER BY p.posted_at DESC, p.id LIMIT $3 OFFSET $4`,
      [filters.country ?? null, filters.q || null, filters.limit, filters.offset ?? 0],
    );
    return rows;
  }

  /** Offres consultables par pays (60 jours, comme la recherche) et date de la dernière offre collectée. */
  async overview(): Promise<{
    countries: { country: Country; count: number }[];
    lastFetchedAt: Date | null;
  }> {
    const { rows } = await this.pool.query<{ country: Country; count: number; last: Date | null }>(
      `SELECT country, count(*)::int AS count, max(fetched_at) AS last FROM job_posting
       WHERE posted_at >= current_date - 60 GROUP BY country ORDER BY count DESC`,
    );
    const last = rows.reduce<Date | null>((m, r) => (r.last && (!m || r.last > m) ? r.last : m), null);
    return { countries: rows.map(({ country, count }) => ({ country, count })), lastFetchedAt: last };
  }

  // --- Administration et rétention -----------------------------------------------------------------

  async stats() {
    const { rows } = await this.pool.query<Record<string, number>>(
      `SELECT
         (SELECT count(*) FROM job_posting)::int AS postings,
         (SELECT count(*) FROM job_embedding)::int AS embeddings,
         (SELECT count(*) FROM user_offer)::int AS offers,
         (SELECT count(*) FROM job_source_run WHERE started_at > now() - interval '7 days')::int AS "sourceRuns7d",
         (SELECT coalesce(sum(errors), 0) FROM job_source_run WHERE started_at > now() - interval '7 days')::int
           AS "sourceErrors7d"`,
    );
    return rows[0]!;
  }

  /** Avis anonyme (ADR 0029, point 2) : aucun identifiant ni contenu n'est enregistré. */
  async vote(role: string, vote: 1 | -1, providerKind: "ia" | "demo"): Promise<void> {
    await this.pool.query("INSERT INTO assistant_vote (role, vote, provider_kind) VALUES ($1, $2, $3)", [
      role,
      vote,
      providerKind,
    ]);
  }

  /** Avis des 30 derniers jours, par rôle. */
  async voteStats() {
    const { rows } = await this.pool.query<{ role: string; up: number; down: number }>(
      `SELECT role, count(*) FILTER (WHERE vote = 1)::int AS up, count(*) FILTER (WHERE vote = -1)::int AS down
       FROM assistant_vote WHERE at > now() - interval '30 days' GROUP BY role ORDER BY role`,
    );
    return rows;
  }

  /** Purge quotidienne : offres collectées de 60 jours, invités de 24 h, journaux de 13 mois, cache ESCO. */
  async purge(): Promise<Record<string, number>> {
    const statements: Record<string, string> = {
      offres: "DELETE FROM job_posting WHERE posted_at < current_date - 60",
      avis: "DELETE FROM assistant_vote WHERE at < now() - interval '13 months'",
      invites: `DELETE FROM user_offer WHERE user_id LIKE 'guest\\_%' AND created_at < now() - interval '24 hours'`,
      journalIngestion: "DELETE FROM job_source_run WHERE started_at < now() - interval '13 months'",
      cacheEsco: "DELETE FROM esco_cache WHERE fetched_at < now() - interval '30 days'",
      usageLlm: "DELETE FROM llm_usage WHERE at < now() - interval '13 months'",
    };
    const counts: Record<string, number> = {};
    for (const [name, sql] of Object.entries(statements)) {
      counts[name] = (await this.pool.query(sql)).rowCount ?? 0;
    }
    return counts;
  }
}
