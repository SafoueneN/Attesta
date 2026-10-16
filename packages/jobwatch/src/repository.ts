import type { Pool, PoolClient } from "pg";
import type { Occupation } from "./esco.js";
import { postingFingerprint } from "./text.js";
import type { Country, Posting, SourceRunStats, WorkingTime } from "./types.js";
import { toPgVector } from "./embeddings.js";

/**
 * Accès SQL de la veille (ADR 0004 : SQL explicite, sans ORM). Les recherches
 * lexicale et vectorielle sont deux requêtes distinctes, fusionnées par RRF dans
 * le code (ranking.ts) : chacune reste lisible et testable.
 */

/** Fenêtre de fraîcheur : une offre plus ancienne n'est plus proposée. */
export const FRESHNESS_DAYS = 14;
/** Candidats retenus par chaque recherche avant fusion. */
export const RECALL_LIMIT = 100;

export interface ActiveSubscription {
  id: string;
  email: string;
  occupations: string[];
  country: Country;
  city: string;
  lat: number;
  lon: number;
  radiusKm: number;
  workingTime: "indifferent" | WorkingTime;
  unsubscribeToken: string;
  profile: unknown;
}

export interface StoredPosting {
  id: string;
  source: string;
  title: string;
  company: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  lang: string;
  postedAt: string;
  url: string;
  body: string;
  salaryMinEur: number | null;
  salaryMaxEur: number | null;
}

export interface MatchRow {
  postingId: string;
  rank: number;
  rrfScore: number;
  similarity: number | null;
  coverage: number | null;
  locationScore: number | null;
  rerankScore: number | null;
  missingSkills: string[];
}

