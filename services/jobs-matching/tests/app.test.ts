import { randomUUID } from "node:crypto";
import {
  BudgetedProvider,
  DemoProvider,
  LlmUnavailableError,
  memoryUsageStore,
  ScriptedProvider,
  type LlmProvider,
} from "@attesta/llm-client";
import { MatchResponse, Profile, ServiceStats, StoredOffer } from "@attesta/shared-schemas";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db.js";
import { demoHandlers } from "../src/demo.js";
import { HashEmbeddings } from "../src/embeddings.js";
import { embedPending } from "../src/ingestion.js";
import { JobsRepository } from "../src/repository.js";
import type { JobSource, Posting } from "../src/types.js";
import { leaProfile, tokens } from "./fixtures.js";
import { testLogger } from "./helpers.js";
import { createTestDatabase } from "./pg.js";

const db = await createTestDatabase("jobs");
const t = await tokens();
const today = new Date().toISOString().slice(0, 10);

const OFFER =
  "Développeur back-end Node.js (H/F)\nNous recherchons un développeur maîtrisant Node.js, PostgreSQL et Kubernetes pour notre plateforme de réservation.";

const posting = (over: Partial<Posting> = {}): Posting => ({
  source: "essai",
  externalId: randomUUID(),
  title: "Backend-Entwickler Node.js (m/w/d)",
  company: "Beispiel GmbH",
  city: "Berlin",
  country: "DE",
  lat: 52.52,
  lon: 13.405,
  lang: "de",
  workingTime: "plein",
  postedAt: today,
  url: "https://example.org/offre",
  body: "Wir suchen Verstärkung mit Node.js, PostgreSQL und GraphQL für unsere Plattform.",
  salaryMinEur: 55_000,
  salaryMaxEur: 65_000,
  ...over,
});

/** Source factice : renvoie les offres données, une fois par recherche. */
function fakeSource(postings: Posting[]): JobSource & { queries: string[] } {
  const queries: string[] = [];
  return {
    id: "essai",
    countries: ["DE"],
    queries,
    async *search(query, { isKnown, budget }) {
      queries.push(query.occupation);
      if (!budget.take()) return;
      for (const p of postings) if (!(await isKnown(p.externalId))) yield p;
    },
  };
}

const criteria = {
  occupations: ["Backend-Entwickler"],
  country: "DE" as const,
  city: "Berlin",
  lat: 52.52,
  lon: 13.405,
  radiusKm: 25,
  workingTime: "indifferent" as const,
};

