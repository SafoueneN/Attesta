import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LOCK_TIMEOUT_MS, lockTestDatabase } from "../../../test-support/db-lock.js";
import { createLogger, loadConfig } from "@attesta/shared";
import { createApp } from "../src/app.js";
import { pgUsageRecorder } from "@attesta/jobwatch";
import { MemoryIaQuota, PgIaQuota, startMaintenance } from "../src/stores.js";
import { csrfFrom, FakeRenderer, submit, validBasics, validParcours } from "./helpers.js";

/**
 * Tests d'intégration sur un vrai PostgreSQL migré (`npm run db:migrate`).
 * Lancés en CI (service PostgreSQL) ; ignorés si TEST_DATABASE_URL est absent.
 */
const url = process.env.TEST_DATABASE_URL;
const secret = "s".repeat(32);

// En CI, ces tests ne doivent jamais être ignorés en silence.
if (process.env.CI && !url) throw new Error("TEST_DATABASE_URL est requis en CI");

describe.skipIf(!url)("PostgreSQL : état partagé entre instances", () => {
  const pool = new pg.Pool({ connectionString: url });
  const logger = createLogger("silent");
  let unlock: () => Promise<void> = async () => {};
  beforeAll(async () => {
    unlock = await lockTestDatabase(url!);
  }, LOCK_TIMEOUT_MS);
  afterAll(async () => {
    await pool.end();
    await unlock();
  });
  beforeEach(() => pool.query("TRUNCATE ia_quota, rate_limit, llm_usage, session"));

  const instance = (limits?: { general: number; export: number; generation?: number }) =>
    createApp({
      config: loadConfig({
        SESSION_SECRET: secret,
        SESSION_STORE: "postgres",
        DATABASE_URL: url,
        NODE_ENV: "test",
      }),
      logger,
      renderer: new FakeRenderer(),
      pool,
      limits,
    });

  it("verrou atomique : sur 10 réservations simultanées, une seule réussit", async () => {
    const quota = new PgIaQuota(pool, secret);

    const results = await Promise.all(Array.from({ length: 10 }, () => quota.reserve("session-a", 5)));

    expect(results.filter((r) => r.status === "ok")).toHaveLength(1);
    expect(results.filter((r) => r.status === "busy")).toHaveLength(9);
  });

  it("quota quotidien appliqué après libération du verrou", async () => {
    const quota = new PgIaQuota(pool, secret);

    const outcomes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const reservation = await quota.reserve("session-b", 2);
      outcomes.push(reservation.status);
      if (reservation.status === "ok") await quota.release("session-b", reservation.token);
    }

    expect(outcomes).toEqual(["ok", "ok", "quota"]);
  });

  it("se comporte comme l'implémentation mémoire (même contrat)", async () => {
    for (const quota of [new PgIaQuota(pool, secret), new MemoryIaQuota()]) {
      const first = await quota.reserve("session-c", 1);
      expect(first.status).toBe("ok");
      expect((await quota.reserve("session-c", 1)).status).toBe("busy");
      if (first.status === "ok") await quota.release("session-c", first.token);
      expect((await quota.reserve("session-c", 1)).status).toBe("quota");
    }
  });

  it("une requête ne peut pas lever le verrou posé par une autre", async () => {
    for (const quota of [new PgIaQuota(pool, secret), new MemoryIaQuota()]) {
      const holder = await quota.reserve("session-d", 5);

      await quota.release("session-d", "jeton-d-une-autre-requete");

      expect(holder.status).toBe("ok");
      expect((await quota.reserve("session-d", 5)).status).toBe("busy");
    }
  });

  it("ne stocke ni identifiant de session ni IP en clair", async () => {
    await new PgIaQuota(pool, secret).reserve("identifiant-de-session-brut", 5);
    await request(instance()).get("/");

    const dump = JSON.stringify((await pool.query("SELECT * FROM ia_quota, rate_limit")).rows);
    expect(dump).not.toContain("identifiant-de-session-brut");
    expect(dump).not.toMatch(/127\.0\.0\.1|::1|::ffff/);
  });

  it("limiteur partagé : deux instances appliquent le même plafond", async () => {
    const limits = { general: 1000, export: 1000, generation: 1 };
    const [a, b] = [instance(limits), instance(limits)];
    const agentA = request.agent(a);
    const page = await agentA.get("/cv/etape/1");

    const first = await agentA
      .post("/cv/generer")
      .type("form")
      .send({ _csrf: csrfFrom(page.text) });
    // Même IP, autre instance : le compteur est commun.
    const second = await request(b).post("/cv/generer");

    expect(first.status).toBe(303);
    expect(second.status).toBe(429);
  });

  it("conserve les sessions en base et les supprime à l'effacement", async () => {
    const agent = request.agent(instance());
    await submit(agent, 1, { ...validBasics, action: "next" });
    await submit(agent, 2, { ...validParcours, action: "next" });
    const before = await pool.query("SELECT count(*)::int AS n FROM session");
    const page = await agent.get("/cv/etape/1");

    await agent
      .post("/cv/effacer")
      .type("form")
      .send({ _csrf: csrfFrom(page.text) });
    const after = await pool.query("SELECT count(*)::int AS n FROM session");

    expect(before.rows[0].n).toBe(1);
    expect(after.rows[0].n).toBe(0);
  });

  it("enregistre le coût des appels LLM, sans contenu", async () => {
    pgUsageRecorder(
      pool,
      logger,
    )({
      step: "redaction",
      model: "claude-opus-5-5",
      inputTokens: 4500,
      outputTokens: 3000,
      costUsd: 0.078,
      latencyMs: 21000,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const { rows } = await pool.query("SELECT step, model, cost_usd FROM llm_usage");
    expect(rows).toEqual([{ step: "redaction", model: "claude-opus-5-5", cost_usd: "0.078000" }]);
  });

  it("purge les quotas anciens, les compteurs expirés et l'usage de plus de 13 mois", async () => {
    await pool.query(
      "INSERT INTO ia_quota VALUES ('vieux', current_date - 3, 1, NULL), ('recent', current_date, 1, NULL)",
    );
    await pool.query("INSERT INTO rate_limit VALUES ('expire', 1, now() - interval '2 hours')");
    await pool.query(
      "INSERT INTO llm_usage (at, step, model, input_tokens, output_tokens, cost_usd, latency_ms) VALUES (now() - interval '14 months', 'redaction', 'm', 1, 1, 0, 1)",
    );

    const stop = startMaintenance(pool, logger, 60_000);
    await new Promise((resolve) => setTimeout(resolve, 300));
    stop();

    expect((await pool.query("SELECT subject FROM ia_quota")).rows).toEqual([{ subject: "recent" }]);
    expect((await pool.query("SELECT count(*)::int AS n FROM rate_limit")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM llm_usage")).rows[0].n).toBe(0);
  });
});
