import { SCHEMA_VERSION, type Profile } from "@attesta/shared-schemas";
import type pg from "pg";

export interface StoredRow {
  version: number;
  createdAt: Date;
  schemaVersion: string;
  profile: Profile;
}

const COLUMNS = `version, created_at AS "createdAt", schema_version AS "schemaVersion", data AS profile`;

/** Versions du profil d'un utilisateur : on ajoute une version, on ne réécrit jamais une version passée. */
export class ProfileStore {
  constructor(private readonly pool: pg.Pool) {}

  async latest(userId: string): Promise<StoredRow | undefined> {
    const { rows } = await this.pool.query<StoredRow>(
      `SELECT ${COLUMNS} FROM profile_version WHERE user_id = $1 ORDER BY version DESC LIMIT 1`,
      [userId],
    );
    return rows[0];
  }

  async version(userId: string, version: number): Promise<StoredRow | undefined> {
    const { rows } = await this.pool.query<StoredRow>(
      `SELECT ${COLUMNS} FROM profile_version WHERE user_id = $1 AND version = $2`,
      [userId, version],
    );
    return rows[0];
  }

  async versions(userId: string) {
    const { rows } = await this.pool.query<{
      version: number;
      createdAt: Date;
      name: string;
      label: string | null;
    }>(
      `SELECT version, created_at AS "createdAt", data->'basics'->>'name' AS name, data->'basics'->>'label' AS label
       FROM profile_version WHERE user_id = $1 ORDER BY version DESC`,
      [userId],
    );
    return rows;
  }

  /**
   * Nouvelle version, sauf si le profil est identique à la dernière (aucune version inutile). Le numéro
   * est calculé dans l'instruction ; la contrainte d'unicité protège deux enregistrements simultanés.
   */
  async save(userId: string, profile: Profile): Promise<{ row: StoredRow; created: boolean }> {
    // Égalité jsonb : indépendante de l'ordre des clés, contrairement à une comparaison de textes.
    const same = await this.pool.query<StoredRow>(
      `SELECT ${COLUMNS} FROM (
         SELECT * FROM profile_version WHERE user_id = $1 ORDER BY version DESC LIMIT 1
       ) last WHERE data = $2::jsonb`,
      [userId, JSON.stringify(profile)],
    );
    if (same.rows[0]) return { row: same.rows[0], created: false };
    const { rows } = await this.pool.query<StoredRow>(
      `INSERT INTO profile_version (user_id, version, data, schema_version)
       SELECT $1, coalesce(max(version), 0) + 1, $2, $3 FROM profile_version WHERE user_id = $1
       RETURNING ${COLUMNS}`,
      [userId, JSON.stringify(profile), SCHEMA_VERSION],
    );
    return { row: rows[0]!, created: true };
  }

  /** Effacement de toutes les versions (candidat, ou suppression distribuée). */
  async deleteUser(userId: string): Promise<number> {
    const { rowCount } = await this.pool.query("DELETE FROM profile_version WHERE user_id = $1", [userId]);
    return rowCount ?? 0;
  }

  async exportUser(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT version, data, schema_version, created_at FROM profile_version WHERE user_id = $1 ORDER BY version`,
      [userId],
    );
    return { profils: rows };
  }

  /** Données d'invité de plus de 24 h, et usage LLM de plus de 13 mois (ADR 0019, point 5). */
  async purge(): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM profile_version WHERE user_id LIKE 'guest\\_%' AND created_at < now() - interval '24 hours'`,
    );
    await this.pool.query("DELETE FROM llm_usage WHERE at < now() - interval '13 months'");
    return rowCount ?? 0;
  }

  async stats() {
    const { rows } = await this.pool.query<{
      profiles: number;
      versions: number;
      guests: number;
      updated7d: number;
    }>(
      `SELECT count(DISTINCT user_id) FILTER (WHERE user_id NOT LIKE 'guest\\_%')::int AS profiles,
         count(*)::int AS versions,
         count(DISTINCT user_id) FILTER (WHERE user_id LIKE 'guest\\_%')::int AS guests,
         count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS "updated7d"
       FROM profile_version`,
    );
    return rows[0]!;
  }
}
