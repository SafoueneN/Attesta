import { SCHEMA_VERSION, type Profile } from "@attesta/shared-schemas";
import type pg from "pg";

export interface StoredRow {
  version: number;
  createdAt: Date;
  schemaVersion: string;
  profile: Profile;
}

const COLUMNS = `version, created_at AS "createdAt", schema_version AS "schemaVersion", data AS profile`;

export interface EvidenceRow {
  id: string;
  target: string;
  kind: string;
  label: string;
  fileName: string;
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
  sizeBytes: number;
  anchor: string;
  createdAt: Date;
}

const EVIDENCE_COLUMNS = `id, target, kind, label, file_name AS "fileName", mime_type AS "mimeType",
  size_bytes AS "sizeBytes", anchor, created_at AS "createdAt"`;

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

  /** Effacement de toutes les versions et de toutes les pièces (candidat, ou suppression distribuée). */
  async deleteUser(userId: string): Promise<number> {
    await this.pool.query("DELETE FROM profile_evidence WHERE user_id = $1", [userId]);
    await this.pool.query("DELETE FROM profile_photo WHERE user_id = $1", [userId]);
    const { rowCount } = await this.pool.query("DELETE FROM profile_version WHERE user_id = $1", [userId]);
    return rowCount ?? 0;
  }

  async exportUser(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT version, data, schema_version, created_at FROM profile_version WHERE user_id = $1 ORDER BY version`,
      [userId],
    );
    // Pièces : métadonnées seulement ; chaque fichier se télécharge depuis « Mes justificatifs » (ADR 0027).
    const { rows: pieces } = await this.pool.query(
      `SELECT ${EVIDENCE_COLUMNS} FROM profile_evidence WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    );
    // Photo : métadonnées seulement ; elle se télécharge depuis le profil (ADR 0036).
    const { rows: photo } = await this.pool.query(
      "SELECT mime_type, size_bytes, updated_at FROM profile_photo WHERE user_id = $1",
      [userId],
    );
    return { profils: rows, justificatifs: pieces, photo: photo[0] ?? null };
  }

  // --- Photo du CV (ADR 0036) -------------------------------------------------------------------------

  async setPhoto(
    userId: string,
    photo: { mimeType: string; sizeBytes: number; iv: Buffer; tag: Buffer; content: Buffer },
  ): Promise<{ mimeType: string; sizeBytes: number; updatedAt: Date }> {
    const { rows } = await this.pool.query<{ mimeType: string; sizeBytes: number; updatedAt: Date }>(
      `INSERT INTO profile_photo (user_id, mime_type, size_bytes, iv, tag, content) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET mime_type = EXCLUDED.mime_type, size_bytes = EXCLUDED.size_bytes,
         iv = EXCLUDED.iv, tag = EXCLUDED.tag, content = EXCLUDED.content, updated_at = now()
       RETURNING mime_type AS "mimeType", size_bytes AS "sizeBytes", updated_at AS "updatedAt"`,
      [userId, photo.mimeType, photo.sizeBytes, photo.iv, photo.tag, photo.content],
    );
    return rows[0]!;
  }

  async photo(userId: string) {
    const { rows } = await this.pool.query<{
      mimeType: string;
      sizeBytes: number;
      updatedAt: Date;
      iv: Buffer;
      tag: Buffer;
      content: Buffer;
    }>(
      `SELECT mime_type AS "mimeType", size_bytes AS "sizeBytes", updated_at AS "updatedAt", iv, tag, content
       FROM profile_photo WHERE user_id = $1`,
      [userId],
    );
    return rows[0];
  }

  async deletePhoto(userId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query("DELETE FROM profile_photo WHERE user_id = $1", [userId]);
    return (rowCount ?? 0) > 0;
  }

  // --- Pièces justificatives (ADR 0027) ---------------------------------------------------------------

  async evidence(userId: string): Promise<EvidenceRow[]> {
    const { rows } = await this.pool.query<EvidenceRow>(
      `SELECT ${EVIDENCE_COLUMNS} FROM profile_evidence WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    );
    return rows;
  }

  async evidenceCount(userId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM profile_evidence WHERE user_id = $1",
      [userId],
    );
    return rows[0]!.n;
  }

  async addEvidence(
    userId: string,
    piece: Omit<EvidenceRow, "id" | "createdAt"> & { iv: Buffer; tag: Buffer; content: Buffer },
  ): Promise<EvidenceRow> {
    const { rows } = await this.pool.query<EvidenceRow>(
      `INSERT INTO profile_evidence (user_id, target, kind, label, file_name, mime_type, size_bytes, anchor, iv, tag, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${EVIDENCE_COLUMNS}`,
      [
        userId,
        piece.target,
        piece.kind,
        piece.label,
        piece.fileName,
        piece.mimeType,
        piece.sizeBytes,
        piece.anchor,
        piece.iv,
        piece.tag,
        piece.content,
      ],
    );
    return rows[0]!;
  }

  /** Pièce et contenu chiffré, seulement si elle appartient à l'utilisateur. */
  async evidenceFile(userId: string, id: string) {
    const { rows } = await this.pool.query<EvidenceRow & { iv: Buffer; tag: Buffer; content: Buffer }>(
      `SELECT ${EVIDENCE_COLUMNS}, iv, tag, content FROM profile_evidence WHERE user_id = $1 AND id = $2`,
      [userId, id],
    );
    return rows[0];
  }

  async deleteEvidence(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "DELETE FROM profile_evidence WHERE user_id = $1 AND id = $2",
      [userId, id],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Données d'invité de plus de 24 h, et usage LLM de plus de 13 mois (ADR 0019, point 5). */
  async purge(): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM profile_version WHERE user_id LIKE 'guest\\_%' AND created_at < now() - interval '24 hours'`,
    );
    await this.pool.query("DELETE FROM llm_usage WHERE at < now() - interval '13 months'");
    await this.pool.query("DELETE FROM assistant_vote WHERE at < now() - interval '13 months'");
    return rowCount ?? 0;
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
