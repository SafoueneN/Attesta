import { createHash, randomBytes } from "node:crypto";
import type { MatchedPosting, WatchCriteria } from "@attesta/shared-schemas";
import type pg from "pg";

/** Version de la politique de confidentialité, enregistrée avec chaque consentement de veille. */
export const POLICY_VERSION = "2026-10-30";
export const CONFIRM_TOKEN_MS = 48 * 60 * 60 * 1000;

const newToken = () => randomBytes(32).toString("base64url");
const hashToken = (token: string) => createHash("sha256").update(token).digest();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SubscriptionStatus = "en_attente" | "active" | "desabonnee" | "suspendue";

export interface SubscriptionRow extends WatchCriteria {
  id: string;
  userId: string;
  /** Adresse de réception choisie ; `null` : celle du compte. */
  recipientEmail: string | null;
  status: SubscriptionStatus;
  confirmedAt: Date | null;
  unsubscribeToken: string;
  createdAt: Date;
  updatedAt: Date;
}

const SUB_COLUMNS = `id, user_id AS "userId", occupations, country, city, lat, lon, radius_km AS "radiusKm",
  working_time AS "workingTime", recipient_email AS "recipientEmail", status, confirmed_at AS "confirmedAt",
  unsubscribe_token AS "unsubscribeToken",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

type Db = pg.Pool | pg.PoolClient;

export interface ReminderRow {
  id: string;
  userId: string;
  kind: "progression" | "relance";
  sendOn: string;
  title: string;
  detail: string;
  link: string | null;
  sentAt: Date | null;
}

const REMINDER_COLUMNS = `id, user_id AS "userId", kind, to_char(send_on, 'YYYY-MM-DD') AS "sendOn", title, detail,
  link, sent_at AS "sentAt"`;

export class WatchStore {
  constructor(private readonly pool: pg.Pool) {}

  // --- Abonnements ----------------------------------------------------------------------------------

  async subscription(userId: string): Promise<SubscriptionRow | undefined> {
    const { rows } = await this.pool.query<SubscriptionRow>(
      `SELECT ${SUB_COLUMNS} FROM watch_subscription WHERE user_id = $1`,
      [userId],
    );
    return rows[0];
  }

  async activeSubscriptions(): Promise<SubscriptionRow[]> {
    const { rows } = await this.pool.query<SubscriptionRow>(
      `SELECT ${SUB_COLUMNS} FROM watch_subscription WHERE status = 'active' ORDER BY created_at`,
    );
    return rows;
  }

  /**
   * Crée ou modifie l'abonnement. Un abonnement actif le reste (consentement déjà confirmé) ; sinon il
   * repasse « en attente » et un jeton de confirmation (double opt-in) est renvoyé, à envoyer par e-mail.
   */
  /**
   * Crée ou modifie la veille, active tout de suite (ADR 0030, point 5) : aucun lien de confirmation, les
   * rapports partent dès le prochain passage. Le consentement coché est journalisé ; chaque e-mail garde son
   * lien de désabonnement en un clic. Une veille suspendue (rebond) ou désabonnée est réactivée.
   */
  async saveSubscription(
    userId: string,
    c: WatchCriteria,
    recipientEmail: string | null,
    ipHash: string,
  ): Promise<{ row: SubscriptionRow }> {
    const stillActive = `watch_subscription.status = 'active'
      AND watch_subscription.recipient_email IS NOT DISTINCT FROM EXCLUDED.recipient_email`;
    const { rows } = await this.pool.query<SubscriptionRow>(
      `INSERT INTO watch_subscription (user_id, occupations, country, city, lat, lon, radius_km, working_time,
         recipient_email, status, confirmed_at, unsubscribe_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $10, 'active', now(), $9)
       ON CONFLICT (user_id) DO UPDATE SET
         occupations = EXCLUDED.occupations, country = EXCLUDED.country, city = EXCLUDED.city, lat = EXCLUDED.lat,
         lon = EXCLUDED.lon, radius_km = EXCLUDED.radius_km, working_time = EXCLUDED.working_time, updated_at = now(),
         status = 'active',
         confirmed_at = CASE WHEN ${stillActive} THEN watch_subscription.confirmed_at ELSE now() END,
         confirm_token_hash = NULL,
         confirm_expires_at = NULL,
         recipient_email = EXCLUDED.recipient_email
       RETURNING ${SUB_COLUMNS}`,
      [
        userId,
        c.occupations,
        c.country,
        c.city,
        c.lat,
        c.lon,
        c.radiusKm,
        c.workingTime,
        newToken(),
        recipientEmail,
      ],
    );
    const row = rows[0]!;
    await this.consent(this.pool, userId, true, "demande", ipHash);
    return { row };
  }

  private async consent(db: Db, userId: string, granted: boolean, reason: string, ipHash: string | null) {
    await db.query(
      "INSERT INTO watch_consent (user_id, granted, reason, policy_version, ip_hash) VALUES ($1, $2, $3, $4, $5)",
      [userId, granted, reason, POLICY_VERSION, ipHash],
    );
  }

  /** Double opt-in : active l'abonnement si le jeton est valide ; la confirmation est journalisée. */
  async confirm(token: string, ipHash: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ userId: string }>(
      `UPDATE watch_subscription SET status = 'active', confirmed_at = now(), confirm_token_hash = NULL,
         confirm_expires_at = NULL, updated_at = now()
       WHERE confirm_token_hash = $1 AND confirm_expires_at > now() AND status = 'en_attente'
       RETURNING user_id AS "userId"`,
      [hashToken(token)],
    );
    if (rows[0]) await this.consent(this.pool, rows[0].userId, true, "confirmation", ipHash);
    return rows[0] !== undefined;
  }

  /** Désabonnement en un clic : idempotent, un lien déjà utilisé répond de la même façon. */
  async unsubscribeByToken(token: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ userId: string }>(
      `UPDATE watch_subscription SET status = 'desabonnee', updated_at = now()
       WHERE unsubscribe_token = $1 AND status IN ('active', 'en_attente', 'suspendue')
       RETURNING user_id AS "userId"`,
      [token],
    );
    if (rows[0]) {
      await this.consent(this.pool, rows[0].userId, false, "desabonnement", null);
      return true;
    }
    const known = await this.pool.query("SELECT 1 FROM watch_subscription WHERE unsubscribe_token = $1", [
      token,
    ]);
    return (known.rowCount ?? 0) > 0;
  }

  async unsubscribeUser(userId: string, ipHash: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE watch_subscription SET status = 'desabonnee', updated_at = now()
       WHERE user_id = $1 AND status <> 'desabonnee'`,
      [userId],
    );
    if (rowCount) await this.consent(this.pool, userId, false, "arret", ipHash);
    return (rowCount ?? 0) > 0;
  }

  /**
   * Retour du fournisseur d'e-mail. Plainte ou désabonnement : arrêt immédiat ; rebond définitif :
   * suspension. Seul le compteur est conservé, sans adresse.
   */
  async providerEvent(
    ref: { deliveryId?: string; messageId?: string },
    event: "plainte" | "rebond" | "desabonnement",
  ) {
    await this.pool.query("INSERT INTO email_event (event) VALUES ($1)", [event]);
    const deliveryId = ref.deliveryId && UUID.test(ref.deliveryId) ? ref.deliveryId : null;
    if (!deliveryId && !ref.messageId) return;
    const { rows } = await this.pool.query<{ deliveryId: string; subscriptionId: string; userId: string }>(
      `SELECT d.id AS "deliveryId", d.subscription_id AS "subscriptionId", s.user_id AS "userId"
       FROM email_delivery d JOIN watch_subscription s ON s.id = d.subscription_id
       WHERE d.id = $1::uuid OR d.provider_message_id = $2 LIMIT 1`,
      [deliveryId, ref.messageId ?? null],
    );
    const target = rows[0];
    if (!target) return;
    if (event === "rebond") {
      await this.pool.query("UPDATE email_delivery SET status = 'rebond' WHERE id = $1", [target.deliveryId]);
      await this.pool.query(
        "UPDATE watch_subscription SET status = 'suspendue', updated_at = now() WHERE id = $1",
        [target.subscriptionId],
      );
      return;
    }
    if (event === "plainte") {
      await this.pool.query("UPDATE email_delivery SET status = 'plainte' WHERE id = $1", [
        target.deliveryId,
      ]);
    }
    const { rowCount } = await this.pool.query(
      "UPDATE watch_subscription SET status = 'desabonnee', updated_at = now() WHERE id = $1 AND status <> 'desabonnee'",
      [target.subscriptionId],
    );
    if (rowCount) await this.consent(this.pool, target.userId, false, event, null);
  }

  // --- Exécution quotidienne ------------------------------------------------------------------------

  /** Offres déjà envoyées (ou dont l'envoi a pu partir) : jamais proposées deux fois. */
  async sentPostingIds(subscriptionId: string, date: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT m.posting_id AS id FROM match_result m
       WHERE m.subscription_id = $1 AND m.run_date < $2::date
         AND EXISTS (SELECT 1 FROM email_delivery d WHERE d.subscription_id = m.subscription_id AND d.run_date = m.run_date)`,
      [subscriptionId, date],
    );
    return rows.map((r) => r.id);
  }

  async deliveredToday(subscriptionId: string, date: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "SELECT 1 FROM email_delivery WHERE subscription_id = $1 AND run_date = $2",
      [subscriptionId, date],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Résultats du jour. Remplace ceux d'une tentative précédente du même jour, et ceux des jours sans envoi :
   * une offre jamais envoyée reste proposable, et le classement est toujours celui de l'envoi.
   */
  async saveMatches(subscriptionId: string, date: string, matches: MatchedPosting[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM match_result m WHERE m.subscription_id = $1
           AND (m.run_date = $2::date OR NOT EXISTS (SELECT 1 FROM email_delivery d
             WHERE d.subscription_id = m.subscription_id AND d.run_date = m.run_date))`,
        [subscriptionId, date],
      );
      for (const m of matches) {
        await client.query(
          `INSERT INTO match_result (subscription_id, posting_id, run_date, rank, title, company, city, url, rrf_score,
             similarity, coverage, location_score, rerank_score, missing_skills, salary_min_eur, salary_max_eur)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            subscriptionId,
            m.posting.id,
            date,
            m.rank,
            m.posting.title,
            m.posting.company,
            m.posting.city,
            m.posting.url,
            m.rrfScore,
            m.similarity,
            m.coverage,
            m.locationScore,
            m.rerankScore,
            JSON.stringify(m.missingSkills),
            m.posting.salaryMinEur,
            m.posting.salaryMaxEur,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Offres retenues sur 30 jours (envoyées, ou celles du jour) : base du rapport des points à améliorer. */
  async recentMatches(subscriptionId: string, date: string) {
    const { rows } = await this.pool.query<{
      missingSkills: string[];
      salaryMinEur: number | null;
      salaryMaxEur: number | null;
    }>(
      `SELECT m.missing_skills AS "missingSkills", m.salary_min_eur AS "salaryMinEur", m.salary_max_eur AS "salaryMaxEur"
       FROM match_result m
       WHERE m.subscription_id = $1 AND m.run_date > $2::date - 30 AND m.run_date <= $2::date
         AND (m.run_date = $2::date OR EXISTS (SELECT 1 FROM email_delivery d
           WHERE d.subscription_id = m.subscription_id AND d.run_date = m.run_date))`,
      [subscriptionId, date],
    );
    return rows;
  }

  /** Offres envoyées à l'utilisateur sur 30 jours, pour son tableau de bord. */
  async userMatches(userId: string) {
    const { rows } = await this.pool.query<{
      runDate: string;
      rank: number;
      title: string;
      company: string | null;
      city: string | null;
      url: string;
      rerankScore: number | null;
      missingSkills: string[];
    }>(
      `SELECT to_char(m.run_date, 'YYYY-MM-DD') AS "runDate", m.rank, m.title, m.company, m.city, m.url,
         m.rerank_score AS "rerankScore", m.missing_skills AS "missingSkills"
       FROM match_result m JOIN watch_subscription s ON s.id = m.subscription_id
       WHERE s.user_id = $1 AND m.run_date > current_date - 30
         AND EXISTS (SELECT 1 FROM email_delivery d WHERE d.subscription_id = m.subscription_id AND d.run_date = m.run_date)
       ORDER BY m.run_date DESC, m.rank LIMIT 200`,
      [userId],
    );
    return rows;
  }

  /** Réserve l'envoi du jour ; faux si un envoi existe déjà : jamais deux rapports le même jour. */
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

  /** Échec certain de l'envoi : la réservation est levée pour la relance. */
  async releaseDelivery(id: string) {
    await this.pool.query("DELETE FROM email_delivery WHERE id = $1 AND status = 'en_cours'", [id]);
  }

  async complaintRate(): Promise<{ sent: number; complaints: number }> {
    const { rows } = await this.pool.query<{ sent: number; complaints: number }>(
      `SELECT
         (SELECT count(*)::int FROM email_delivery WHERE sent_at > now() - interval '30 days' AND status <> 'en_cours') AS sent,
         (SELECT count(*)::int FROM email_event WHERE event = 'plainte' AND at > now() - interval '30 days') AS complaints`,
    );
    return rows[0]!;
  }

  async startRun(date: string, trigger: "planifiee" | "manuelle"): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      "INSERT INTO watch_run (run_date, trigger) VALUES ($1, $2) RETURNING id",
      [date, trigger],
    );
    return rows[0]!.id;
  }

  async finishRun(id: string, summary: Record<string, unknown>) {
    await this.pool.query("UPDATE watch_run SET finished_at = now(), summary = $2 WHERE id = $1", [
      id,
      JSON.stringify(summary),
    ]);
  }

  async ranToday(date: string, trigger: "planifiee" | "manuelle"): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "SELECT 1 FROM watch_run WHERE run_date = $1 AND trigger = $2",
      [date, trigger],
    );
    return (rowCount ?? 0) > 0;
  }

  async runs(limit = 30) {
    const { rows } = await this.pool.query<{
      id: string;
      runDate: string;
      trigger: "planifiee" | "manuelle";
      startedAt: Date;
      finishedAt: Date | null;
      summary: Record<string, unknown>;
    }>(
      `SELECT id, to_char(run_date, 'YYYY-MM-DD') AS "runDate", trigger, started_at AS "startedAt",
         finished_at AS "finishedAt", summary FROM watch_run ORDER BY started_at DESC LIMIT $1`,
      [limit],
    );
    return rows;
  }

  /**
   * Verrou consultatif de session : une seule exécution à la fois, même avec plusieurs instances. Le
   * verrou est libéré avec la connexion.
   */
  async withRunLock<T>(work: () => Promise<T>): Promise<T | undefined> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(424242) AS locked",
      );
      if (!rows[0]?.locked) return undefined;
      try {
        return await work();
      } finally {
        await client.query("SELECT pg_advisory_unlock(424242)");
      }
    } finally {
      client.release();
    }
  }

  // --- RGPD, administration, rétention --------------------------------------------------------------

  // --- Rappels (ADR 0029, point 5) -----------------------------------------------------------------

  /** Ajoute un rappel ; `undefined` si le compte en a déjà 20 en attente. */
  async addReminder(
    userId: string,
    r: { kind: string; sendOn: string; title: string; detail: string; link: string | null },
  ): Promise<ReminderRow | undefined> {
    const { rows } = await this.pool.query<ReminderRow>(
      `INSERT INTO reminder (user_id, kind, send_on, title, detail, link)
       SELECT $1, $2, $3, $4, $5, $6
       WHERE (SELECT count(*) FROM reminder WHERE user_id = $1 AND sent_at IS NULL) < 20
       RETURNING ${REMINDER_COLUMNS}`,
      [userId, r.kind, r.sendOn, r.title, r.detail, r.link],
    );
    return rows[0];
  }

  async reminders(userId: string): Promise<ReminderRow[]> {
    const { rows } = await this.pool.query<ReminderRow>(
      `SELECT ${REMINDER_COLUMNS} FROM reminder WHERE user_id = $1 ORDER BY send_on, created_at LIMIT 100`,
      [userId],
    );
    return rows;
  }

  async deleteReminder(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query("DELETE FROM reminder WHERE user_id = $1 AND id = $2", [
      userId,
      id,
    ]);
    return (rowCount ?? 0) > 0;
  }

  async dueReminders(today: string, limit: number): Promise<ReminderRow[]> {
    const { rows } = await this.pool.query<ReminderRow>(
      `SELECT ${REMINDER_COLUMNS} FROM reminder WHERE sent_at IS NULL AND send_on <= $1 ORDER BY send_on LIMIT $2`,
      [today, limit],
    );
    return rows;
  }

  async markReminderSent(id: string): Promise<void> {
    await this.pool.query("UPDATE reminder SET sent_at = now() WHERE id = $1", [id]);
  }

  async exportUser(userId: string) {
    const q = async (sql: string) => (await this.pool.query(sql, [userId])).rows;
    return {
      rappels: await q(
        "SELECT kind, send_on, title, detail, link, created_at, sent_at FROM reminder WHERE user_id = $1 ORDER BY send_on",
      ),
      veille: (
        await q(
          `SELECT occupations, country, city, radius_km, working_time, recipient_email, status, confirmed_at,
             created_at
           FROM watch_subscription WHERE user_id = $1`,
        )
      )[0],
      consentements: await q(
        "SELECT granted, reason, policy_version, at FROM watch_consent WHERE user_id = $1 ORDER BY at",
      ),
      envois: await q(
        `SELECT d.run_date, d.offers, d.status, d.sent_at FROM email_delivery d
         JOIN watch_subscription s ON s.id = d.subscription_id WHERE s.user_id = $1 ORDER BY d.run_date`,
      ),
      offresProposees: await q(
        `SELECT m.run_date, m.rank, m.title, m.company, m.url, m.rerank_score, m.missing_skills
         FROM match_result m JOIN watch_subscription s ON s.id = m.subscription_id
         WHERE s.user_id = $1 ORDER BY m.run_date, m.rank`,
      ),
    };
  }

  /** Effacement : abonnement, offres proposées et envois partent en cascade ; consentements aussi. */
  async deleteUser(userId: string): Promise<void> {
    await this.pool.query("DELETE FROM watch_subscription WHERE user_id = $1", [userId]);
    await this.pool.query("DELETE FROM watch_consent WHERE user_id = $1", [userId]);
    await this.pool.query("DELETE FROM reminder WHERE user_id = $1", [userId]);
  }

  async stats() {
    const { rows } = await this.pool.query<Record<string, number>>(
      `SELECT
         (SELECT count(*) FROM watch_subscription WHERE status = 'active')::int AS active,
         (SELECT count(*) FROM watch_subscription WHERE status = 'en_attente')::int AS pending,
         (SELECT count(*) FROM email_delivery WHERE sent_at > now() - interval '7 days' AND status = 'envoye')::int AS "sent7d",
         (SELECT count(*) FROM email_event WHERE event = 'plainte' AND at > now() - interval '30 days')::int AS "complaints30d",
         (SELECT count(*) FROM watch_run WHERE started_at > now() - interval '7 days')::int AS "runs7d"`,
    );
    return rows[0]!;
  }

  /** Veilles non confirmées après 7 jours, événements et exécutions de plus de 13 mois. */
  async purge(): Promise<Record<string, number>> {
    const statements: Record<string, string> = {
      veillesNonConfirmees: `DELETE FROM watch_subscription
        WHERE status = 'en_attente' AND created_at < now() - interval '7 days'`,
      evenementsEmail: "DELETE FROM email_event WHERE at < now() - interval '13 months'",
      executions: "DELETE FROM watch_run WHERE started_at < now() - interval '13 months'",
      rappels: "DELETE FROM reminder WHERE sent_at < now() - interval '13 months'",
    };
    const counts: Record<string, number> = {};
    for (const [name, sql] of Object.entries(statements))
      counts[name] = (await this.pool.query(sql)).rowCount ?? 0;
    return counts;
  }
}
