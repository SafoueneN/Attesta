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
    return rowCount ?? 0;
  }

  async exportUser(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT offer_title, company, tone, greeting, paragraphs, closing, created_at, updated_at
       FROM cover_letter WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    );
    return { lettres: rows };
  }

  async purge(): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM cover_letter WHERE user_id LIKE 'guest\\_%' AND created_at < now() - interval '24 hours'`,
    );
    await this.pool.query("DELETE FROM llm_usage WHERE at < now() - interval '13 months'");
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