describe.skipIf(!db)("service jobs-matching (intégration PostgreSQL)", () => {
  let pool: pg.Pool;
  let repo: JobsRepository;
  const userId = randomUUID();

  beforeAll(async () => {
    await migrate(db!.url);
    pool = new pg.Pool({ connectionString: db!.url, max: 3 });
    repo = new JobsRepository(pool);
  });
  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });
  beforeEach(() =>
    pool.query("TRUNCATE user_offer, job_posting, job_source_run, esco_cache, llm_usage CASCADE"),
  );

  const app = (options: { llm?: LlmProvider; sources?: JobSource[] } = {}) => {
    const log = testLogger();
    const llm =
      options.llm &&
      new BudgetedProvider(options.llm, {
        service: "jobs-matching",
        store: memoryUsageStore(),
        monthlyBudgetEur: 4,
      });
    return Object.assign(
      createApp({
        ...log,
        readiness: {},
        repo,
        verifier: t.verifier,
        llm,
        embeddings: new HashEmbeddings(),
        sources: options.sources ?? [],
        dailyRequestLimits: { essai: 10 },
      }),
      { lines: log.lines },
    );
  };

  describe("offres des candidats", () => {
    it("enregistre une offre analysée (démonstration), la liste, la relit et la supprime", async () => {
      const token = await t.user(userId);
      const a = app({ llm: new DemoProvider(demoHandlers) });
      const created = await request(a)
        .post("/v1/offers")
        .auth(token, { type: "bearer" })
        .send({ rawText: OFFER });
      expect(created.status).toBe(201);
      const offer = StoredOffer.parse(created.body);
      expect(offer.title).toBe("Développeur back-end Node.js (H/F)");
      expect(offer.analysis.keywords.map((k) => k.term)).toEqual(
        expect.arrayContaining(["Node.js", "PostgreSQL", "Kubernetes"]),
      );
      expect(offer.providerKind).toBe("demo");

      const list = await request(a).get("/v1/offers").auth(token, { type: "bearer" });
      expect(list.body).toEqual([
        expect.objectContaining({ id: offer.id, keywords: offer.analysis.keywords.length }),
      ]);
      expect(
        (await request(a).get(`/v1/offers/${offer.id}`).auth(token, { type: "bearer" })).body.rawText,
      ).toBe(OFFER);

      const other = await t.user(randomUUID());
      expect((await request(a).get(`/v1/offers/${offer.id}`).auth(other, { type: "bearer" })).status).toBe(
        404,
      );

      await request(a).delete(`/v1/offers/${offer.id}`).auth(token, { type: "bearer" }).expect(204);
      expect((await request(a).get(`/v1/offers/${offer.id}`).auth(token, { type: "bearer" })).status).toBe(
        404,
      );
    });

    it("refuse une offre trop courte, avec un message en français", async () => {
      const res = await request(app())
        .post("/v1/offers")
        .auth(await t.user(userId), { type: "bearer" })
        .send({ rawText: "Dév" });
      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toMatch(/trop courte/);
    });

    it("utilise l'analyse du modèle, ou l'analyse sans IA si le modèle échoue", async () => {
      const token = await t.user(userId);
      const analysis = {
        title: "Développeur back-end",
        company: "Transports Rhône",
        language: "fr",
        location: "Lyon",
        contractType: "cdi",
        requirements: [{ text: "Node.js confirmé", priority: "must", skills: ["Node.js"] }],
        keywords: [{ term: "Node.js", weight: 1.4 }],
      };
      const ok = await request(app({ llm: new ScriptedProvider({ "analyse-offre": [{ data: analysis }] }) }))
        .post("/v1/offers")
        .auth(token, { type: "bearer" })
        .send({ rawText: OFFER });
      expect(ok.body).toMatchObject({ providerKind: "ia", company: "Transports Rhône" });
      expect(ok.body.analysis.keywords[0].weight).toBe(1);

      const down = await request(
        app({ llm: new ScriptedProvider({ "analyse-offre": [{ error: new Error("panne") }] }) }),
      )
        .post("/v1/offers")
        .auth(token, { type: "bearer" })
        .send({ rawText: `${OFFER} Autre version.` });
      expect(down.status).toBe(201);
      expect(down.body.providerKind).toBe("demo");
    });

    it("reprend une offre collectée comme offre visée", async () => {
      await repo.insertPosting(posting());
      const [stored] = await repo.searchPostings({ limit: 1 });
      const res = await request(app())
        .post(`/v1/offers/from-posting/${stored!.id}`)
        .auth(await t.user(userId), { type: "bearer" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ postingId: stored!.id, sourceUrl: "https://example.org/offre" });
    });

    it("sert l'offre à la génération sur le jeton relayé du candidat seulement", async () => {
      const token = await t.user(userId);
      const created = await request(app())
        .post("/v1/offers")
        .auth(token, { type: "bearer" })
        .send({ rawText: OFFER });
      expect(
        (await request(app()).get(`/internal/v1/offers/${created.body.id}`).auth(token, { type: "bearer" }))
          .status,
      ).toBe(200);
      const service = await t.service("matching:run");
      expect(
        (await request(app()).get(`/internal/v1/offers/${created.body.id}`).auth(service, { type: "bearer" }))
          .status,
      ).toBe(403);
    });
  });

  describe("référentiel et offres collectées", () => {
    it("suggère des villes et résout leurs coordonnées", async () => {
      const token = await t.user(userId);
      const res = await request(app()).get("/v1/cities?country=DE&q=Mün").auth(token, { type: "bearer" });
      // Nom de référence GeoNames ; « München » est un alias.
      expect(res.body[0]).toMatchObject({ nom: "Munich", pays: "DE" });
      const resolved = await request(app())
        .get("/internal/v1/cities/resolve?country=FR&name=lyon")
        .auth(token, { type: "bearer" });
      expect(resolved.body).toMatchObject({ nom: "Lyon", pays: "FR" });
      expect(
        (
          await request(app())
            .get("/internal/v1/cities/resolve?country=FR&name=Atlantide")
            .auth(token, { type: "bearer" })
        ).status,
      ).toBe(404);
    });

    it("cherche dans les offres collectées", async () => {
      await repo.insertPosting(posting());
      await repo.insertPosting(
        posting({
          title: "Comptable (H/F)",
          body: "Cabinet comptable à Lyon",
          country: "FR",
          city: "Lyon",
          lang: "fr",
        }),
      );
      const token = await t.user(userId);
      const all = await request(app()).get("/v1/postings").auth(token, { type: "bearer" });
      expect(all.body).toHaveLength(2);
      const de = await request(app())
        .get("/v1/postings?country=DE&q=Node.js")
        .auth(token, { type: "bearer" });
      expect(de.body.map((p: { title: string }) => p.title)).toEqual(["Backend-Entwickler Node.js (m/w/d)"]);
    });
  });

  describe("collecte et classement (jeton de service)", () => {
    it("collecte, déduplique à la relance et vectorise les nouvelles offres", async () => {
      const source = fakeSource([
        posting(),
        posting({ title: "DevOps Engineer", body: "Kubernetes, Terraform" }),
      ]);
      const service = await t.service("matching:run");
      const run = () =>
        request(app({ sources: [source] }))
          .post("/internal/v1/ingestion")
          .auth(service, { type: "bearer" })
          .send({ criteria: [criteria], date: today });
      const first = await run();
      expect(first.status).toBe(200);
      expect(first.body).toEqual({
        sources: { essai: expect.objectContaining({ inserted: 2, errors: 0 }) },
        embedded: 2,
      });
      const again = await run();
      expect(again.body.sources.essai.inserted).toBe(0);
      expect(source.queries).toContain("Backend-Entwickler");
    });

    it("refuse la collecte et le classement sans la portée matching:run", async () => {
      const user = await t.user(userId);
      const res = await request(app()).post("/internal/v1/matching").auth(user, { type: "bearer" }).send({});
      expect(res.status).toBe(403);
    });

    async function seed() {
      await repo.insertPosting(posting());
      await repo.insertPosting(
        posting({ title: "Backend-Entwickler Python", body: "Python, Django, PostgreSQL", externalId: "py" }),
      );
      await repo.insertPosting(
        posting({ title: "Backend-Entwickler Node.js Hamburg", city: "Hamburg", lat: 53.55, lon: 9.99 }),
      );
      await repo.insertPosting(posting({ title: "Backend-Entwickler alt", postedAt: "2020-01-01" }));
      await embedPending({ repo, embeddings: new HashEmbeddings() });
    }

    const match = async (llm?: LlmProvider, exclude: string[] = []) =>
      request(app({ llm }))
        .post("/internal/v1/matching")
        .auth(await t.service("matching:run"), { type: "bearer" })
        .send({ profile: Profile.parse(leaProfile), criteria, excludePostingIds: exclude, date: today });

    it("classe les offres du rayon et de la fenêtre de fraîcheur, avec les compétences manquantes", async () => {
      await seed();
      const res = await match(new DemoProvider(demoHandlers));
      const result = MatchResponse.parse(res.body);
      const titles = result.postings.map((p) => p.posting.title);
      expect(titles).toContain("Backend-Entwickler Node.js (m/w/d)");
      expect(titles).not.toContain("Backend-Entwickler Node.js Hamburg");
      expect(titles).not.toContain("Backend-Entwickler alt");
      const node = result.postings.find((p) => p.posting.title.includes("(m/w/d)"))!;
      expect(node.missingSkills).toContain("GraphQL");
      expect(node.locationScore).toBeCloseTo(1);
      expect(result.profileSkills).toEqual(["Node.js", "Express", "PostgreSQL"]);
    });

    it("n'envoie au modèle ni nom, ni e-mail, ni employeur", async () => {
      await seed();
      const llm = new ScriptedProvider({
        "rerank-offres": [
          { data: { offres: [{ id: "o1", pertinence: 90, competencesManquantes: ["GraphQL", "Cobol"] }] } },
        ],
      });
      const res = await match(llm);
      const sent = llm.requests[0]!.messages[0]!.content;
      for (const forbidden of ["Léa", "Martin", "lea.martin@example.org", "Transports Rhône", "INSA"]) {
        expect(sent).not.toContain(forbidden);
      }
      const first = res.body.postings[0];
      expect(first.rerankScore).toBe(90);
      // « Cobol » n'est pas dans l'offre : jamais reproché au candidat.
      expect(first.missingSkills).not.toContain("Cobol");
    });

    it("exclut les offres déjà envoyées", async () => {
      await seed();
      const first = MatchResponse.parse((await match()).body);
      const excluded = first.postings.map((p) => p.posting.id);
      const second = MatchResponse.parse((await match(undefined, excluded)).body);
      expect(second.postings.filter((p) => excluded.includes(p.posting.id))).toEqual([]);
    });

    it("passe en mode dégradé si le rerank échoue", async () => {
      await seed();
      for (const error of [new LlmUnavailableError("injoignable"), new Error("inattendue")]) {
        const res = await match(new ScriptedProvider({ "rerank-offres": [{ error }] }));
        expect(res.status).toBe(200);
        expect(res.body.degraded).toBe(true);
        expect(res.body.postings.length).toBeGreaterThan(0);
        expect(res.body.postings.every((p: { rerankScore: null }) => p.rerankScore === null)).toBe(true);
      }
    });
  });

  describe("RGPD et administration", () => {
    it("exporte puis efface les offres d'un utilisateur", async () => {
      const token = await t.user(userId);
      await request(app()).post("/v1/offers").auth(token, { type: "bearer" }).send({ rawText: OFFER });
      const exp = await request(app())
        .get(`/internal/v1/users/${userId}/export`)
        .auth(await t.service("users:export"), { type: "bearer" });
      expect(exp.body.data.offres).toHaveLength(1);
      await request(app())
        .delete(`/internal/v1/users/${userId}`)
        .auth(await t.service("users:delete"), { type: "bearer" })
        .expect(204);
      expect((await request(app()).get("/v1/offers").auth(token, { type: "bearer" })).body).toEqual([]);
    });

    it("donne des compteurs à l'administrateur, et purge les données expirées", async () => {
      await repo.insertPosting(posting({ postedAt: "2020-01-01" }));
      const admin = await t.user(randomUUID(), "admin");
      const stats = ServiceStats.parse(
        (
          await request(app({ llm: new DemoProvider() }))
            .get("/v1/admin/stats")
            .auth(admin, { type: "bearer" })
        ).body,
      );
      expect(stats.counters.postings).toBe(1);
      expect(stats.llm?.budgetEur).toBe(4);
      expect((await repo.purge()).offres).toBe(1);
    });
  });
});
