import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import pg from "pg";

/** Pool de connexions à la base du service, et à elle seule (ADR 0013). */
export function createPool(connectionString: string, max = 5): pg.Pool {
  return new pg.Pool({ connectionString, max, application_name: "jobs-matching" });
}

/** Vérification de `/ready` : la base répond. */
export async function checkDatabase(pool: pg.Pool): Promise<void> {
  await pool.query("SELECT 1");
}

/** Migrations du service (`migrations/*.sql`), jouées avec son propre rôle avant l'écoute (ADR 0013). */
export async function migrate(databaseUrl: string, log: (message: string) => void = () => undefined) {
  await runner({
    databaseUrl,
    dir: fileURLToPath(new URL("../migrations", import.meta.url)),
    direction: "up",
    migrationsTable: "pgmigrations",
    count: Infinity,
    log,
  });
}
