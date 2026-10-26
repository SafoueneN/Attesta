import type { Letter } from "@attesta/shared-schemas";
import type pg from "pg";

type Paragraph = Letter["paragraphs"][number];

export interface LetterRow {
  id: string;
  generationId: string;
  offerTitle: string;
  company: string | null;
  tone: Letter["tone"];
  greeting: string;
  closing: string;
  paragraphs: Paragraph[];
  removed: number;
  providerKind: "ia" | "demo";
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `id, generation_id AS "generationId", offer_title AS "offerTitle", company, tone, greeting, closing,
  paragraphs, removed, provider_kind AS "providerKind", created_at AS "createdAt", updated_at AS "updatedAt"`;

export interface TrackingRow {
  generationId: string;
  offerTitle: string;
  status: "a_envoyer" | "envoyee" | "relancee" | "entretien" | "refus" | "offre";
  sentAt: string | null;
  note: string | null;
  updatedAt: Date;
}

const TRACKING_COLUMNS = `generation_id AS "generationId", offer_title AS "offerTitle", status,
  to_char(sent_at, 'YYYY-MM-DD') AS "sentAt", note, updated_at AS "updatedAt"`;

export class LetterStore {
  constructor(private readonly pool: pg.Pool) {}

  async create(
    userId: string,
    l: Omit<LetterRow, "id" | "createdAt" | "updatedAt">,
    promptVersion: string,
  ): Promise<LetterRow> {
    const { rows } = await this.pool.query<LetterRow>(
      `INSERT INTO cover_letter (user_id, generation_id, offer_title, company, tone, greeting, closing, paragraphs,
         removed, provider_kind, prompt_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${COLUMNS}`,
      [
        userId,
        l.generationId,
        l.offerTitle,
        l.company,
        l.tone,
        l.greeting,
        l.closing,
        JSON.stringify(l.paragraphs),
        l.removed,
        l.providerKind,
        promptVersion,
      ],
    );
    return rows[0]!;
  }

  async get(userId: string, id: string): Promise<LetterRow | undefined> {
    const { rows } = await this.pool.query<LetterRow>(
      `SELECT ${COLUMNS} FROM cover_letter WHERE user_id = $1 AND id = $2`,
      [userId, id],
    );
    return rows[0];
  }

  async list(userId: string): Promise<LetterRow[]> {
    const { rows } = await this.pool.query<LetterRow>(
      `SELECT ${COLUMNS} FROM cover_letter WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId],
    );
    return rows;
  }

  async update(
    userId: string,
    id: string,
    update: { greeting: string; closing: string; paragraphs: Paragraph[] },
  ): Promise<LetterRow | undefined> {
    const { rows } = await this.pool.query<LetterRow>(
      `UPDATE cover_letter SET greeting = $3, closing = $4, paragraphs = $5, updated_at = now()
       WHERE user_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
      [userId, id, update.greeting, update.closing, JSON.stringify(update.paragraphs)],
    );
    return rows[0];
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query("DELETE FROM cover_letter WHERE user_id = $1 AND id = $2", [
      userId,
      id,
    ]);
    return (rowCount ?? 0) > 0;
  }

  async deleteUser(userId: string): Promise<number> {
    const { rowCount } = await this.pool.query("DELETE FROM cover_letter WHERE user_id = $1", [userId]);
    await this.pool.query("DELETE FROM application_text WHERE user_id = $1", [userId]);
    await this.pool.query("DELETE FROM application_tracking WHERE user_id = $1", [userId]);
    await this.pool.query("DELETE FROM cv_share WHERE user_id = $1", [userId]);
    return rowCount ?? 0;
  }

  // --- Rédactrice de candidature (ADR 0029) : historique et suivi, comptes seulement ---------------

