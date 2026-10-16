import { createHmac, randomBytes } from "node:crypto";
import type { IncrementResponse, Options, Store } from "express-rate-limit";
import type { Pool } from "pg";
import type { Logger } from "@attesta/shared";

/**
 * État partagé entre instances (docs/adr/0009). Deux implémentations : mémoire
 * (une seule instance : développement, tests) et PostgreSQL (préprod, prod).
 */

export type Reservation = { status: "ok"; token: string } | { status: "busy" | "quota" };

export interface IaQuotaStore {
  /** Réserve un appel au modèle : un seul à la fois par session, `dailyLimit` par jour. */
  reserve(sessionId: string, dailyLimit: number): Promise<Reservation>;
  /** Lève le verrou, seulement s'il appartient encore à cette réservation. */
  release(sessionId: string, token: string): Promise<void>;
}

/**
 * Durée maximale d'un verrou, au-delà de laquelle il est considéré comme abandonné
 * (instance arrêtée). Supérieure au délai maximal d'une requête Cloud Run (15 min).
 */
export const LOCK_MS = 16 * 60 * 1000;

const today = () => new Date().toISOString().slice(0, 10);
const newToken = () => randomBytes(16).toString("base64url");

/** Empreinte non réversible sans le secret : aucun identifiant brut n'est stocké. */
export const fingerprint = (secret: string, value: string) =>
  createHmac("sha256", secret).update(value).digest("base64url");

export class MemoryIaQuota implements IaQuotaStore {
  private readonly entries = new Map<
    string,
    { day: string; count: number; runningUntil: number; token?: string }
  >();

  async reserve(sessionId: string, dailyLimit: number): Promise<Reservation> {
    const now = Date.now();
    const entry = this.entries.get(sessionId);
    if (entry && entry.runningUntil > now) return { status: "busy" };
    const count = entry?.day === today() ? entry.count : 0;
    if (count >= dailyLimit) return { status: "quota" };
    const token = newToken();
    this.entries.set(sessionId, { day: today(), count: count + 1, runningUntil: now + LOCK_MS, token });
    return { status: "ok", token };
  }

  async release(sessionId: string, token: string): Promise<void> {
    const entry = this.entries.get(sessionId);
    if (entry?.token === token) entry.runningUntil = 0;
  }
}

export class PgIaQuota implements IaQuotaStore {
  constructor(
    private readonly pool: Pool,
    private readonly secret: string,
  ) {}

  async reserve(sessionId: string, dailyLimit: number): Promise<Reservation> {
    const subject = fingerprint(this.secret, sessionId);
    const token = newToken();
    // Une seule instruction : vérification, incrément et raison d'un éventuel refus
    // sont évalués ensemble.
    const { rows } = await this.pool.query<{ reserved: boolean; busy: boolean | null }>(
      `WITH prior AS (
         SELECT running_until IS NOT NULL AND running_until >= now() AS busy FROM ia_quota WHERE subject = $1
       ),
       upsert AS (
         INSERT INTO ia_quota AS q (subject, day, count, running_until, token)
         VALUES ($1, $2::date, 1, now() + $4 * interval '1 millisecond', $5)
         ON CONFLICT (subject) DO UPDATE SET
           count = CASE WHEN q.day = EXCLUDED.day THEN q.count + 1 ELSE 1 END,
           day = EXCLUDED.day,
           running_until = EXCLUDED.running_until,
           token = EXCLUDED.token
         WHERE (q.running_until IS NULL OR q.running_until < now())
           AND (q.day <> EXCLUDED.day OR q.count < $3)
         RETURNING 1
       )
       SELECT EXISTS (SELECT 1 FROM upsert) AS reserved, (SELECT busy FROM prior) AS busy`,
      [subject, today(), dailyLimit, LOCK_MS, token],
    );
    if (rows[0]?.reserved) return { status: "ok", token };
    return { status: rows[0]?.busy ? "busy" : "quota" };
  }

  async release(sessionId: string, token: string): Promise<void> {
    await this.pool.query("UPDATE ia_quota SET running_until = NULL WHERE subject = $1 AND token = $2", [
      fingerprint(this.secret, sessionId),
      token,
    ]);
  }
}

/**
 * Stockage PostgreSQL pour express-rate-limit : compteurs partagés entre
 * instances. Les IP sont remplacées par leur empreinte avant tout stockage.
 */
export class PgRateLimitStore implements Store {
  private windowMs = 60_000;

  constructor(
    private readonly pool: Pool,
    private readonly secret: string,
    readonly prefix: string,
  ) {}

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private key(key: string) {
    return `${this.prefix}:${fingerprint(this.secret, key)}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const { rows } = await this.pool.query<{ hits: number; reset_at: Date }>(
      `INSERT INTO rate_limit AS r (key, hits, reset_at)
       VALUES ($1, 1, now() + $2 * interval '1 millisecond')
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE WHEN r.reset_at <= now() THEN 1 ELSE r.hits + 1 END,
         reset_at = CASE WHEN r.reset_at <= now() THEN EXCLUDED.reset_at ELSE r.reset_at END
       RETURNING hits, reset_at`,
      [this.key(key), this.windowMs],
    );
    return { totalHits: rows[0]!.hits, resetTime: rows[0]!.reset_at };
  }

  async decrement(key: string): Promise<void> {
    await this.pool.query("UPDATE rate_limit SET hits = GREATEST(hits - 1, 0) WHERE key = $1", [
      this.key(key),
    ]);
  }

  async resetKey(key: string): Promise<void> {
    await this.pool.query("DELETE FROM rate_limit WHERE key = $1", [this.key(key)]);
  }
}

/**
 * Purge périodique : quotas de plus d'un jour, compteurs expirés, usage LLM de
 * plus de 13 mois. Les sessions sont purgées par connect-pg-simple.
 */
export function startMaintenance(pool: Pool, logger: Logger, everyMs = 15 * 60 * 1000) {
  const run = async () => {
    try {
      await pool.query("DELETE FROM ia_quota WHERE day < current_date - 1");
      await pool.query("DELETE FROM rate_limit WHERE reset_at < now() - interval '1 hour'");
      await pool.query("DELETE FROM llm_usage WHERE at < now() - interval '13 months'");
    } catch (error) {
      logger.warn({ errorType: (error as Error)?.name }, "maintenance: purge impossible");
    }
  };
  const timer = setInterval(run, everyMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
