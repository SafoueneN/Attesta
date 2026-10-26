import { randomUUID } from "node:crypto";
import {
  BudgetedProvider,
  DemoProvider,
  LlmUnavailableError,
  memoryUsageStore,
  ScriptedProvider,
  type LlmProvider,
} from "@attesta/llm-client";
import { Letter, Profile, ServiceStats, type Generation, type LinesCheck } from "@attesta/shared-schemas";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db.js";
import { demoHandlers } from "../src/letters.js";
import type { PdfRenderer } from "../src/render/index.js";
import { LetterStore } from "../src/store.js";
import type { Upstreams } from "../src/upstreams.js";
import { testLogger } from "./helpers.js";
import { createTestDatabase } from "./pg.js";
import { lea } from "./fixtures.js";
import { tokens } from "./tokens.js";

const db = await createTestDatabase("letters");
const t = await tokens();
const generationId = randomUUID();
const profile = Profile.parse(lea);

const generation: Generation = {
  id: generationId,
  offerId: randomUUID(),
  offerTitle: "Développeur back-end Node.js",
  profileVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: "ok",
  degradedReason: null,
  message: null,
  cv: {
    headline: { text: profile.basics.label ?? "Développeuse", sources: ["/basics/label"] },
    summary: [],
    work: [
      {
        ref: "/work/0",
        highlights: profile.work[0]!.highlights.map((text, j) => ({
          text,
          sources: [`/work/0/highlights/${j}`],
        })),
      },
    ],
    projects: [],
    education: [],
    skills: [],
    languages: [],
    certificates: [],
    missingKeywords: ["Kubernetes"],
  },
  report: { score: 1, checkedLines: 1, supportedLines: 1, lines: [] },
  removed: [],
  edited: [],
  revision: 0,
  analysis: {
    title: "Développeur back-end Node.js",
    company: "Transports Lyonnais",
    language: "fr",
    requirements: [],
    keywords: [{ term: "Node.js", weight: 1 }],
  },
  profile,
  providerKind: "ia",
  model: "m",
  pipelineVersion: "redaction@v1",
};

/** cv-generation et profiles factices ; le contrôle refuse toute ligne qui cite « Kubernetes » ou « 60 % ». */
function fakeUpstreams(
  options: { verified?: boolean; profile?: boolean } = {},
): Upstreams & { checks: LinesCheck["lines"][] } {
  const checks: LinesCheck["lines"][] = [];
  return {
    checks,
    async generation(_token, id) {
      return options.verified === false || id !== generationId ? undefined : generation;
    },
    async check(_token, _id, lines) {
      checks.push(lines);
      return {
        lines: lines.map((l) =>
          /Kubernetes|60 %/.test(l.text)
            ? { status: "unsupported", issues: [{ kind: "skill", value: "Kubernetes" }] }
            : { status: "supported", issues: [] },
        ),
      };
    },
    async profile() {
      return options.profile === false
        ? undefined
        : { version: 1, createdAt: "", schemaVersion: "1.0.0", profile };
    },
    async translation() {
      return undefined;
    },
    async evidence() {
      return [];
    },
    async photo() {
      return undefined;
    },
    async evidenceFile() {
      return undefined;
    },
  };
}

/** Rendu factice : renvoie le HTML reçu, préfixé d'une signature PDF (Chromium est testé à part). */
function fakeRenderer(): PdfRenderer & { html: string[] } {
  const html: string[] = [];
  return {
    html,
    async render(h) {
      html.push(h);
      return new TextEncoder().encode(`%PDF-1.7 ${h.length}`);
    },
    async close() {},
  };
}

