import { randomUUID } from "node:crypto";
import {
  Profile,
  Subscription,
  WatchRun,
  type MatchedPosting,
  type MatchRequest,
} from "@attesta/shared-schemas";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { processSubscription, runDaily } from "../src/daily.js";
import { migrate } from "../src/db.js";
import { MailError, MemoryMailer, type MailMessage } from "../src/mail.js";
import { WatchStore } from "../src/store.js";
import type { Upstreams } from "../src/upstreams.js";
import { testLogger } from "./helpers.js";
import { createTestDatabase } from "./pg.js";
import { tokens } from "./tokens.js";

const db = await createTestDatabase("watch");
const t = await tokens();
const today = "2026-10-21";
const tomorrow = "2026-10-22";

const profile = Profile.parse({
  basics: { name: "Léa Martin", label: "Développeuse back-end" },
  work: [
    {
      name: "Transports Rhône",
      position: "Développeuse back-end",
      startDate: "2021",
      highlights: ["Node.js"],
    },
  ],
  skills: [{ name: "Node.js", keywords: [] }],
});

const matched = (id: string, title: string, salary: number | null = null): MatchedPosting => ({
  posting: {
    id,
    source: "Bundesagentur für Arbeit",
    title,
    company: "Beispiel GmbH",
    city: "Berlin",
    country: "DE",
    postedAt: today,
    url: `https://example.org/${id}`,
    excerpt: "…",
    salaryMinEur: salary,
    salaryMaxEur: salary,
    attribution: null,
  },
  rank: 1,
  rrfScore: 0.03,
  similarity: 0.6,
  coverage: 0.5,
  locationScore: 1,
  rerankScore: 80,
  missingSkills: ["GraphQL"],
});

function fakeUpstreams(options: { postings?: MatchedPosting[]; profile?: boolean; city?: boolean } = {}) {
  const calls = { matches: [] as MatchRequest[], ingested: 0, reports: 0 };
  const upstreams: Upstreams = {
    async contact(userId) {
      return { id: userId, email: "lea@example.org", status: "active" };
    },
    async profile() {
      return options.profile === false
        ? undefined
        : { version: 1, createdAt: "", schemaVersion: "1.0.0", profile };
    },
    async resolveCity(_token, country, name) {
      return options.city === false
        ? undefined
        : { nom: name === "berlin" ? "Berlin" : name, pays: country, lat: 52.52, lon: 13.405 };
    },
    async ingest() {
      calls.ingested++;
      return { sources: {}, embedded: 0 };
    },
    async match(req) {
      calls.matches.push(req);
      const postings = (options.postings ?? []).filter((p) => !req.excludePostingIds.includes(p.posting.id));
      return { degraded: false, postings, profileSkills: ["Node.js"] };
    },
    async offersReport() {
      calls.reports++;
      return new TextEncoder().encode("%PDF-offres");
    },
    async gapsReport() {
      calls.reports++;
      return new TextEncoder().encode("%PDF-ecarts");
    },
  };
  return Object.assign(upstreams, { calls });
}

const input = {
  occupations: ["Backend-Entwickler"],
  country: "DE",
  city: "berlin",
  radiusKm: 25,
  workingTime: "indifferent",
  consent: true,
};

const tokenFromMail = (m: MailMessage) => /\/veille\/confirmer\/([A-Za-z0-9_-]+)/.exec(m.text)![1]!;

