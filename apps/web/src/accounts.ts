import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { SCHEMA_VERSION, type Profile } from "@attesta/schema";

/**
 * Comptes, consentements, profil enregistré et abonnement à la veille
 * (docs/adr/0010). Connexion sans mot de passe : un lien à usage unique envoyé
 * par e-mail, dont seule l'empreinte est stockée.
 */

/** Version de la politique de confidentialité (page /confidentialite), enregistrée avec chaque consentement. */
export const POLICY_VERSION = "2026-10-16";
export const LOGIN_TOKEN_MS = 15 * 60 * 1000;
export const CONFIRM_TOKEN_MS = 48 * 60 * 60 * 1000;

const newToken = () => randomBytes(32).toString("base64url");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hashToken = (token: string) => createHash("sha256").update(token).digest();

export type Purpose = "service" | "veille" | "promo";

export interface SubscriptionInput {
  occupations: string[];
  country: "DE" | "FR";
  city: string;
  lat: number;
  lon: number;
  radiusKm: number;
  workingTime: "indifferent" | "plein" | "partiel";
}

export interface SubscriptionRow extends SubscriptionInput {
  status: "en_attente" | "active" | "desabonnee" | "suspendue";
  confirmedAt: Date | null;
}

export class AccountStore {
  constructor(private readonly pool: Pool) {}

  /** Un seul lien valide par adresse : une nouvelle demande annule la précédente. */
  async createLoginToken(email: string): Promise<string> {
    const token = newToken();
    await this.pool.query("DELETE FROM login_token WHERE email = $1", [email]);
    await this.pool.query(
      "INSERT INTO login_token (token_hash, email, expires_at) VALUES ($1, $2, now() + $3 * interval '1 millisecond')",
      [hashToken(token), email, LOGIN_TOKEN_MS],
    );
    return token;
  }