describe.skipIf(!db)("service letters-export (intégration PostgreSQL)", () => {
  let pool: pg.Pool;
  let store: LetterStore;
  const userId = randomUUID();

  beforeAll(async () => {
    await migrate(db!.url);
    pool = new pg.Pool({ connectionString: db!.url, max: 3 });
    store = new LetterStore(pool);
  });
  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });
  beforeEach(() => pool.query("TRUNCATE cover_letter, llm_usage"));

  const app = (options: { llm?: LlmProvider; upstreams?: Upstreams; renderer?: PdfRenderer } = {}) =>
    createApp({
      ...testLogger(),
      readiness: {},
      store,
      upstreams: options.upstreams ?? fakeUpstreams(),
      renderer: options.renderer ?? fakeRenderer(),
      verifier: t.verifier,
      llm: new BudgetedProvider(options.llm ?? new DemoProvider(demoHandlers), {
        service: "letters-export",
        store: memoryUsageStore(),
        monthlyBudgetEur: 5,
      }),
    });

  const create = async (a = app(), tone = "sobre") =>
    request(a)
      .post("/v1/letters")
      .auth(await t.user(userId), { type: "bearer" })
      .send({ generationId, tone });

  describe("lettres", () => {
    it("compose une lettre de démonstration à partir des seules lignes vérifiées", async () => {
      const res = await create();
      expect(res.status).toBe(201);
      const letter = Letter.parse(res.body);
      expect(letter).toMatchObject({
        offerTitle: "Développeur back-end Node.js",
        company: "Transports Lyonnais",
        providerKind: "demo",
      });
      expect(letter.paragraphs[0]!.sources).toEqual([]);
      // Les faits les plus proches de l'offre, recopiés à l'identique avec leur source.
      expect(letter.paragraphs[1]).toMatchObject({
        text: profile.work[0]!.highlights[0],
        sources: ["/work/0/highlights/0"],
        status: "supported",
      });
    });

    it("retire un paragraphe rédigé mais non prouvé, et le compte", async () => {
      const llm = new ScriptedProvider({
        lettre: [
          {
            data: {
              greeting: "Madame, Monsieur,",
              closing: "Bien cordialement.",
              paragraphs: [
                { text: "J'ai réduit de 40 % le temps de réponse.", sources: ["/work/0/highlights/1"] },
                {
                  text: "J'ai réduit de 60 % le temps de réponse grâce à Kubernetes.",
                  sources: ["/work/0/highlights/1"],
                },
              ],
            },
          },
        ],
      });
      const upstreams = fakeUpstreams();
      const letter = Letter.parse((await create(app({ llm, upstreams }))).body);
      expect(letter.paragraphs.map((p) => p.text)).toEqual(["J'ai réduit de 40 % le temps de réponse."]);
      expect(letter.removed).toBe(1);
      expect(letter.providerKind).toBe("ia");
      // Seules les lignes vérifiées du CV partent au modèle, sans nom ni coordonnées.
      const sent = llm.requests[0]!.messages[0]!.content;
      expect(sent).toContain("Migration de 12 services");
      expect(sent).not.toContain("Léa Martin");
      expect(sent).not.toContain("lea.martin@example.org");
    });

    it("passe en démonstration si le modèle est indisponible", async () => {
      const llm = new ScriptedProvider({ lettre: [{ error: new LlmUnavailableError("503") }] });
      expect(Letter.parse((await create(app({ llm }))).body).providerKind).toBe("demo");
    });

    it("refuse une lettre pour un CV non vérifié", async () => {
      const res = await create(app({ upstreams: fakeUpstreams({ verified: false }) }));
      expect(res.status).toBe(409);
      expect(res.body.title).toMatch(/CV vérifié/);
    });

    it("liste, modifie (paragraphe recontrôlé et marqué), exporte en PDF et supprime", async () => {
      const token = await t.user(userId);
      const renderer = fakeRenderer();
      const a = app({ renderer });
      const letter = Letter.parse((await create(a)).body);
      expect((await request(a).get("/v1/letters").auth(token, { type: "bearer" })).body).toHaveLength(1);

      const updated = await request(a)
        .put(`/v1/letters/${letter.id}`)
        .auth(token, { type: "bearer" })
        .send({
          greeting: "Madame la directrice,",
          closing: letter.closing,
          paragraphs: [
            ...letter.paragraphs.map((p) => ({ text: p.text })),
            { text: "Je maîtrise aussi Kubernetes." },
          ],
        });
      expect(updated.status).toBe(200);
      const after = Letter.parse(updated.body);
      expect(after.greeting).toBe("Madame la directrice,");
      expect(after.paragraphs.at(-1)).toMatchObject({
        status: "edited",
        issues: [{ kind: "skill", value: "Kubernetes" }],
      });
      expect(after.paragraphs[0]!.status).toBe("supported");

      const pdf = await request(a).post(`/v1/letters/${letter.id}/pdf`).auth(token, { type: "bearer" });
      expect(pdf.headers["content-type"]).toBe("application/pdf");
      expect(pdf.headers["content-disposition"]).toMatch(/lettre-lea-martin\.pdf/);
      expect(renderer.html[0]).toContain("Candidature au poste de Développeur back-end Node.js");
      expect(renderer.html[0]).toContain("Madame la directrice,");

      await request(a).delete(`/v1/letters/${letter.id}`).auth(token, { type: "bearer" }).expect(204);
      expect((await request(a).get(`/v1/letters/${letter.id}`).auth(token, { type: "bearer" })).status).toBe(
        404,
      );
    });
  });

  describe("export du CV", () => {
    it("exporte le CV ciblé vérifié, et le CV non adapté depuis le profil", async () => {
      const token = await t.user(userId);
      const renderer = fakeRenderer();
      const a = app({ renderer });
      const targeted = await request(a)
        .post("/v1/exports/cv")
        .auth(token, { type: "bearer" })
        .send({ generationId, variant: "design" });
      expect(targeted.status).toBe(200);
      expect(targeted.headers["content-disposition"]).toMatch(/cv-lea-martin\.pdf/);
      expect(renderer.html[0]).toContain("cv--design");
      const plain = await request(a).post("/v1/exports/cv").auth(token, { type: "bearer" }).send({});
      expect(plain.status).toBe(200);
      expect(renderer.html[1]).toContain("cv--ats");
    });

    it("sert l'aperçu HTML, identique au document imprimé", async () => {
      const renderer = fakeRenderer();
      const res = await request(app({ renderer }))
        .post("/v1/exports/cv/preview")
        .auth(await t.user(userId), { type: "bearer" })
        .send({ generationId });
      expect(res.headers["content-type"]).toMatch(/text\/html/);
      expect(res.text).toContain("Migration de 12 services Express");
      expect(res.text).toContain('data-source="/work/0/highlights/0"');
    });

    it("refuse un CV non vérifié ou sans profil, et répond 503 si le rendu échoue", async () => {
      const token = await t.user(userId);
      expect(
        (
          await request(app({ upstreams: fakeUpstreams({ verified: false }) }))
            .post("/v1/exports/cv")
            .auth(token, { type: "bearer" })
            .send({ generationId })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(app({ upstreams: fakeUpstreams({ profile: false }) }))
            .post("/v1/exports/cv")
            .auth(token, { type: "bearer" })
            .send({})
        ).status,
      ).toBe(409);
      const broken: PdfRenderer = {
        render: async () => Promise.reject(new Error("chromium")),
        close: async () => {},
      };
      const res = await request(app({ renderer: broken }))
        .post("/v1/exports/cv")
        .auth(token, { type: "bearer" })
        .send({});
      expect(res.status).toBe(503);
      expect(res.body.title).toMatch(/n'a pas pu être créé/);
    });
  });

  describe("rapports, RGPD et administration", () => {
    const report = {
      date: "21/10/2026",
      criteria: "Développeur · Berlin (25 km)",
      degraded: false,
      offers: [
        {
          title: "Backend-Entwickler",
          company: "Beispiel GmbH",
          city: "Berlin",
          postedAt: "20/10/2026",
          url: "https://example.org/1",
          source: "Bundesagentur für Arbeit",
          attribution: null,
          pertinence: 88,
          similarity: 61,
          coverage: 67,
          location: 100,
          missingSkills: ["GraphQL"],
        },
      ],
    };

    it("rend les rapports de veille pour le seul jeton reports:render", async () => {
      const renderer = fakeRenderer();
      const service = await t.service("reports:render");
      const res = await request(app({ renderer }))
        .post("/internal/v1/reports/offers")
        .auth(service, { type: "bearer" })
        .send(report);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(renderer.html[0]).toContain("Backend-Entwickler");
      const gaps = await request(app({ renderer }))
        .post("/internal/v1/reports/gaps")
        .auth(service, { type: "bearer" })
        .send({
          date: "21/10/2026",
          criteria: "x",
          basis: 3,
          gaps: [
            {
              skill: "GraphQL",
              count: 2,
              frequency: 67,
              salary: "données insuffisantes",
              effort: "moyen",
              priority: 0.2,
            },
          ],
        });
      expect(gaps.status).toBe(200);
      const user = await t.user(userId);
      expect(
        (await request(app()).post("/internal/v1/reports/offers").auth(user, { type: "bearer" }).send(report))
          .status,
      ).toBe(403);
    });

    it("exporte puis efface les lettres d'un utilisateur", async () => {
      await create();
      const exp = await request(app())
        .get(`/internal/v1/users/${userId}/export`)
        .auth(await t.service("users:export"), { type: "bearer" });
      expect(exp.body.data.lettres).toHaveLength(1);
      await request(app())
        .delete(`/internal/v1/users/${userId}`)
        .auth(await t.service("users:delete"), { type: "bearer" })
        .expect(204);
      expect(await store.list(userId)).toEqual([]);
    });

    it("donne des compteurs à l'administrateur", async () => {
      await create();
      const admin = await t.user(randomUUID(), "admin");
      const stats = ServiceStats.parse(
        (await request(app()).get("/v1/admin/stats").auth(admin, { type: "bearer" })).body,
      );
      expect(stats.counters).toMatchObject({ letters: 1, rendersPending: 0 });
      expect(stats.llm?.budgetEur).toBe(5);
    });
  });
});