describe.skipIf(!db)("service job-watch (intégration PostgreSQL)", () => {
  let pool: pg.Pool;
  let store: WatchStore;
  let mailer: MemoryMailer;
  const userId = randomUUID();

  beforeAll(async () => {
    await migrate(db!.url);
    pool = new pg.Pool({ connectionString: db!.url, max: 4 });
    store = new WatchStore(pool);
  });
  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE watch_subscription, watch_consent, match_result, email_delivery, email_event, watch_run CASCADE",
    );
    mailer = new MemoryMailer();
  });

  const deps = (upstreams: Upstreams = fakeUpstreams()) => ({
    store,
    upstreams,
    mailer,
    logger: testLogger().logger,
    appBaseUrl: "http://localhost:8080",
  });
  const app = (upstreams?: Upstreams) =>
    createApp({
      ...deps(upstreams),
      readiness: {},
      verifier: t.verifier,
      ipHashSecret: "x".repeat(16),
      brevoWebhookToken: "secret-du-webhook-0000",
    });

  async function subscribeAndConfirm(upstreams?: Upstreams) {
    const token = await t.user(userId);
    await request(app(upstreams))
      .put("/v1/subscriptions/me")
      .auth(token, { type: "bearer" })
      .send(input)
      .expect(200);
    await request(app(upstreams))
      .post(`/v1/subscriptions/confirm/${tokenFromMail(mailer.sent[0]!)}`)
      .expect(204);
    return (await store.subscription(userId))!;
  }

  describe("abonnement et double opt-in", () => {
    it("enregistre la veille en attente et envoie le lien de confirmation vers le frontend", async () => {
      const res = await request(app())
        .put("/v1/subscriptions/me")
        .auth(await t.user(userId), { type: "bearer" })
        .send(input);
      expect(res.status).toBe(200);
      expect(res.body.confirmationSent).toBe(true);
      expect(Subscription.parse(res.body.subscription)).toMatchObject({
        status: "en_attente",
        city: "Berlin",
      });
      expect(mailer.sent[0]!.to).toBe("lea@example.org");
      expect(mailer.sent[0]!.text).toMatch(/http:\/\/localhost:8080\/veille\/confirmer\//);
    });

    it("active la veille au clic, une seule fois, et ne redemande pas de confirmation ensuite", async () => {
      await subscribeAndConfirm();
      expect((await store.subscription(userId))?.status).toBe("active");
      expect(
        (await request(app()).post(`/v1/subscriptions/confirm/${tokenFromMail(mailer.sent[0]!)}`)).status,
      ).toBe(410);
      const res = await request(app())
        .put("/v1/subscriptions/me")
        .auth(await t.user(userId), { type: "bearer" })
        .send({ ...input, radiusKm: 50 });
      expect(res.body).toMatchObject({
        confirmationSent: false,
        subscription: { status: "active", radiusKm: 50 },
      });
    });

    it("refuse une ville inconnue, un rayon hors liste, l'absence de consentement ou de profil", async () => {
      const token = await t.user(userId);
      const city = await request(app(fakeUpstreams({ city: false })))
        .put("/v1/subscriptions/me")
        .auth(token, { type: "bearer" })
        .send(input);
      expect(city.status).toBe(400);
      expect(city.body.errors[0]).toMatchObject({ champ: "city" });
      const bad = await request(app())
        .put("/v1/subscriptions/me")
        .auth(token, { type: "bearer" })
        .send({ ...input, radiusKm: 30, consent: false });
      expect(bad.body.errors.map((e: { champ: string }) => e.champ).sort()).toEqual(["consent", "radiusKm"]);
      const noProfile = await request(app(fakeUpstreams({ profile: false })))
        .put("/v1/subscriptions/me")
        .auth(token, { type: "bearer" })
        .send(input);
      expect(noProfile.status).toBe(409);
    });

    it("réserve la veille aux comptes (pas aux invités)", async () => {
      const guest = await t.user(`guest_${randomUUID()}`, "guest");
      expect(
        (await request(app()).put("/v1/subscriptions/me").auth(guest, { type: "bearer" }).send(input)).status,
      ).toBe(403);
    });

    it("désabonne en un clic (RFC 8058), de façon idempotente, et journalise le retrait", async () => {
      const s = await subscribeAndConfirm();
      const once = () =>
        request(app())
          .post(`/v1/subscriptions/unsubscribe/${s.unsubscribeToken}`)
          .type("form")
          .send("List-Unsubscribe=One-Click");
      expect((await once()).text).toBe("ok");
      expect((await once()).status).toBe(200);
      expect((await store.subscription(userId))?.status).toBe("desabonnee");
      const consents = await pool.query("SELECT granted, reason FROM watch_consent ORDER BY id");
      expect(consents.rows.map((r) => r.reason)).toEqual(["demande", "confirmation", "desabonnement"]);
    });

    it("arrête la veille depuis le compte", async () => {
      await subscribeAndConfirm();
      await request(app())
        .delete("/v1/subscriptions/me")
        .auth(await t.user(userId), { type: "bearer" })
        .expect(204);
      const res = await request(app())
        .get("/v1/subscriptions/me")
        .auth(await t.user(userId), { type: "bearer" });
      expect(res.body.status).toBe("desabonnee");
    });
  });

  describe("exécution quotidienne", () => {
    const postings = [
      matched(randomUUID(), "Backend-Entwickler Node.js", 60_000),
      matched(randomUUID(), "Node.js Engineer", 65_000),
    ];

    it("envoie un rapport avec deux PDF, désabonnement en un clic vers l'API, et une seule fois par jour", async () => {
      const upstreams = fakeUpstreams({ postings });
      await subscribeAndConfirm(upstreams);
      mailer.sent.length = 0;
      const summary = await runDaily(deps(upstreams), today, "manuelle");
      expect(summary).toMatchObject({ abonnes: { envoye: 1 }, echecs: 0 });
      const mail = mailer.sent[0]!;
      expect(mail.subject).toBe("Attesta – 2 nouvelles offres (21/10/2026)");
      expect(mail.attachments?.map((a) => a.filename)).toEqual([
        "offres-2026-10-21.pdf",
        "points-a-ameliorer-2026-10-21.pdf",
      ]);
      expect(mail.headers?.["List-Unsubscribe"]).toMatch(
        /^<http:\/\/localhost:8080\/api\/watch\/v1\/subscriptions\/unsubscribe\//,
      );
      expect(mail.text).toMatch(/http:\/\/localhost:8080\/veille\/desabonner\//);
      expect(upstreams.calls.ingested).toBe(1);

      await runDaily(deps(upstreams), today, "manuelle");
      expect(mailer.sent).toHaveLength(1);
    });

    it("n'envoie jamais deux fois la même offre, ni d'e-mail vide", async () => {
      const upstreams = fakeUpstreams({ postings });
      await subscribeAndConfirm(upstreams);
      mailer.sent.length = 0;
      await runDaily(deps(upstreams), today, "manuelle");
      await runDaily(deps(upstreams), tomorrow, "manuelle");
      expect(upstreams.calls.matches.at(-1)!.excludePostingIds.sort()).toEqual(
        postings.map((p) => p.posting.id).sort(),
      );
      expect(mailer.sent).toHaveLength(1);
      const matches = await request(app())
        .get("/v1/subscriptions/me/matches")
        .auth(await t.user(userId), { type: "bearer" });
      expect(matches.body.map((m: { title: string }) => m.title).sort()).toEqual([
        "Backend-Entwickler Node.js",
        "Node.js Engineer",
      ]);
    });

    it("lève la réservation si l'e-mail n'est certainement pas parti, pour la relance", async () => {
      const upstreams = fakeUpstreams({ postings });
      const s = await subscribeAndConfirm(upstreams);
      const failing = { send: async () => Promise.reject(new MailError("EAUTH", 535, true)) };
      await expect(
        processSubscription({ ...deps(upstreams), mailer: failing }, s, today),
      ).rejects.toBeInstanceOf(MailError);
      expect(await store.deliveredToday(s.id, today)).toBe(false);
      const outcome = await processSubscription(deps(upstreams), s, today);
      expect(outcome).toMatchObject({ status: "envoye", offers: 2 });
    });

    it("saute un abonné sans profil, et lance l'exécution depuis l'administration", async () => {
      await subscribeAndConfirm(fakeUpstreams({ postings }));
      const upstreams = fakeUpstreams({ postings, profile: false });
      const admin = await t.user(randomUUID(), "admin");
      const a = app(upstreams);
      expect((await request(a).post("/v1/admin/runs").auth(admin, { type: "bearer" })).status).toBe(202);
      for (let i = 0; i < 50 && !(await store.runs())[0]?.finishedAt; i++)
        await new Promise((r) => setTimeout(r, 20));
      const runs = await request(a).get("/v1/admin/runs").auth(admin, { type: "bearer" });
      const [run] = runs.body.map((r: unknown) => WatchRun.parse(r));
      expect(run).toMatchObject({ trigger: "manuelle", summary: { abonnes: { "sans-profil": 1 } } });
      const candidate = await t.user(userId);
      expect((await request(a).post("/v1/admin/runs").auth(candidate, { type: "bearer" })).status).toBe(403);
    });
  });

  describe("retours du fournisseur, RGPD et administration", () => {
    it("arrête la veille sur une plainte, après vérification du secret du webhook", async () => {
      const upstreams = fakeUpstreams({ postings: [matched(randomUUID(), "Dev")] });
      await subscribeAndConfirm(upstreams);
      await runDaily(deps(upstreams), today, "manuelle");
      const deliveryId = (await pool.query("SELECT id FROM email_delivery")).rows[0].id;
      expect(
        (await request(app()).post("/v1/webhooks/brevo").set("Authorization", "Bearer faux").send({})).status,
      ).toBe(401);
      await request(app())
        .post("/v1/webhooks/brevo")
        .set("Authorization", "Bearer secret-du-webhook-0000")
        .send([{ event: "spam", "X-Mailin-custom": deliveryId }])
        .expect(204);
      expect((await store.subscription(userId))?.status).toBe("desabonnee");
      expect((await store.complaintRate()).complaints).toBe(1);
    });

    it("suspend la veille sur un rebond définitif", async () => {
      const upstreams = fakeUpstreams({ postings: [matched(randomUUID(), "Dev")] });
      await subscribeAndConfirm(upstreams);
      await runDaily(deps(upstreams), today, "manuelle");
      const messageId = (await pool.query("SELECT provider_message_id FROM email_delivery")).rows[0]
        .provider_message_id;
      await store.providerEvent({ messageId }, "rebond");
      expect((await store.subscription(userId))?.status).toBe("suspendue");
    });

    it("exporte puis efface la veille d'un utilisateur", async () => {
      await subscribeAndConfirm();
      const exp = await request(app())
        .get(`/internal/v1/users/${userId}/export`)
        .auth(await t.service("users:export"), { type: "bearer" });
      expect(exp.body.data.veille).toMatchObject({ city: "Berlin" });
      await request(app())
        .delete(`/internal/v1/users/${userId}`)
        .auth(await t.service("users:delete"), { type: "bearer" })
        .expect(204);
      expect(await store.subscription(userId)).toBeUndefined();
      expect((await pool.query("SELECT 1 FROM watch_consent")).rowCount).toBe(0);
    });

    it("donne des compteurs à l'administrateur et purge les veilles non confirmées", async () => {
      await request(app())
        .put("/v1/subscriptions/me")
        .auth(await t.user(userId), { type: "bearer" })
        .send(input);
      const admin = await t.user(randomUUID(), "admin");
      const stats = await request(app()).get("/v1/admin/stats").auth(admin, { type: "bearer" });
      expect(stats.body.counters).toMatchObject({ pending: 1, active: 0 });
      await pool.query("UPDATE watch_subscription SET created_at = now() - interval '8 days'");
      expect((await store.purge()).veillesNonConfirmees).toBe(1);
    });
  });
});
