import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { checkDatabase, createPool } from "../src/db.js";

describe("base du service", () => {
  it("crée un pool nommé d'après le service, sans se connecter tout de suite", async () => {
    const pool = createPool(
      "postgres://attesta_profiles:attesta_profiles-dev-uniquement@localhost:5433/attesta_profiles",
      3,
    );
    expect(pool.options).toMatchObject({ max: 3, application_name: "profiles" });
    expect(pool.totalCount).toBe(0);
    await pool.end();
  });

  it("vérifie la disponibilité par une requête triviale", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await checkDatabase({ query } as unknown as pg.Pool);
    expect(query).toHaveBeenCalledWith("SELECT 1");
  });

  it("propage l'échec de la base à /ready", async () => {
    const query = vi.fn().mockRejectedValue(new Error("connexion refusée"));
    await expect(checkDatabase({ query } as unknown as pg.Pool)).rejects.toThrow("connexion refusée");
  });
});
