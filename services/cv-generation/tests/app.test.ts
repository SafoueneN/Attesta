import { randomUUID } from "node:crypto";
import {
  BudgetedProvider,
  DemoProvider,
  memoryUsageStore,
  ScriptedProvider,
  type LlmProvider,
} from "@attesta/llm-client";
import {
  Generation,
  GenerationEvent,
  ServiceStats,
  type StoredOffer,
  type StoredProfile,
} from "@attesta/shared-schemas";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db.js";
import { demoHandlers } from "../src/pipeline.js";
import { GenerationStore, IaQuota } from "../src/store.js";
import type { Upstreams } from "../src/upstreams.js";
import { analysis, honestDraft, inventedDraft, lea, offerText } from "./fixtures.js";
import { testLogger } from "./helpers.js";
import { createTestDatabase } from "./pg.js";
import { tokens } from "./tokens.js";

const db = await createTestDatabase("cvgen");
const t = await tokens();
const offerId = randomUUID();

const storedProfile: StoredProfile = {
  version: 3,
  createdAt: new Date().toISOString(),
  schemaVersion: "1.0.0",
  profile: lea,
};
const storedOffer: StoredOffer = {
  id: offerId,
  title: analysis.title,
  company: null,
  createdAt: new Date().toISOString(),
  sourceUrl: null,
  rawText: offerText,
  analysis,
  providerKind: "ia",
  postingId: null,
};

/** Services amont factices : profil et offre, avec le jeton reçu (doit être celui de l'utilisateur). */
function fakeUpstreams(options: { profile?: boolean } = {}): Upstreams & { tokens: string[] } {
  const seen: string[] = [];
  return {
    tokens: seen,
    async profile(token) {
      seen.push(token);
      return options.profile === false ? undefined : storedProfile;
    },
    async offer(token, id) {
      seen.push(token);
      return id === offerId ? storedOffer : undefined;
    },
  };
}

/** Événements d'un flux SSE (« data: {...} »). */
const events = (text: string) =>
  text
    .split("\n\n")
    .filter((block) => block.startsWith("data: "))
    .map((block) => GenerationEvent.parse(JSON.parse(block.slice(6))));

