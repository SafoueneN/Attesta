import { createHash, randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";

/** Version de la politique de confidentialité, enregistrée avec chaque consentement. */
export const POLICY_VERSION = "2026-10-18";
export const LOGIN_TOKEN_MS = 15 * 60 * 1000;
export const REFRESH_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_MAX_MS = 30 * 24 * 60 * 60 * 1000;

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest();

export type AccountRole = "candidate" | "admin";

export interface User {
  id: string;
  email: string;
  role: AccountRole;
  status: "active" | "deleting";
  createdAt: Date;
}

export type RotateResult =
  | { kind: "ok"; user: User; token: string }
  /** Jeton déjà tourné présenté une seconde fois : toute la famille est révoquée. */
  | { kind: "reuse" }
  | { kind: "invalid" };

type Db = pg.Pool | pg.PoolClient;

const USER_COLUMNS = `id, email, role, status, created_at AS "createdAt"`;

export class AuthStore {
  constructor(private readonly pool: pg.Pool) {}

  private async tx<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // --- Liens de connexion ------------------------------------------------------------------------

  /** Un seul lien valide par adresse : une nouvelle demande annule la précédente. */
  async createLoginToken(email: string): Promise<string> {
    const token = newToken();
    await this.tx(async (c) => {
      await c.query("DELETE FROM login_token WHERE email = $1", [email]);
      await c.query(
        `INSERT INTO login_token (token_hash, email, policy_version, expires_at)
         VALUES ($1, $2, $3, now() + $4 * interval '1 millisecond')`,
        [hashToken(token), email, POLICY_VERSION, LOGIN_TOKEN_MS],
      );
    });
    return token;
  }

  /** Adresse visée par un lien encore valide, sans le consommer. */
  async loginTokenEmail(token: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ email: string }>(
      "SELECT email FROM login_token WHERE token_hash = $1 AND expires_at > now()",
      [hashToken(token)],
    );
    return rows[0]?.email;
  }

  /**
   * Consomme le lien et ouvre (ou crée) le compte, avec son rôle (ADR 0024). À la création, l'acceptation
   * de la politique, cochée lors de la demande, est journalisée. Un compte en suppression ne se rouvre pas.
   */
  async consumeLoginToken(
    token: string,
    adminEmails: string[],
    ipHash: string,
  ): Promise<{ user: User; created: boolean } | undefined> {
    return this.tx(async (c) => {
      const { rows } = await c.query<{ email: string; policy: string }>(
        `DELETE FROM login_token WHERE token_hash = $1 AND expires_at > now()
         RETURNING email, policy_version AS policy`,
        [hashToken(token)],
      );
      const link = rows[0];
      if (!link) return undefined;
      const role: AccountRole = adminEmails.includes(link.email) ? "admin" : "candidate";
      const result = await c.query<User & { created: boolean }>(
        `INSERT INTO app_user (email, role, email_verified_at) VALUES ($1, $2, now())
         ON CONFLICT (email) DO UPDATE SET last_active_at = now(), role = EXCLUDED.role
         RETURNING ${USER_COLUMNS}, (xmax = 0) AS created`,
        [link.email, role],
      );
      const { created, ...user } = result.rows[0]!;
      if (user.status !== "active") return undefined;
      if (created) await this.consent(c, user.id, "service", true, ipHash, link.policy);
      await this.audit(c, created ? "compte_cree" : "connexion", user.id);
      return { user, created };
    });
  }

  async user(id: string): Promise<User | undefined> {
    const { rows } = await this.pool.query<User>(`SELECT ${USER_COLUMNS} FROM app_user WHERE id = $1`, [id]);
    return rows[0];
  }

  // --- Refresh tokens (ADR 0014, point 3) ---------------------------------------------------------

  async issueRefreshToken(userId: string, db: Db = this.pool): Promise<string> {
    const token = newToken();
    await db.query(
      `INSERT INTO refresh_token (family_id, user_id, token_hash, expires_at, family_expires_at)
       VALUES ($1, $2, $3, now() + $4 * interval '1 millisecond', now() + $5 * interval '1 millisecond')`,
      [randomUUID(), userId, hashToken(token), REFRESH_IDLE_MS, REFRESH_MAX_MS],
    );
    return token;
  }

  /** Rotation : l'ancien jeton est marqué utilisé, un nouveau de la même famille le remplace. */
  async rotateRefreshToken(token: string): Promise<RotateResult> {
    return this.tx(async (c) => {
      const { rows } = await c.query<{
        id: string;
        familyId: string;
        userId: string;
        valid: boolean;
        used: boolean;
      }>(
        `SELECT id, family_id AS "familyId", user_id AS "userId",
           (expires_at > now() AND family_expires_at > now() AND revoked_at IS NULL) AS valid,
           (used_at IS NOT NULL) AS used
         FROM refresh_token WHERE token_hash = $1 FOR UPDATE`,
        [hashToken(token)],
      );
      const current = rows[0];
      if (!current) return { kind: "invalid" };
      if (current.used) {
        await c.query(
          "UPDATE refresh_token SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL",
          [current.familyId],
        );
        await this.audit(c, "refresh_reutilise", current.userId);
        return { kind: "reuse" };
      }
      if (!current.valid) return { kind: "invalid" };
      const user = (
        await c.query<User>(
          `UPDATE app_user SET last_active_at = now() WHERE id = $1 AND status = 'active' RETURNING ${USER_COLUMNS}`,
          [current.userId],
        )
      ).rows[0];
      if (!user) return { kind: "invalid" };
      await c.query("UPDATE refresh_token SET used_at = now() WHERE id = $1", [current.id]);
      const next = newToken();
      await c.query(
        `INSERT INTO refresh_token (family_id, user_id, token_hash, expires_at, family_expires_at)
         SELECT family_id, user_id, $2, least(now() + $3 * interval '1 millisecond', family_expires_at),
           family_expires_at
         FROM refresh_token WHERE id = $1`,
        [current.id, hashToken(next), REFRESH_IDLE_MS],
      );
      return { kind: "ok", user, token: next };
    });
  }

  /** Déconnexion : révocation de la famille du jeton présenté (ADR 0014, point 9). */
  async revokeFamily(token: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ userId: string }>(
      `UPDATE refresh_token SET revoked_at = now()
       WHERE family_id = (SELECT family_id FROM refresh_token WHERE token_hash = $1) AND revoked_at IS NULL
       RETURNING user_id AS "userId"`,
      [hashToken(token)],
    );
    const userId = rows[0]?.userId;
    if (userId) await this.audit(this.pool, "deconnexion", userId);
    return userId;
  }

  // --- Consentements et audit ---------------------------------------------------------------------

  private async consent(
    db: Db,
    userId: string,
    purpose: "service" | "veille" | "promo",
    granted: boolean,
    ipHash: string | null,
    policy = POLICY_VERSION,
  ) {
    await db.query(
      "INSERT INTO consent_log (user_id, purpose, granted, policy_version, ip_hash) VALUES ($1, $2, $3, $4, $5)",
      [userId, purpose, granted, policy, ipHash],
    );
  }

  async recordConsent(userId: string, purpose: "promo", granted: boolean, ipHash: string) {
    await this.consent(this.pool, userId, purpose, granted, ipHash);
    await this.audit(this.pool, "consentement", userId, { purpose, granted });
  }

  async consents(userId: string) {
    const { rows } = await this.pool.query<{
      purpose: "service" | "veille" | "promo";
      granted: boolean;
      policyVersion: string;
      at: Date;
    }>(
      `SELECT purpose, granted, policy_version AS "policyVersion", at FROM consent_log
       WHERE user_id = $1 ORDER BY at`,
      [userId],
    );
    return rows;
  }

  async audit(db: Db, type: string, userId: string | null, detail?: Record<string, unknown>) {
    await db.query("INSERT INTO audit_event (type, user_id, detail) VALUES ($1, $2, $3)", [
      type,
      userId,
      detail ? JSON.stringify(detail) : null,
    ]);
  }

  /** Droit d'accès (RGPD, art. 15 et 20) : données détenues par `auth`. */
  async exportData(userId: string) {
    const q = async (sql: string) => (await this.pool.query(sql, [userId])).rows;
    await this.audit(this.pool, "export", userId);
    return {
      compte: (
        await q(
          "SELECT email, role, email_verified_at, created_at, last_active_at FROM app_user WHERE id = $1",
        )
      )[0],
      consentements: await q(
        "SELECT purpose, granted, policy_version, at, ip_hash FROM consent_log WHERE user_id = $1 ORDER BY at",
      ),
      evenements: await q("SELECT type, at FROM audit_event WHERE user_id = $1 ORDER BY at"),
    };
  }

  // --- Suppression distribuée (ADR 0019) -----------------------------------------------------------

  /**
   * Étape 1 : compte en suppression, jetons révoqués, retrait du consentement et une ligne d'outbox par
   * service détenteur, dans une seule transaction.
   */
  async requestDeletion(userId: string, targets: string[], ipHash: string | null) {
    await this.tx(async (c) => {
      await c.query("UPDATE app_user SET status = 'deleting' WHERE id = $1", [userId]);
      await c.query("UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
        userId,
      ]);
      await this.consent(c, userId, "service", false, ipHash);
      for (const target of targets) {
        await c.query(
          "INSERT INTO outbox (user_id, target, action) VALUES ($1, $2, 'delete') ON CONFLICT DO NOTHING",
          [userId, target],
        );
      }
      await this.audit(c, "suppression_demandee", userId, { services: targets });
    });
    await this.finishDeletions();
  }

  /** Lignes dues, réservées pour ce traitement (plusieurs instances possibles). */
  async dueOutbox(limit = 10) {
    const { rows } = await this.pool.query<{
      id: string;
      userId: string;
      target: string;
      attempts: number;
      ageMs: number;
    }>(
      `UPDATE outbox SET next_attempt_at = now() + interval '2 minutes'
       WHERE id IN (
         SELECT id FROM outbox WHERE done_at IS NULL AND failed_at IS NULL AND next_attempt_at <= now()
         ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
       RETURNING id, user_id AS "userId", target, attempts,
         (extract(epoch FROM now() - created_at) * 1000)::float8 AS "ageMs"`,
      [limit],
    );
    return rows;
  }

  async outboxDone(id: string) {
    await this.pool.query("UPDATE outbox SET done_at = now(), last_error = NULL WHERE id = $1", [id]);
  }

  /** Échec : recul exponentiel (10 s, 20 s… 1 h au plus) ; abandon et alerte après 24 h. */
  async outboxFailed(id: string, attempts: number, error: string, giveUp: boolean) {
    const delayMs = Math.min(10_000 * 2 ** attempts, 60 * 60 * 1000);
    await this.pool.query(
      `UPDATE outbox SET attempts = attempts + 1, last_error = $2,
         next_attempt_at = now() + $3 * interval '1 millisecond',
         failed_at = CASE WHEN $4 THEN now() ELSE NULL END
       WHERE id = $1`,
      [id, error.slice(0, 200), delayMs, giveUp],
    );
  }

  /** Étape 4 : comptes dont tous les services ont confirmé, effacés ; l'audit garde l'identifiant seul. */
  async finishDeletions(): Promise<number> {
    const { rows } = await this.pool.query<{ id: string }>(
      `DELETE FROM app_user u WHERE u.status = 'deleting'
         AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.user_id = u.id AND o.done_at IS NULL)
       RETURNING u.id`,
    );
    for (const { id } of rows) await this.audit(this.pool, "compte_efface", id);
    return rows.length;
  }

  /**
   * Purge (ADR 0010, architecture : rétention) : liens et refresh tokens expirés, audit de plus de 13 mois ;
   * comptes inactifs depuis 18 mois : suppression distribuée.
   */
  async purge(targets: string[]): Promise<{ inactive: number }> {
    await this.pool.query("DELETE FROM login_token WHERE expires_at < now()");
    await this.pool.query("DELETE FROM refresh_token WHERE family_expires_at < now() - interval '1 day'");
    await this.pool.query("DELETE FROM audit_event WHERE at < now() - interval '13 months'");
    const { rows } = await this.pool.query<{ id: string }>(
      "SELECT id FROM app_user WHERE status = 'active' AND last_active_at < now() - interval '18 months' LIMIT 100",
    );
    for (const { id } of rows) await this.requestDeletion(id, targets, null);
    return { inactive: rows.length };
  }

  async stats() {
    const { rows } = await this.pool.query<Record<string, number>>(
      `SELECT
         (SELECT count(*) FROM app_user WHERE status = 'active')::int AS users,
         (SELECT count(*) FROM app_user WHERE role = 'admin')::int AS admins,
         (SELECT count(*) FROM app_user WHERE created_at > now() - interval '30 days')::int AS "newUsers30d",
         (SELECT count(*) FROM audit_event WHERE type IN ('connexion', 'compte_cree')
            AND at > now() - interval '7 days')::int AS "logins7d",
         (SELECT count(*) FROM app_user WHERE status = 'deleting')::int AS "deletionsPending",
         (SELECT count(*) FROM outbox WHERE failed_at IS NOT NULL)::int AS "outboxFailed"`,
    );
    return rows[0] as {
      users: number;
      admins: number;
      newUsers30d: number;
      logins7d: number;
      deletionsPending: number;
      outboxFailed: number;
    };
  }
}

/** « lea.martin@example.org » → « l***@example.org ». */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}
