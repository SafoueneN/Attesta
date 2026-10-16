import pg from "pg";

/**
 * Les fichiers de tests d'intégration partagent une même base et s'exécutent en
 * parallèle : chacun prend ce verrou consultatif pour toute sa durée, ce qui les
 * sérialise sans ralentir les tests unitaires.
 */
export async function lockTestDatabase(url: string): Promise<() => Promise<void>> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("SELECT pg_advisory_lock(424242)");
  return async () => {
    await client.query("SELECT pg_advisory_unlock(424242)");
    await client.end();
  };
}

/** Attente maximale du verrou : la durée cumulée des autres fichiers d'intégration. */
export const LOCK_TIMEOUT_MS = 300_000;
