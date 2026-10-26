import { randomUUID } from "node:crypto";
import { BudgetedProvider, DemoProvider, memoryUsageStore, ScriptedProvider } from "@attesta/llm-client";
import { ImportResult, ServiceStats, StoredProfile, type ImportedProfile } from "@attesta/shared-schemas";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db.js";
import { ProfileStore } from "../src/store.js";
import { leaProfile, tokens } from "./fixtures.js";
import { testLogger } from "./helpers.js";
import { minimalPdf } from "./pdf.js";
import { createTestDatabase } from "./pg.js";

const db = await createTestDatabase("profiles");
const t = await tokens();

const extracted: ImportedProfile = {
  basics: {
    name: "Sam Durand",
    label: "Développeur",
    email: null,
    phone: null,
    city: "Lyon",
    countryCode: "FR",
    url: null,
    summary: null,
  },
  work: [
    {
      name: "ACME",
      position: "Développeur",
      location: null,
      startDate: "2021",
      endDate: null,
      summary: null,
      highlights: ["Refonte du site vitrine en 2021", "Pilotage d'une équipe de 8 personnes"],
    },
  ],
  education: [],
  skills: [{ name: "PHP", keywords: ["Symfony", "Laravel"] }],
  languages: [],
};

const cvPdf = minimalPdf([
  "Sam Durand",
  "Développeur chez ACME, Lyon",
  "Refonte du site vitrine en 2021",
  "Compétences : PHP, Symfony",
]);