describe.skipIf(!db)("service cv-generation (intégration PostgreSQL)", () => {
  let pool: pg.Pool;
  let store: GenerationStore;
  const userId = randomUUID();

  beforeAll(async () => {
    await migrate(db!.url);
    pool = new pg.Pool({ connectionString: db!.url, max: 3 });
    store = new GenerationStore(pool);
  });
  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });
  beforeEach(() => pool.query("TRUNCATE generation, ia_quota, llm_usage"));

  const app = (options: { llm?: LlmProvider; upstreams?: Upstreams; dailyQuota?: number } = {}) => {
    const log = testLogger();
    const llm = new BudgetedProvider(options.llm ?? new DemoProvider(demoHandlers), {
      service: "cv-generation",
      store: memoryUsageStore(),
      monthlyBudgetEur: 9,
    });
    return Object.assign(
      createApp({
        ...log,
        readiness: {},
        store,
        quota: new IaQuota(pool, "secret-de-quota-test"),
        upstreams: options.upstreams ?? fakeUpstreams(),
        verifier: t.verifier,
        llm,
        maxCostUsd: 1,
        dailyQuota: options.dailyQuota ?? 20,
      }),
      { lines: log.lines },
    );
  };

  const generate = async (a = app(), token?: string) =>
    request(a)
      .post("/v1/generations")
      .auth(token ?? (await t.user(userId)), { type: "bearer" })
      .send({ offerId });

  describe("génération", () => {
    it("génère un CV vérifié, en relayant le jeton de l'utilisateur", async () => {
      const upstreams = fakeUpstreams();
      const token = await t.user(userId);
      const res = await generate(
        app({ llm: new ScriptedProvider({ redaction: [{ data: honestDraft }] }), upstreams }),
        token,
      );
      expect(res.status).toBe(201);
      const g = Generation.parse(res.body);
      expect(g).toMatchObject({
        status: "ok",
        offerTitle: analysis.title,
        profileVersion: 3,
        providerKind: "ia",
      });
      expect(g.report!.score).toBe(1);
      expect(g.cv!.missingKeywords).toEqual(["Kubernetes"]);
      expect(upstreams.tokens).toEqual([token, token]);
    });

    it("retire les lignes inventées et garde leur trace avec les raisons", async () => {
      const res = await generate(
        app({ llm: new ScriptedProvider({ redaction: [{ data: inventedDraft }] }) }),
      );
      const g = Generation.parse(res.body);
      expect(g.removed).toHaveLength(4);
      expect(g.removed.flatMap((r) => r.issues.map((i) => i.kind))).toEqual(
        expect.arrayContaining(["number", "entity", "skill", "unresolved-source"]),
      );
      expect(JSON.stringify(g.cv)).not.toContain("60 %");
    });

    it("diffuse la progression en SSE, puis l'identifiant de la génération", async () => {
      const res = await request(app())
        .post("/v1/generations")
        .auth(await t.user(userId), { type: "bearer" })
        .set("Accept", "text/event-stream")
        .send({ offerId });
      expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
      const received = events(res.text);
      expect(received.map((e) => e.type)).toEqual(["progress", "progress", "progress", "done"]);
      expect(received[0]).toMatchObject({ message: expect.stringMatching(/mots-clés repérés/) });
      const done = received.at(-1) as { generationId: string };
      expect((await store.get(userId, done.generationId))?.status).toBe("ok");
    });

    it("enregistre le mode dégradé avec un message clair, sans CV", async () => {
      const res = await generate(
        app({
          llm: new ScriptedProvider({
            redaction: [{ error: new (await import("@attesta/llm-client")).LlmUnavailableError("503") }],
          }),
        }),
      );
      const g = Generation.parse(res.body);
      expect(g).toMatchObject({ status: "degraded", degradedReason: "indisponible", cv: null });
      expect(g.message).toMatch(/indisponible/);
    });

    it("exige un profil enregistré et une offre existante", async () => {
      const noProfile = await generate(app({ upstreams: fakeUpstreams({ profile: false }) }));
      expect(noProfile.status).toBe(409);
      expect(noProfile.body.title).toMatch(/Enregistrez d'abord votre profil/);
      const unknown = await request(app())
        .post("/v1/generations")
        .auth(await t.user(userId), { type: "bearer" })
        .send({ offerId: randomUUID() });
      expect(unknown.status).toBe(404);
    });

    it("applique le quota quotidien par utilisateur", async () => {
      const a = app({ dailyQuota: 1 });
      expect((await generate(a)).status).toBe(201);
      const res = await generate(a);
      expect(res.status).toBe(429);
      expect(res.body.title).toMatch(/Limite de 1 générations par jour/);
      // Un autre utilisateur n'est pas concerné.
      expect((await generate(a, await t.user(randomUUID()))).status).toBe(201);
    });

    it("n'écrit dans le journal ni nom, ni texte de CV, ni offre", async () => {
      const a = app();
      await generate(a);
      const text = JSON.stringify(a.lines);
      for (const secret of ["Léa", "Transports Rhône", "Réduction de 40", "Kubernetes est un plus"]) {
        expect(text).not.toContain(secret);
      }
      expect(a.lines.some((l) => l.event === "generation")).toBe(true);
    });
  });

  describe("relecture et corrections", () => {
    it("liste, relit et supprime les générations de l'utilisateur seulement", async () => {
      const token = await t.user(userId);
      const created = Generation.parse((await generate(app(), token)).body);
      const list = await request(app()).get("/v1/generations").auth(token, { type: "bearer" });
      expect(list.body).toEqual([
        expect.objectContaining({ id: created.id, score: 1, providerKind: "demo" }),
      ]);
      const other = await t.user(randomUUID());
      expect(
        (await request(app()).get(`/v1/generations/${created.id}`).auth(other, { type: "bearer" })).status,
      ).toBe(404);
      await request(app())
        .delete(`/v1/generations/${created.id}`)
        .auth(token, { type: "bearer" })
        .expect(204);
      expect(
        (await request(app()).get(`/v1/generations/${created.id}`).auth(token, { type: "bearer" })).status,
      ).toBe(404);
    });

    it("applique une correction et un retrait, recalcule le score et protège contre l'écrasement", async () => {
      const token = await t.user(userId);
      const g = Generation.parse(
        (await generate(app({ llm: new ScriptedProvider({ redaction: [{ data: honestDraft }] }) }), token))
          .body,
      );
      const patch = (revision: number, lines: object[]) =>
        request(app())
          .patch(`/v1/generations/${g.id}/lines`)
          .auth(token, { type: "bearer" })
          .send({ revision, lines });

      const res = await patch(0, [
        { path: "/work/0/highlights/0", text: "Réduction de 45 % du temps de réponse" },
        { path: "/summary/0", remove: true },
      ]);
      expect(res.status).toBe(200);
      const corrected = Generation.parse(res.body);
      expect(corrected.revision).toBe(1);
      expect(corrected.cv!.summary).toEqual([]);
      expect(corrected.edited).toEqual(["/work/0/highlights/0"]);
      // Chiffre absent de la source : la ligne reste (le candidat décide), mais l'écart est signalé.
      expect(corrected.report!.score).toBeLessThan(1);
      expect(corrected.cv!.work[0]!.highlights[0]!.text).toContain("45 %");

      const stale = await patch(0, [{ path: "/headline", remove: true }]);
      expect(stale.status).toBe(409);
      expect(stale.body.title).toMatch(/version précédente/);
    });

    it("refuse un chemin de ligne invalide", async () => {
      const token = await t.user(userId);
      const g = Generation.parse((await generate(app(), token)).body);
      const res = await request(app())
        .patch(`/v1/generations/${g.id}/lines`)
        .auth(token, { type: "bearer" })
        .send({ revision: 0, lines: [{ path: "/basics/name", text: "Autre nom" }] });
      expect(res.status).toBe(400);
    });
  });

  describe("interne, RGPD et administration", () => {
    it("ne sert à l'export qu'un CV vérifié", async () => {
      const token = await t.user(userId);
      const ok = Generation.parse((await generate(app(), token)).body);
      expect(
        (await request(app()).get(`/internal/v1/generations/${ok.id}`).auth(token, { type: "bearer" }))
          .status,
      ).toBe(200);
      const degraded = Generation.parse(
        (
          await generate(
            app({
              llm: new ScriptedProvider({
                redaction: [{ error: new (await import("@attesta/llm-client")).LlmRefusalError(null) }],
              }),
            }),
            token,
          )
        ).body,
      );
      const res = await request(app())
        .get(`/internal/v1/generations/${degraded.id}`)
        .auth(token, { type: "bearer" });
      expect(res.status).toBe(409);
    });

    it("exporte puis efface les générations d'un utilisateur ; purge les invités de plus de 24 h", async () => {
      await generate(app());
      const guest = `guest_${randomUUID()}`;
      await generate(app(), await t.user(guest, "guest"));
      const exp = await request(app())
        .get(`/internal/v1/users/${userId}/export`)
        .auth(await t.service("users:export"), { type: "bearer" });
      expect(exp.body.data.generations).toHaveLength(1);
      await request(app())
        .delete(`/internal/v1/users/${userId}`)
        .auth(await t.service("users:delete"), { type: "bearer" })
        .expect(204);
      expect(await store.list(userId)).toEqual([]);
      await pool.query("UPDATE generation SET created_at = now() - interval '25 hours'");
      expect(await store.purge()).toBe(1);
    });

    it("donne à l'administrateur des compteurs et le budget LLM", async () => {
      await generate(app());
      const admin = await t.user(randomUUID(), "admin");
      const stats = ServiceStats.parse(
        (await request(app()).get("/v1/admin/stats").auth(admin, { type: "bearer" })).body,
      );
      expect(stats.counters).toMatchObject({ generations: 1, averageScore: 1 });
      expect(stats.llm).toMatchObject({ service: "cv-generation", budgetEur: 9 });
    });
  });
});
