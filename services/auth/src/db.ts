import pg from "pg";

/** Pool de connexions à la base du service, et à elle seule (ADR 0013). */
export function createPool(connectionString: string, max = 5): pg.Pool {
  return new pg.Pool({ connectionString, max, application_name: "auth" });
}

/** Vérification de `/ready` : la base répond. */
export async function checkDatabase(pool: pg.Pool): Promise<void> {
  await pool.query("SELECT 1");
}
