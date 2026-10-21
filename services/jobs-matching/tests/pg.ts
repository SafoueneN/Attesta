import { randomBytes } from "node:crypto";
import pg from "pg";

/**
 * Base PostgreSQL jetable pour les tests d'intégration : créée par l'administrateur de la base locale
 * (compose, mot de passe de développement), migrée, puis supprimée. Sans base joignable, `undefined` :
 * les tests d'intégration sont alors ignorés (la CI fournit toujours la base).
 */
const ADMIN_URL =
  process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://attesta:attesta-dev-uniquement@localhost:5433/postgres";

export async function createTestDatabase(
  prefix: string,
): Promise<{ url: string; drop: () => Promise<void> } | undefined> {
  const admin = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await admin.connect();
  } catch {
    return undefined;
  }
  const name = `${prefix}_test_${randomBytes(4).toString("hex")}`;
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  // pgvector, créé par l'administrateur comme le fait db-init (docs/adr/0013, point 3).
  const owner = new pg.Client({ connectionString: url.href });
  await owner.connect();
  await owner.query("CREATE EXTENSION IF NOT EXISTS vector");
  await owner.end();
  return {
    url: url.href,
    drop: async () => {
      const cleanup = new pg.Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await cleanup.end();
    },
  };
}