/** Filtres durs communs aux deux recherches : pays, fraîcheur, rayon, temps de travail, déjà envoyé. */
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
  AND NOT EXISTS (
    SELECT 1 FROM match_result m
    WHERE m.subscription_id = $8 AND m.posting_id = p.id AND m.run_date < $2::date
      -- Seules les offres effectivement envoyées (ou dont l'envoi a pu partir) sont exclues.
      AND EXISTS (SELECT 1 FROM email_delivery d
      WHERE d.subscription_id = m.subscription_id AND d.run_date = m.run_date)
  )`;

const filterParams = (s: ActiveSubscription, date: string) => [
  s.country,
  date,
  s.lat,
  s.lon,
  s.radiusKm,
  s.city,
  s.workingTime,
  s.id,
];

/** Expression de recherche « websearch » : termes entre guillemets reliés par OR. */
export function websearchQuery(terms: string[]): string {
  return terms
    .map((t) => t.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((t) => `"${t}"`)
    .join(" OR ");
}

export class JobwatchRepository {
  constructor(private readonly pool: Pool) {}

  // --- Ingestion ---------------------------------------------------------------

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

  // --- ESCO ----------------------------------------------------------------------

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

  // --- Abonnés -------------------------------------------------------------------

  /** Abonnements actifs ; avec `id`, celui-là seulement (s'il est toujours actif). */
  async activeSubscriptions(id?: string): Promise<ActiveSubscription[]> {
    const { rows } = await this.pool.query<ActiveSubscription>(
      `SELECT s.id, u.email, s.occupations, s.country, s.city, s.lat, s.lon, s.radius_km AS "radiusKm",
         s.working_time AS "workingTime", s.unsubscribe_token AS "unsubscribeToken", v.data AS profile
       FROM watch_subscription s
       JOIN app_user u ON u.id = s.user_id
       JOIN profile_version v ON v.id = s.profile_version_id
       WHERE s.status = 'active' AND ($1::uuid IS NULL OR s.id = $1)
       ORDER BY s.created_at`,
      [id ?? null],
    );
    return rows;
  }

  async subscription(id: string): Promise<ActiveSubscription | undefined> {
    return (await this.activeSubscriptions(id))[0];
  }

  async lexicalCandidates(
    s: ActiveSubscription,
    date: string,
    queries: { fr: string; de: string },
  ): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT p.id FROM job_posting p,
         (SELECT websearch_to_tsquery('french', $9) || websearch_to_tsquery('german', $10) AS q) query
       WHERE p.tsv @@ query.q AND ${HARD_FILTERS}
       ORDER BY ts_rank_cd(p.tsv, query.q) DESC, p.posted_at DESC, p.id
       LIMIT ${RECALL_LIMIT}`,
      [...filterParams(s, date), queries.fr, queries.de],
    );
    return rows.map((r) => r.id);
  }

  async vectorCandidates(
    s: ActiveSubscription,
    date: string,
    vector: number[],
    minSimilarity: number,
  ): Promise<{ id: string; similarity: number }[]> {
    const client = await this.pool.connect();
    try {
      // pgvector ≥ 0.8 : l'index HNSW poursuit la recherche tant que les filtres
      // écartent des candidats (sinon, moins de résultats que demandé).
      await client.query("BEGIN");
      await client.query("SET LOCAL hnsw.iterative_scan = relaxed_order");
      const { rows } = await client.query<{ id: string; similarity: number }>(
        `SELECT p.id, 1 - (e.embedding <=> $9) AS similarity
         FROM job_embedding e JOIN job_posting p ON p.id = e.posting_id
         WHERE ${HARD_FILTERS} AND 1 - (e.embedding <=> $9) >= $10
         ORDER BY e.embedding <=> $9, p.id
         LIMIT ${RECALL_LIMIT}`,
        [...filterParams(s, date), toPgVector(vector), minSimilarity],
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
      `SELECT id, source, title, company, city, lat, lon, lang, to_char(posted_at, 'YYYY-MM-DD') AS "postedAt",
         url, body, salary_min_eur AS "salaryMinEur", salary_max_eur AS "salaryMaxEur"
       FROM job_posting WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((p): p is StoredPosting => Boolean(p));
  }

  /**
   * Résultats du jour. Remplace ceux d'une tentative précédente du même jour, et
   * ceux des jours sans envoi (SMTP en panne, rendu en échec) : une offre jamais
   * envoyée reste proposable, et le classement est toujours celui de l'envoi.
   */
  async saveMatches(subscriptionId: string, date: string, matches: MatchRow[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM match_result m WHERE m.subscription_id = $1
           AND (m.run_date = $2::date OR NOT EXISTS (SELECT 1 FROM email_delivery d
      WHERE d.subscription_id = m.subscription_id AND d.run_date = m.run_date))`,
        [subscriptionId, date],
      );
      for (const m of matches) await this.insertMatch(client, subscriptionId, date, m);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertMatch(client: PoolClient, subscriptionId: string, date: string, m: MatchRow) {
    await client.query(
      `INSERT INTO match_result (subscription_id, posting_id, run_date, rank, rrf_score, similarity,
         coverage, location_score, rerank_score, missing_skills)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        subscriptionId,
        m.postingId,
        date,
        m.rank,
        m.rrfScore,
        m.similarity,
        m.coverage,
        m.locationScore,
        m.rerankScore,
        JSON.stringify(m.missingSkills),
      ],
    );
  }

  /** Offres retenues sur 30 jours : base du rapport 2. */
  async recentMatches(subscriptionId: string, date: string) {
    const { rows } = await this.pool.query<{
      missingSkills: string[];
      salaryMinEur: number | null;
      salaryMaxEur: number | null;
    }>(
      `SELECT m.missing_skills AS "missingSkills", p.salary_min_eur AS "salaryMinEur",
         p.salary_max_eur AS "salaryMaxEur"
       FROM match_result m JOIN job_posting p ON p.id = m.posting_id
       WHERE m.subscription_id = $1 AND m.run_date > $2::date - 30 AND m.run_date <= $2::date
         AND (m.run_date = $2::date OR EXISTS (SELECT 1 FROM email_delivery d
      WHERE d.subscription_id = m.subscription_id AND d.run_date = m.run_date))`,
      [subscriptionId, date],
    );
    return rows;
  }

  // --- Envoi ---------------------------------------------------------------------

  /**
   * Réserve l'envoi du jour. Faux si un envoi existe déjà (réussi ou interrompu) :
   * un abonné ne reçoit jamais deux fois le rapport d'un même jour.
   */
  async claimDelivery(subscriptionId: string, date: string, offers: number): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO email_delivery (subscription_id, run_date, offers, status)
       VALUES ($1, $2, $3, 'en_cours') ON CONFLICT (subscription_id, run_date) DO NOTHING RETURNING id`,
      [subscriptionId, date, offers],
    );
    return rows[0]?.id;
  }

  async completeDelivery(id: string, messageId: string) {
    await this.pool.query(
      "UPDATE email_delivery SET status = 'envoye', provider_message_id = $2, sent_at = now() WHERE id = $1",
      [id, messageId],
    );
  }

  /** Échec certain de l'envoi (refus du serveur SMTP) : la réservation est levée pour la relance. */
  async releaseDelivery(id: string) {
    await this.pool.query("DELETE FROM email_delivery WHERE id = $1 AND status = 'en_cours'", [id]);
  }

  async deliveredToday(subscriptionId: string, date: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "SELECT 1 FROM email_delivery WHERE subscription_id = $1 AND run_date = $2",
      [subscriptionId, date],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Taux de plaintes sur 30 jours (seuil d'alerte : 0,1 %). */
  async complaintRate(): Promise<{ sent: number; complaints: number }> {
    const { rows } = await this.pool.query<{ sent: number; complaints: number }>(
      `SELECT
         (SELECT count(*)::int FROM email_delivery WHERE sent_at > now() - interval '30 days'
            AND status <> 'en_cours') AS sent,
         (SELECT count(*)::int FROM email_event WHERE event = 'plainte' AND at > now() - interval '30 days')
           AS complaints`,
    );
    return rows[0]!;
  }

  // --- Rétention -------------------------------------------------------------------

  /** Purge quotidienne (docs/conformite.md, « Conservation »). */
  async purge(): Promise<Record<string, number>> {
    const statements: Record<string, string> = {
      offres: "DELETE FROM job_posting WHERE posted_at < current_date - 60",
      comptesInactifs: "DELETE FROM app_user WHERE last_active_at < now() - interval '18 months'",
      liensDeConnexion: "DELETE FROM login_token WHERE expires_at < now()",
      veillesNonConfirmees: `DELETE FROM watch_subscription
        WHERE status = 'en_attente' AND (confirm_expires_at IS NULL OR confirm_expires_at < now())`,
      evenementsEmail: "DELETE FROM email_event WHERE at < now() - interval '13 months'",
      journalIngestion: "DELETE FROM job_source_run WHERE started_at < now() - interval '13 months'",
      cacheEsco: "DELETE FROM esco_cache WHERE fetched_at < now() - interval '30 days'",
    };
    const counts: Record<string, number> = {};
    for (const [name, sql] of Object.entries(statements)) {
      counts[name] = (await this.pool.query(sql)).rowCount ?? 0;
    }
    return counts;
  }
}