describe.skipIf(!db)("service profiles (intégration PostgreSQL)", () => {
  let pool: pg.Pool;
  let store: ProfileStore;
  const userId = randomUUID();

  beforeAll(async () => {
    await migrate(db!.url);
    pool = new pg.Pool({ connectionString: db!.url, max: 3 });
    store = new ProfileStore(pool);
  });
  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });
  beforeEach(() => pool.query("TRUNCATE profile_version, llm_usage, profile_evidence"));

  const app = (llm?: ConstructorParameters<typeof BudgetedProvider>[0]) => {
    const log = testLogger();
    const usage = memoryUsageStore();
    const a = createApp({
      ...log,
      readiness: {},
      store,
      verifier: t.verifier,
      llm: llm && new BudgetedProvider(llm, { service: "profiles", store: usage, monthlyBudgetEur: 2 }),
      evidenceKey: Buffer.alloc(32, 7),
    });
    return Object.assign(a, { lines: log.lines, usage });
  };

  describe("profil versionné", () => {
    it("enregistre une version, la relit, et n'en crée pas si rien ne change", async () => {
      const token = await t.user(userId);
      const first = await request(app())
        .put("/v1/profiles/me")
        .auth(token, { type: "bearer" })
        .send({ profile: leaProfile });
      expect(first.status).toBe(201);
      expect(StoredProfile.parse(first.body).version).toBe(1);
      const same = await request(app())
        .put("/v1/profiles/me")
        .auth(token, { type: "bearer" })
        .send({ profile: leaProfile });
      expect(same.status).toBe(200);
      expect(same.body.version).toBe(1);
      const changed = { ...leaProfile, basics: { ...leaProfile.basics, label: "Lead back-end" } };
      const second = await request(app())
        .put("/v1/profiles/me")
        .auth(token, { type: "bearer" })
        .send({ profile: changed });
      expect(second.body.version).toBe(2);
      const got = await request(app()).get("/v1/profiles/me").auth(token, { type: "bearer" });
      expect(got.body.profile.basics.label).toBe("Lead back-end");
    });

    it("liste l'historique et relit une version passée", async () => {
      const token = await t.user(userId);
      await store.save(userId, StoredProfile.shape.profile.parse(leaProfile));
      await store.save(userId, StoredProfile.shape.profile.parse({ ...leaProfile, skills: [] }));
      const list = await request(app()).get("/v1/profiles/me/versions").auth(token, { type: "bearer" });
      expect(list.body.map((v: { version: number }) => v.version)).toEqual([2, 1]);
      expect(list.body[0].label).toBe("Léa Martin · Développeuse back-end");
      const v1 = await request(app()).get("/v1/profiles/me/versions/1").auth(token, { type: "bearer" });
      expect(v1.body.profile.skills).toHaveLength(1);
      expect(
        (await request(app()).get("/v1/profiles/me/versions/9").auth(token, { type: "bearer" })).status,
      ).toBe(404);
    });

    it("refuse un profil invalide, avec les champs en cause en français", async () => {
      const token = await t.user(userId);
      const bad = {
        ...leaProfile,
        work: [{ ...leaProfile.work![0]!, startDate: "mars 2021", endDate: "2020" }],
      };
      const res = await request(app())
        .put("/v1/profiles/me")
        .auth(token, { type: "bearer" })
        .send({ profile: bad });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            champ: "profile.work.0.startDate",
            message: expect.stringMatching(/AAAA/),
          }),
        ]),
      );
    });

    it("cloisonne les profils par utilisateur, et accepte l'invité", async () => {
      await store.save(userId, StoredProfile.shape.profile.parse(leaProfile));
      const other = await t.user(randomUUID());
      expect((await request(app()).get("/v1/profiles/me").auth(other, { type: "bearer" })).status).toBe(404);
      const guest = await t.user(`guest_${randomUUID()}`, "guest");
      expect(
        (
          await request(app())
            .put("/v1/profiles/me")
            .auth(guest, { type: "bearer" })
            .send({ profile: leaProfile })
        ).status,
      ).toBe(201);
    });

    it("efface toutes les versions à la demande", async () => {
      const token = await t.user(userId);
      await store.save(userId, StoredProfile.shape.profile.parse(leaProfile));
      await request(app()).delete("/v1/profiles/me").auth(token, { type: "bearer" }).expect(204);
      expect((await request(app()).get("/v1/profiles/me").auth(token, { type: "bearer" })).status).toBe(404);
    });

    it("exige un jeton d'utilisateur", async () => {
      expect((await request(app()).get("/v1/profiles/me")).status).toBe(401);
      const service = await t.service("users:delete");
      expect((await request(app()).get("/v1/profiles/me").auth(service, { type: "bearer" })).status).toBe(
        403,
      );
    });
  });

  describe("import de CV PDF", () => {
    it("sans modèle réel (démonstration), extrait le profil par règles (ADR 0038)", async () => {
      const token = await t.user(userId);
      const res = await request(app(new DemoProvider()))
        .post("/v1/profiles/import")
        .auth(token, { type: "bearer" })
        .attach("cv", Buffer.from(cvPdf), "cv.pdf");
      expect(res.status).toBe(200);
      const result = ImportResult.parse(res.body);
      expect(result.method).toBe("regles");
      expect(await store.latest(userId)).toBeUndefined();
    });

    it("pré-remplit le profil et écarte ce qui n'est pas dans le PDF", async () => {
      const token = await t.user(userId);
      const llm = new ScriptedProvider({ "extraction-cv": [{ data: extracted }] });
      const a = app(llm);
      const res = await request(a)
        .post("/v1/profiles/import")
        .auth(token, { type: "bearer" })
        .attach("cv", Buffer.from(cvPdf), "cv.pdf");
      expect(res.status).toBe(200);
      const result = ImportResult.parse(res.body);
      expect(result.profile.work[0]!.highlights).toEqual(["Refonte du site vitrine en 2021"]);
      expect(result.profile.skills).toEqual([{ name: "PHP", keywords: ["Symfony"] }]);
      expect(result.dropped).toBe(2);
      // Le texte part au modèle comme donnée balisée, et rien n'est enregistré.
      expect(llm.requests[0]!.messages[0]!.content).toMatch(/^<cv>\n/);
      expect(llm.requests[0]!.messages[0]!.content).toContain("Refonte du site vitrine");
      expect(await store.latest(userId)).toBeUndefined();
      expect(a.usage.entries).toHaveLength(1);
      expect(JSON.stringify(a.lines)).not.toContain("Sam");
    });

    it("refuse un fichier qui n'est pas un PDF, ou un import sans fichier", async () => {
      const token = await t.user(userId);
      const llm = new ScriptedProvider({});
      const fake = await request(app(llm))
        .post("/v1/profiles/import")
        .auth(token, { type: "bearer" })
        .attach("cv", Buffer.from("MZ exécutable"), "cv.pdf");
      expect(fake.status).toBe(400);
      expect(fake.body.title).toMatch(/PDF valide/);
      const none = await request(app(llm)).post("/v1/profiles/import").auth(token, { type: "bearer" });
      expect(none.status).toBe(400);
    });

    it("bascule sur l'extraction par règles si le modèle échoue", async () => {
      const token = await t.user(userId);
      const llm = new ScriptedProvider({ "extraction-cv": [{ error: new Error("panne") }] });
      const res = await request(app(llm))
        .post("/v1/profiles/import")
        .auth(token, { type: "bearer" })
        .attach("cv", Buffer.from(cvPdf), "cv.pdf");
      expect(res.status).toBe(200);
      expect(ImportResult.parse(res.body).method).toBe("regles");
    });
  });

  describe("interne et RGPD", () => {
    it("sert le profil courant au jeton relayé, et celui d'un utilisateur au seul jeton profiles:read", async () => {
      await store.save(userId, StoredProfile.shape.profile.parse(leaProfile));
      const token = await t.user(userId);
      expect(
        (await request(app()).get("/internal/v1/profiles/me").auth(token, { type: "bearer" })).body.version,
      ).toBe(1);
      const read = await t.service("profiles:read");
      expect(
        (await request(app()).get(`/internal/v1/users/${userId}/profile`).auth(read, { type: "bearer" }))
          .status,
      ).toBe(200);
      expect(
        (await request(app()).get(`/internal/v1/users/${userId}/profile`).auth(token, { type: "bearer" }))
          .status,
      ).toBe(403);
    });

    it("exporte puis efface les données d'un utilisateur, de façon idempotente", async () => {
      await store.save(userId, StoredProfile.shape.profile.parse(leaProfile));
      const exp = await request(app())
        .get(`/internal/v1/users/${userId}/export`)
        .auth(await t.service("users:export"), { type: "bearer" });
      expect(exp.body).toMatchObject({
        service: "profiles",
        data: { profils: [expect.objectContaining({ version: 1 })] },
      });
      const del = await t.service("users:delete");
      await request(app()).delete(`/internal/v1/users/${userId}`).auth(del, { type: "bearer" }).expect(204);
      await request(app()).delete(`/internal/v1/users/${userId}`).auth(del, { type: "bearer" }).expect(204);
      expect(await store.latest(userId)).toBeUndefined();
    });

    it("purge les profils d'invité de plus de 24 h", async () => {
      const guest = `guest_${randomUUID()}`;
      await store.save(guest, StoredProfile.shape.profile.parse(leaProfile));
      await store.save(userId, StoredProfile.shape.profile.parse(leaProfile));
      await pool.query("UPDATE profile_version SET created_at = now() - interval '25 hours'");
      expect(await store.purge()).toBe(1);
      expect(await store.latest(userId)).toBeDefined();
    });

    it("donne à l'administrateur des compteurs et la consommation du LLM", async () => {
      await store.save(userId, StoredProfile.shape.profile.parse(leaProfile));
      const admin = await t.user(randomUUID(), "admin");
      const res = await request(app(new DemoProvider()))
        .get("/v1/admin/stats")
        .auth(admin, { type: "bearer" });
      const stats = ServiceStats.parse(res.body);
      expect(stats.counters).toMatchObject({ profiles: 1, versions: 1 });
      expect(stats.llm).toMatchObject({ service: "profiles", budgetEur: 2 });
      const candidate = await t.user(userId);
      expect((await request(app()).get("/v1/admin/stats").auth(candidate, { type: "bearer" })).status).toBe(
        403,
      );
    });
  });
});
