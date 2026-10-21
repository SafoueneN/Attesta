import { createHmac, randomBytes } from "node:crypto";
import type {
  FaithfulnessReport,
  OfferAnalysis,
  Profile,
  RemovedLine,
  TailoredCv,
} from "@attesta/shared-schemas";
import type pg from "pg";

export interface GenerationRow {
  id: string;
  offerId: string;
  offerTitle: string;
  offerText: string;
  analysis: OfferAnalysis | null;
  profileVersion: number | null;
  profile: Profile;
  status: "ok" | "degraded";
  degradedReason: string | null;
  cv: TailoredCv | null;
  report: FaithfulnessReport | null;
  removed: RemovedLine[];
  edited: string[];
  revision: number;
  providerKind: "ia" | "demo";
  model: string;
  pipelineVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NewGeneration = Omit<GenerationRow, "id" | "revision" | "createdAt" | "updatedAt" | "edited"> & {
  costUsd: number;
};

const COLUMNS = `id, offer_id AS "offerId", offer_title AS "offerTitle", offer_text AS "offerText", analysis,
  profile_version AS "profileVersion", profile, status, degraded_reason AS "degradedReason", cv, report, removed,
  edited, revision, provider_kind AS "providerKind", model, pipeline_version AS "pipelineVersion",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));

export class GenerationStore {
  constructor(private readonly pool: pg.Pool) {}

  async create(userId: string, g: NewGeneration): Promise<GenerationRow> {
    const { rows } = await this.pool.query<GenerationRow>(
      `INSERT INTO generation (user_id, offer_id, offer_title, offer_text, analysis, profile_version, profile, status,
         degraded_reason, cv, report, removed, provider_kind, model, pipeline_version, cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING ${COLUMNS}`,
      [
        userId,
        g.offerId,
        g.offerTitle,
        g.offerText,
        json(g.analysis),
        g.profileVersion,
        json(g.profile),
        g.status,
        g.degradedReason,
        json(g.cv),
        json(g.report),
        json(g.removed),
        g.providerKind,
        g.model,
        g.pipelineVersion,
        g.costUsd,
      ],
    );
    return rows[0]!;
  }

  async get(userId: string, id: string): Promise<GenerationRow | undefined> {
    const { rows } = await this.pool.query<GenerationRow>(
      `SELECT ${COLUMNS} FROM generation WHERE user_id = $1 AND id = $2`,
      [userId, id],
    );
    return rows[0];
  }

  async list(userId: string) {
    const { rows } = await this.pool.query<{
      id: string;
      offerTitle: string;
      createdAt: Date;
      status: "ok" | "degraded";
      score: number | null;
      providerKind: "ia" | "demo";
    }>(
      `SELECT id, offer_title AS "offerTitle", created_at AS "createdAt", status,
         (report->>'score')::float8 AS score, provider_kind AS "providerKind"
       FROM generation WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId],
    );
    return rows;
  }

  /**
   * Corrections enregistrées si la révision n'a pas changé depuis la lecture : deux onglets ne s'écrasent
   * pas (le second reçoit un conflit). Renvoie `undefined` en cas de conflit.
   */
  async saveCorrections(
    userId: string,
    id: string,
    revision: number,
    update: { cv: TailoredCv; report: FaithfulnessReport; edited: string[] },
  ): Promise<GenerationRow | undefined> {
    const { rows } = await this.pool.query<GenerationRow>(
      `UPDATE generation SET cv = $4, report = $5, edited = $6, revision = revision + 1, updated_at = now()
       WHERE user_id = $1 AND id = $2 AND revision = $3 AND status = 'ok'
       RETURNING ${COLUMNS}`,
      [userId, id, revision, json(update.cv), json(update.report), json(update.edited)],
    );
    return rows[0];
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query("DELETE FROM generation WHERE user_id = $1 AND id = $2", [
      userId,
      id,
    ]);
    return (rowCount ?? 0) > 0;
  }

  async deleteUser(userId: string): Promise<number> {
    const { rowCount } = await this.pool.query("DELETE FROM generation WHERE user_id = $1", [userId]);
    return rowCount ?? 0;
  }

  async exportUser(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT offer_title, status, cv, report, removed, edited, provider_kind, model, pipeline_version, created_at
       FROM generation WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    );
    return { generations: rows };
  }

  /** Générations d'invité de plus de 24 h, quotas de la veille, usage LLM de plus de 13 mois. */
  async purge(): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM generation WHERE user_id LIKE 'guest\\_%' AND created_at < now() - interval '24 hours'`,
    );
    await this.pool.query("DELETE FROM ia_quota WHERE day < current_date - 1");
    await this.pool.query("DELETE FROM llm_usage WHERE at < now() - interval '13 months'");
    return rowCount ?? 0;
  }

  async stats() {
    const { rows } = await this.pool.query<Record<string, number>>(
      `SELECT count(*)::int AS generations,
         count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS "generations7d",
         count(*) FILTER (WHERE status = 'degraded')::int AS degraded,
         coalesce(round(avg((report->>'score')::float8)::numeric, 3), 0)::float8 AS "averageScore",
         coalesce(sum(jsonb_array_length(removed)), 0)::int AS "removedLines"
       FROM generation`,
    );
    return rows[0]!;
  }
}

export type Reservation = { status: "ok"; token: string } | { status: "busy" | "quota" };

/**
 * Durée maximale d'un verrou, au-delà de laquelle il est considéré comme abandonné (instance arrêtée).
 */
export const LOCK_MS = 16 * 60 * 1000;

/**
 * Verrou et quota d'appels à l'IA par utilisateur (docs/adr/0009) : un seul appel à la fois, `dailyLimit`
 * par jour, réservés de façon atomique. Le sujet est une empreinte non réversible sans le secret.
 */
export class IaQuota {
  constructor(
    private readonly pool: pg.Pool,
    private readonly secret: string,
  ) {}

  private subject(userId: string) {
    return createHmac("sha256", this.secret).update(userId).digest("base64url");
  }

  async reserve(userId: string, dailyLimit: number): Promise<Reservation> {
    const token = randomBytes(16).toString("base64url");
    const { rows } = await this.pool.query<{ reserved: boolean; busy: boolean | null }>(
      `WITH prior AS (
         SELECT running_until IS NOT NULL AND running_until >= now() AS busy FROM ia_quota WHERE subject = $1
       ),
       upsert AS (
         INSERT INTO ia_quota AS q (subject, day, count, running_until, token)
         VALUES ($1, current_date, 1, now() + $3 * interval '1 millisecond', $4)
         ON CONFLICT (subject) DO UPDATE SET
           count = CASE WHEN q.day = EXCLUDED.day THEN q.count + 1 ELSE 1 END,
           day = EXCLUDED.day,
           running_until = EXCLUDED.running_until,
           token = EXCLUDED.token
         WHERE (q.running_until IS NULL OR q.running_until < now())
           AND (q.day <> EXCLUDED.day OR q.count < $2)
         RETURNING 1
       )
       SELECT EXISTS (SELECT 1 FROM upsert) AS reserved, (SELECT busy FROM prior) AS busy`,
      [this.subject(userId), dailyLimit, LOCK_MS, token],
    );
    if (rows[0]?.reserved) return { status: "ok", token };
    return { status: rows[0]?.busy ? "busy" : "quota" };
  }

  async release(userId: string, token: string): Promise<void> {
    await this.pool.query("UPDATE ia_quota SET running_until = NULL WHERE subject = $1 AND token = $2", [
      this.subject(userId),
      token,
    ]);
  }
}