  async saveApplicationText(
    userId: string,
    t: { generationId: string; kind: string; question: string | null; text: string },
  ): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO application_text (user_id, generation_id, kind, question, text)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, t.generationId, t.kind, t.question, t.text],
    );
    // L'historique garde les 50 derniers textes par CV.
    await this.pool.query(
      `DELETE FROM application_text WHERE user_id = $1 AND generation_id = $2 AND id NOT IN (
         SELECT id FROM application_text WHERE user_id = $1 AND generation_id = $2
         ORDER BY created_at DESC LIMIT 50)`,
      [userId, t.generationId],
    );
    return rows[0]!.id;
  }

  async applicationHistory(userId: string, generationId: string) {
    const { rows } = await this.pool.query<{
      id: string;
      generationId: string;
      kind: "formulaire" | "linkedin" | "relance" | "remerciement";
      question: string | null;
      text: string;
      createdAt: Date;
    }>(
      `SELECT id, generation_id AS "generationId", kind, question, text, created_at AS "createdAt"
       FROM application_text WHERE user_id = $1 AND generation_id = $2 ORDER BY created_at DESC LIMIT 50`,
      [userId, generationId],
    );
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async deleteApplicationText(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "DELETE FROM application_text WHERE user_id = $1 AND id = $2",
      [userId, id],
    );
    return (rowCount ?? 0) > 0;
  }

  async trackings(userId: string) {
    const { rows } = await this.pool.query<TrackingRow>(
      `SELECT ${TRACKING_COLUMNS} FROM application_tracking WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId],
    );
    return rows;
  }

  async saveTracking(
    userId: string,
    t: {
      generationId: string;
      offerTitle: string;
      status: string;
      sentAt: string | null;
      note: string | null;
    },
  ): Promise<TrackingRow> {
    const { rows } = await this.pool.query<TrackingRow>(
      `INSERT INTO application_tracking (user_id, generation_id, offer_title, status, sent_at, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, generation_id) DO UPDATE SET offer_title = EXCLUDED.offer_title,
         status = EXCLUDED.status, sent_at = EXCLUDED.sent_at, note = EXCLUDED.note, updated_at = now()
       RETURNING ${TRACKING_COLUMNS}`,
      [userId, t.generationId, t.offerTitle, t.status, t.sentAt, t.note],
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

  async voteStats() {
    const { rows } = await this.pool.query<{ role: string; up: number; down: number }>(
      `SELECT role, count(*) FILTER (WHERE vote = 1)::int AS up, count(*) FILTER (WHERE vote = -1)::int AS down
       FROM assistant_vote WHERE at > now() - interval '30 days' GROUP BY role ORDER BY role`,
    );
    return rows;
  }

  // --- CV en ligne (ADR 0042) ------------------------------------------------------------------------

  async createShare(
    userId: string,
    share: { tokenHash: Buffer; generationId: string; offerTitle: string; html: string; days: number },
  ): Promise<ShareRow> {
    const { rows } = await this.pool.query<ShareRow>(
      `INSERT INTO cv_share (user_id, token_hash, generation_id, offer_title, html, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + $6 * interval '1 day')
       RETURNING ${SHARE_COLUMNS}`,
      [userId, share.tokenHash, share.generationId, share.offerTitle, share.html, share.days],
    );
    return rows[0]!;
  }

  async shares(userId: string): Promise<ShareRow[]> {
    const { rows } = await this.pool.query<ShareRow>(
      `SELECT ${SHARE_COLUMNS} FROM cv_share WHERE user_id = $1 AND expires_at > now() ORDER BY created_at DESC`,
      [userId],
    );
    return rows;
  }

  async deleteShare(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query("DELETE FROM cv_share WHERE user_id = $1 AND id = $2", [
      userId,
      id,
    ]);
    return (rowCount ?? 0) > 0;
  }

  /** CV partagé encore valide ; chaque lecture est comptée. */
  async viewShare(tokenHash: Buffer): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ html: string }>(
      `UPDATE cv_share SET views = views + 1, last_viewed_at = now()
       WHERE token_hash = $1 AND expires_at > now() RETURNING html`,
      [tokenHash],
    );
    return rows[0]?.html;
  }

  async exportUser(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT offer_title, company, tone, greeting, paragraphs, closing, created_at, updated_at
       FROM cover_letter WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    );
    const textes = await this.pool.query(
      `SELECT kind, question, text, created_at FROM application_text WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    );
    const suivi = await this.pool.query(
      `SELECT offer_title, status, sent_at, note, updated_at FROM application_tracking WHERE user_id = $1`,
      [userId],
    );
    const partages = await this.pool.query(
      `SELECT offer_title, views, last_viewed_at, created_at, expires_at FROM cv_share WHERE user_id = $1`,
      [userId],
    );
    return {
      lettres: rows,
      textesDeCandidature: textes.rows,
      suiviDesCandidatures: suivi.rows,
      cvEnLigne: partages.rows,
    };
  }

  async purge(): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM cover_letter WHERE user_id LIKE 'guest\\_%' AND created_at < now() - interval '24 hours'`,
    );
    await this.pool.query("DELETE FROM llm_usage WHERE at < now() - interval '13 months'");
    await this.pool.query("DELETE FROM assistant_vote WHERE at < now() - interval '13 months'");
    await this.pool.query("DELETE FROM cv_share WHERE expires_at < now()");
    return rowCount ?? 0;
  }

  async stats() {
    const { rows } = await this.pool.query<Record<string, number>>(
      `SELECT count(*)::int AS letters,
         count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS "letters7d",
         coalesce(sum(removed), 0)::int AS "removedParagraphs"
       FROM cover_letter`,
    );
    return rows[0]!;
  }
}

export interface ShareRow {
  id: string;
  generationId: string | null;
  offerTitle: string;
  views: number;
  lastViewedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
}

const SHARE_COLUMNS = `id, generation_id AS "generationId", offer_title AS "offerTitle", views,
  last_viewed_at AS "lastViewedAt", created_at AS "createdAt", expires_at AS "expiresAt"`;