  /**
   * Consomme le lien et ouvre (ou crée) le compte. À la création, l'acceptation de
   * la politique de confidentialité, cochée lors de la demande, est journalisée.
   */
  async consumeLoginToken(
    token: string,
    ipHash: string,
  ): Promise<{ userId: string; created: boolean } | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ email: string }>(
        "DELETE FROM login_token WHERE token_hash = $1 AND expires_at > now() RETURNING email",
        [hashToken(token)],
      );
      if (!rows[0]) {
        await client.query("ROLLBACK");
        return undefined;
      }
      const user = await client.query<{ id: string; created: boolean }>(
        `INSERT INTO app_user (email, email_verified_at) VALUES ($1, now())
         ON CONFLICT (email) DO UPDATE SET last_active_at = now()
         RETURNING id, (xmax = 0) AS created`,
        [rows[0].email],
      );
      const { id, created } = user.rows[0]!;
      if (created) {
        await client.query(
          "INSERT INTO consent_log (user_id, purpose, granted, policy_version, ip_hash) VALUES ($1, 'service', true, $2, $3)",
          [id, POLICY_VERSION, ipHash],
        );
      }
      await client.query("COMMIT");
      return { userId: id, created };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async user(userId: string): Promise<{ id: string; email: string } | undefined> {
    const { rows } = await this.pool.query<{ id: string; email: string }>(
      "UPDATE app_user SET last_active_at = now() WHERE id = $1 RETURNING id, email",
      [userId],
    );
    return rows[0];
  }

  async recordConsent(userId: string, purpose: Purpose, granted: boolean, ipHash: string | null) {
    await this.pool.query(
      "INSERT INTO consent_log (user_id, purpose, granted, policy_version, ip_hash) VALUES ($1, $2, $3, $4, $5)",
      [userId, purpose, granted, POLICY_VERSION, ipHash],
    );
  }

  async latestProfile(userId: string): Promise<{ id: string; version: number; createdAt: Date } | undefined> {
    const { rows } = await this.pool.query<{ id: string; version: number; createdAt: Date }>(
      `SELECT id, version, created_at AS "createdAt" FROM profile_version
       WHERE user_id = $1 ORDER BY version DESC LIMIT 1`,
      [userId],
    );
    return rows[0];
  }

  /** Nouvelle version du profil ; l'abonnement suit toujours la dernière. */
  async saveProfile(userId: string, profile: Profile): Promise<number> {
    const { rows } = await this.pool.query<{ id: string; version: number }>(
      `INSERT INTO profile_version (user_id, version, data, schema_version)
       SELECT $1, coalesce(max(version), 0) + 1, $2, $3 FROM profile_version WHERE user_id = $1
       RETURNING id, version`,
      [userId, JSON.stringify(profile), SCHEMA_VERSION],
    );
    await this.pool.query(
      "UPDATE watch_subscription SET profile_version_id = $2, updated_at = now() WHERE user_id = $1",
      [userId, rows[0]!.id],
    );
    return rows[0]!.version;
  }

  async subscription(userId: string): Promise<SubscriptionRow | undefined> {
    const { rows } = await this.pool.query<SubscriptionRow>(
      `SELECT occupations, country, city, lat, lon, radius_km AS "radiusKm", working_time AS "workingTime",
         status, confirmed_at AS "confirmedAt"
       FROM watch_subscription WHERE user_id = $1`,
      [userId],
    );
    return rows[0];
  }

  /**
   * Crée ou modifie l'abonnement. Un abonnement actif le reste (consentement déjà
   * confirmé) ; sinon il repasse « en attente » et un jeton de confirmation
   * (double opt-in) est renvoyé, à envoyer par e-mail.
   */
  async saveSubscription(
    userId: string,
    profileVersionId: string,
    input: SubscriptionInput,
  ): Promise<{ confirmToken?: string }> {
    const confirmToken = newToken();
    const { rows } = await this.pool.query<{ status: string }>(
      `INSERT INTO watch_subscription (user_id, profile_version_id, occupations, country, city, lat, lon,
         radius_km, working_time, status, confirm_token_hash, confirm_expires_at, unsubscribe_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'en_attente', $10, now() + $11 * interval '1 millisecond', $12)
       ON CONFLICT (user_id) DO UPDATE SET
         profile_version_id = EXCLUDED.profile_version_id, occupations = EXCLUDED.occupations,
         country = EXCLUDED.country, city = EXCLUDED.city, lat = EXCLUDED.lat, lon = EXCLUDED.lon,
         radius_km = EXCLUDED.radius_km, working_time = EXCLUDED.working_time, updated_at = now(),
         status = CASE WHEN watch_subscription.status = 'active' THEN 'active' ELSE 'en_attente' END,
         confirm_token_hash = CASE WHEN watch_subscription.status = 'active' THEN NULL
           ELSE EXCLUDED.confirm_token_hash END,
         confirm_expires_at = CASE WHEN watch_subscription.status = 'active' THEN NULL
           ELSE EXCLUDED.confirm_expires_at END
       RETURNING status`,
      [
        userId,
        profileVersionId,
        input.occupations,
        input.country,
        input.city,
        input.lat,
        input.lon,
        input.radiusKm,
        input.workingTime,
        hashToken(confirmToken),
        CONFIRM_TOKEN_MS,
        newToken(),
      ],
    );
    return rows[0]!.status === "active" ? {} : { confirmToken };
  }

  /** Double opt-in : active l'abonnement si le jeton est valide. */
  async confirmSubscription(token: string, ipHash: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ userId: string }>(
      `UPDATE watch_subscription SET status = 'active', confirmed_at = now(), confirm_token_hash = NULL,
         confirm_expires_at = NULL, updated_at = now()
       WHERE confirm_token_hash = $1 AND confirm_expires_at > now() AND status = 'en_attente'
       RETURNING user_id AS "userId"`,
      [hashToken(token)],
    );
    // Preuve du double opt-in : la confirmation elle-même est journalisée.
    if (rows[0]) await this.recordConsent(rows[0].userId, "veille", true, ipHash);
    return rows[0] !== undefined;
  }

  /** Adresse visée par un lien de connexion encore valide, sans le consommer. */
  async loginTokenEmail(token: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ email: string }>(
      "SELECT email FROM login_token WHERE token_hash = $1 AND expires_at > now()",
      [hashToken(token)],
    );
    return rows[0]?.email;
  }

  /** Désabonnement (lien de l'e-mail, en un clic) : retrait du consentement journalisé. */
  async unsubscribeByToken(token: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ userId: string }>(
      `UPDATE watch_subscription SET status = 'desabonnee', updated_at = now()
       WHERE unsubscribe_token = $1 AND status IN ('active', 'en_attente', 'suspendue')
       RETURNING user_id AS "userId"`,
      [token],
    );
    if (rows[0]) await this.recordConsent(rows[0].userId, "veille", false, null);
    // Lien déjà utilisé : réponse identique (le désabonnement est acquis).
    return rows[0] !== undefined || (await this.knownUnsubscribeToken(token));
  }

  private async knownUnsubscribeToken(token: string) {
    const { rowCount } = await this.pool.query(
      "SELECT 1 FROM watch_subscription WHERE unsubscribe_token = $1",
      [token],
    );
    return (rowCount ?? 0) > 0;
  }

  async unsubscribeUser(userId: string, ipHash: string) {
    const { rowCount } = await this.pool.query(
      `UPDATE watch_subscription SET status = 'desabonnee', updated_at = now()
       WHERE user_id = $1 AND status <> 'desabonnee'`,
      [userId],
    );
    if (rowCount) await this.recordConsent(userId, "veille", false, ipHash);
  }

  /**
   * Retour du fournisseur d'e-mail. Plainte ou désabonnement : arrêt immédiat ;
   * rebond définitif : suspension. Seul le compteur est conservé, sans adresse.
   * L'envoi est retrouvé par son identifiant (en-tête X-Mailin-custom, renvoyé par
   * Brevo), à défaut par le Message-ID.
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
       WHERE d.id = $1::uuid OR d.provider_message_id = $2
       LIMIT 1`,
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
    if (event === "plainte")
      await this.pool.query("UPDATE email_delivery SET status = 'plainte' WHERE id = $1", [
        target.deliveryId,
      ]);
    const { rowCount } = await this.pool.query(
      "UPDATE watch_subscription SET status = 'desabonnee', updated_at = now() WHERE id = $1 AND status <> 'desabonnee'",
      [target.subscriptionId],
    );
    if (rowCount) await this.recordConsent(target.userId, "veille", false, null);
  }

  /** Droit d'accès et de portabilité (RGPD, art. 15 et 20) : toutes les données du compte. */
  async exportData(userId: string) {
    const q = async (sql: string) => (await this.pool.query(sql, [userId])).rows;
    return {
      exportedAt: new Date().toISOString(),
      compte: (
        await q("SELECT email, email_verified_at, created_at, last_active_at FROM app_user WHERE id = $1")
      )[0],
      consentements: await q(
        "SELECT purpose, granted, policy_version, at, ip_hash FROM consent_log WHERE user_id = $1 ORDER BY at",
      ),
      profils: await q(
        "SELECT version, data, schema_version, created_at FROM profile_version WHERE user_id = $1 ORDER BY version",
      ),
      veille: (
        await q(
          `SELECT occupations, country, city, radius_km, working_time, status, confirmed_at, created_at
           FROM watch_subscription WHERE user_id = $1`,
        )
      )[0],
      envois: await q(
        `SELECT d.run_date, d.offers, d.status, d.sent_at, d.provider_message_id FROM email_delivery d
         JOIN watch_subscription s ON s.id = d.subscription_id WHERE s.user_id = $1 ORDER BY d.run_date`,
      ),
      offresProposees: await q(
        `SELECT m.run_date, m.rank, p.title, p.company, p.url, m.rerank_score, m.missing_skills
         FROM match_result m JOIN job_posting p ON p.id = m.posting_id
         JOIN watch_subscription s ON s.id = m.subscription_id WHERE s.user_id = $1 ORDER BY m.run_date, m.rank`,
      ),
    };
  }

  /** Droit à l'effacement : tout part en cascade (profils, veille, envois, consentements). */
  async deleteUser(userId: string) {
    await this.pool.query("DELETE FROM app_user WHERE id = $1", [userId]);
  }
}
