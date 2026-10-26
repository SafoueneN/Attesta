import { createServiceClient, createVerifier } from "@attesta/http-kit";
import { AuthAdminStats, Me, SessionResponse } from "@attesta/shared-schemas";
import { createLocalJWKSet } from "jose";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db.js";
import { loadSigner, type Signer } from "../src/keys.js";
import { MemoryMailer } from "../src/mail.js";
import { processOutbox, exportAll } from "../src/rgpd.js";
import { AuthStore } from "../src/store.js";
import { testLogger } from "./helpers.js";
import { createTestDatabase } from "./pg.js";

const db = await createTestDatabase("auth");
const SECRET = "secret-de-service-job-watch-0000000000";

/** Faux services détenteurs : réponses enregistrées par cible. */
function fakeHolders(behaviour: Record<string, () => Response>) {
  const calls: { target: string; method: string; url: string }[] = [];
  const clients = new Map(
    Object.entries(behaviour).map(([target, respond]) => [
      target,
      createServiceClient({
        target,
        baseUrl: `http://${target}`,
        retries: 0,
        fetchImpl: (async (url: string, init: RequestInit) => {
          calls.push({ target, method: String(init.method), url });
          return respond();
        }) as unknown as typeof fetch,
      }),
    ]),
  );
  return { clients, calls };
}

const ok = (body: unknown = { service: "x", data: { profils: [] } }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe.skipIf(!db)("service auth (intégration PostgreSQL)", () => {
  let pool: pg.Pool;
  let store: AuthStore;
  let signer: Signer;
  let mailer: MemoryMailer;
  let holders: ReturnType<typeof fakeHolders>;

  beforeAll(async () => {
    await migrate(db!.url);
    pool = new pg.Pool({ connectionString: db!.url, max: 3 });
    store = new AuthStore(pool);
    signer = await loadSigner(undefined, "cle-test");
  });
  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE app_user, login_token, refresh_token, consent_log, audit_event, outbox CASCADE",
    );
    mailer = new MemoryMailer();
    holders = fakeHolders({ profiles: () => ok(), "job-watch": () => ok() });
  });

  const app = (overrides: Partial<Parameters<typeof createApp>[0]> = {}) =>
    createApp({
      ...testLogger(),
      readiness: {},
      store,
      signer,
      mailer,
      clients: holders.clients,
      appBaseUrl: "http://localhost:8080",
      adminEmails: ["admin@example.org"],
      ipHashSecret: "secret-ip-de-test-0000",
      serviceSecrets: new Map([["job-watch", SECRET]]),
      cookies: { path: "/api/auth/v1/session", secure: false },
      ...overrides,
    });

  const tokenFromMail = (index = -1) =>
    /\/connexion\/([A-Za-z0-9_-]+)/.exec(mailer.sent.at(index)!.text)![1]!;

  async function login(email = "lea@example.org", a = app()) {
    await request(a).post("/v1/login-links").send({ email, policyAccepted: true }).expect(202);
    const res = await request(a).post("/v1/session").send({ token: tokenFromMail() }).expect(200);
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("attesta_rt="),
    )!;
    return { body: SessionResponse.parse(res.body), cookie: cookie.split(";")[0]!, raw: cookie };
  }

  describe("connexion par lien", () => {
    it("envoie un lien vers le frontend, sans révéler si le compte existe", async () => {
      const res = await request(app())
        .post("/v1/login-links")
        .send({ email: "Lea@Example.org", policyAccepted: true });
      expect(res.status).toBe(202);
      expect(mailer.sent[0]!.to).toBe("lea@example.org");
      expect(mailer.sent[0]!.text).toMatch(/http:\/\/localhost:8080\/connexion\/[A-Za-z0-9_-]{40,}/);
    });

    it("exige une adresse valide et l'acceptation de la politique", async () => {
      const res = await request(app())
        .post("/v1/login-links")
        .send({ email: "pas-une-adresse", policyAccepted: false });
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { champ: string }) => e.champ).sort()).toEqual([
        "email",
        "policyAccepted",
      ]);
      expect(mailer.sent).toHaveLength(0);
    });

    it("limite les demandes par adresse", async () => {
      const a = app({ loginLinksPerHour: 2 });
      for (let i = 0; i < 2; i++)
        await request(a).post("/v1/login-links").send({ email: "x@example.org", policyAccepted: true });
      const res = await request(a)
        .post("/v1/login-links")
        .send({ email: "x@example.org", policyAccepted: true });
      expect(res.status).toBe(429);
    });

    it("présente l'adresse masquée sans consommer le lien", async () => {
      const a = app();
      await request(a).post("/v1/login-links").send({ email: "lea@example.org", policyAccepted: true });
      const token = tokenFromMail();
      const preview = await request(a).get(`/v1/login-links/${token}`);
      expect(preview.body).toEqual({ maskedEmail: "l***@example.org" });
      expect((await request(a).post("/v1/session").send({ token })).status).toBe(200);
      expect((await request(a).get(`/v1/login-links/${token}`)).status).toBe(410);
    });

    it("ouvre la session : jeton vérifiable sans e-mail, cookie HttpOnly strict sur le chemin de session", async () => {
      const { body, raw } = await login();
      const principal = await signer.verifier.verify(body.accessToken);
      expect(principal).toMatchObject({ role: "candidate", sub: body.user.id });
      const [, payload] = body.accessToken.split(".");
      expect(Buffer.from(payload!, "base64url").toString()).not.toContain("lea@");
      expect(raw).toMatch(/HttpOnly/);
      expect(raw).toMatch(/SameSite=Strict/);
      expect(raw).toMatch(/Path=\/api\/auth\/v1\/session/);
    });

    it("refuse un lien déjà utilisé", async () => {
      const a = app();
      await login("lea@example.org", a);
      const res = await request(a).post("/v1/session").send({ token: tokenFromMail() });
      expect(res.status).toBe(410);
      expect(res.body.title).toMatch(/plus valide/);
    });

    it("donne le rôle administrateur aux adresses déclarées (ADR 0024)", async () => {
      const { body } = await login("admin@example.org");
      expect(body.user.role).toBe("admin");
    });

    it("journalise le consentement au service à la création du compte", async () => {
      const { body } = await login();
      const me = await request(app()).get("/v1/me").auth(body.accessToken, { type: "bearer" });
      expect(me.status).toBe(200);
      const parsed = Me.parse(me.body);
      expect(parsed.email).toBe("lea@example.org");
      expect(parsed.consents).toEqual([expect.objectContaining({ purpose: "service", granted: true })]);
    });
  });

  describe("refresh rotatif", () => {
    const refresh = (cookie: string, a = app()) =>
      request(a).post("/v1/session/refresh").set("Cookie", cookie).set("X-Attesta-Csrf", "1");

    it("tourne le refresh token à chaque usage", async () => {
      const { cookie } = await login();
      const first = await refresh(cookie);
      expect(first.status).toBe(200);
      const next = (first.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
      expect(next).not.toBe(cookie);
      expect((await refresh(next)).status).toBe(200);
    });

    it("révoque toute la famille si un jeton déjà tourné est rejoué (vol présumé)", async () => {
      const { cookie } = await login();
      const first = await refresh(cookie);
      const next = (first.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
      expect((await refresh(cookie)).status).toBe(401);
      expect((await refresh(next)).status).toBe(401);
    });

    it("exige l'en-tête anti-CSRF", async () => {
      const { cookie } = await login();
      const res = await request(app()).post("/v1/session/refresh").set("Cookie", cookie);
      expect(res.status).toBe(403);
    });

    it("refuse sans session", async () => {
      const res = await request(app()).post("/v1/session/refresh").set("X-Attesta-Csrf", "1");
      expect(res.status).toBe(401);
    });

    it("déconnexion : le refresh token ne sert plus", async () => {
      const { cookie } = await login();
      await request(app()).delete("/v1/session").set("Cookie", cookie).set("X-Attesta-Csrf", "1").expect(204);
      expect((await refresh(cookie)).status).toBe(401);
    });
  });

  describe("invité", () => {
    it("délivre un jeton d'invité, repris au rechargement grâce à son cookie", async () => {
      const a = app();
      const first = await request(a).post("/v1/session/guest").set("X-Attesta-Csrf", "1").expect(200);
      const guest = SessionResponse.parse(first.body);
      expect(guest.user.role).toBe("guest");
      expect(guest.user.id).toMatch(/^guest_/);
      expect(guest.expiresIn).toBeLessThanOrEqual(2 * 60 * 60);
      const cookie = (first.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
      const again = await request(a)
        .post("/v1/session/refresh")
        .set("Cookie", cookie)
        .set("X-Attesta-Csrf", "1");
      expect(again.body.user.id).toBe(guest.user.id);
    });

    it("un invité n'accède pas au compte", async () => {
      const guest = await request(app()).post("/v1/session/guest").set("X-Attesta-Csrf", "1");
      const res = await request(app()).get("/v1/me").auth(guest.body.accessToken, { type: "bearer" });
      expect(res.status).toBe(403);
    });
  });

  describe("compte et RGPD", () => {
    it("journalise le consentement aux communications", async () => {
      const { body } = await login();
      await request(app())
        .put("/v1/me/consents")
        .auth(body.accessToken, { type: "bearer" })
        .send({ purpose: "promo", granted: true })
        .expect(204);
      const me = await request(app()).get("/v1/me").auth(body.accessToken, { type: "bearer" });
      expect(me.body.consents.map((c: { purpose: string }) => c.purpose)).toEqual(["service", "promo"]);
    });

    it("exporte les données de chaque service dans une seule archive", async () => {
      const { body } = await login();
      const res = await request(app()).get("/v1/me/export").auth(body.accessToken, { type: "bearer" });
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toMatch(/attesta-mes-donnees\.json/);
      const archive = JSON.parse(res.text);
      expect(archive.auth.compte.email).toBe("lea@example.org");
      expect(Object.keys(archive)).toEqual(expect.arrayContaining(["profiles", "job-watch"]));
    });

    it("refuse un export incomplet si un service ne répond pas", async () => {
      const { body } = await login();
      const broken = fakeHolders({ profiles: () => new Response(null, { status: 503 }) });
      await expect(exportAll({ store, signer, clients: broken.clients }, body.user.id)).rejects.toMatchObject(
        {
          status: 503,
        },
      );
    });

    it("supprime le compte : jetons révoqués tout de suite, puis effacement propagé à chaque service", async () => {
      const { body, cookie } = await login();
      await request(app()).delete("/v1/me").auth(body.accessToken, { type: "bearer" }).send({}).expect(400);
      const res = await request(app())
        .delete("/v1/me")
        .auth(body.accessToken, { type: "bearer" })
        .send({ confirm: true });
      expect(res.status).toBe(202);
      expect(res.body.message).toBe("Vos données ont été effacées.");
      const refreshed = await request(app())
        .post("/v1/session/refresh")
        .set("Cookie", cookie)
        .set("X-Attesta-Csrf", "1");
      expect(refreshed.status).toBe(401);
      expect((await request(app()).get("/v1/me").auth(body.accessToken, { type: "bearer" })).status).toBe(
        401,
      );

      await processOutbox({ store, signer, logger: testLogger().logger, clients: holders.clients });
      expect(holders.calls.map((c) => `${c.target} ${c.method}`).sort()).toEqual([
        "job-watch DELETE",
        "profiles DELETE",
      ]);
      expect(await store.user(body.user.id)).toBeUndefined();
      const audit = await pool.query("SELECT type FROM audit_event WHERE user_id = $1 ORDER BY id", [
        body.user.id,
      ]);
      expect(audit.rows.map((r) => r.type)).toContain("compte_efface");
    });

    it("reprend une suppression quand un service ne répond pas, et n'efface le compte qu'ensuite", async () => {
      const { body } = await login();
      let up = false;
      const flaky = fakeHolders({ profiles: () => new Response(null, { status: up ? 204 : 503 }) });
      await store.requestDeletion(body.user.id, ["profiles"], null);
      await processOutbox({ store, signer, logger: testLogger().logger, clients: flaky.clients });
      expect(await store.user(body.user.id)).toMatchObject({ status: "deleting" });
      await pool.query("UPDATE outbox SET next_attempt_at = now()");
      up = true;
      await processOutbox({ store, signer, logger: testLogger().logger, clients: flaky.clients });
      expect(await store.user(body.user.id)).toBeUndefined();
    });

    it("abandonne après 24 h et le signale à l'administrateur", async () => {
      const { body } = await login();
      const down = fakeHolders({ profiles: () => new Response(null, { status: 503 }) });
      await store.requestDeletion(body.user.id, ["profiles"], null);
      await pool.query("UPDATE outbox SET created_at = now() - interval '25 hours'");
      const { logger, lines } = testLogger();
      await processOutbox({ store, signer, logger, clients: down.clients });
      expect(lines.some((l) => l.event === "rgpd_suppression_abandonnee")).toBe(true);
      expect((await store.stats()).outboxFailed).toBe(1);
    });
  });

  describe("jetons de service et routes internes", () => {
    const ask = (body: object) => request(app()).post("/internal/v1/token").send(body);

    it("délivre un jeton de 5 min, d'audience et de portée minimales", async () => {
      const res = await ask({
        service: "job-watch",
        secret: SECRET,
        audience: "auth",
        scope: "users:contact",
      });
      expect(res.status).toBe(200);
      const principal = await createVerifier(createLocalJWKSet(signer.jwks()), { audience: "auth" }).verify(
        res.body.accessToken,
      );
      expect(principal).toMatchObject({
        sub: "service:job-watch",
        role: "service",
        scope: ["users:contact"],
      });
      await expect(
        createVerifier(createLocalJWKSet(signer.jwks()), { audience: "attesta" }).verify(
          res.body.accessToken,
        ),
      ).rejects.toThrow();
    });

    it.each([
      [
        "un mauvais secret",
        { service: "job-watch", secret: "x".repeat(40), audience: "auth", scope: "users:contact" },
      ],
      [
        "une portée non accordée",
        { service: "job-watch", secret: SECRET, audience: "profiles", scope: "users:delete" },
      ],
      [
        "un service inconnu",
        { service: "inconnu", secret: SECRET, audience: "auth", scope: "users:contact" },
      ],
    ])("refuse %s", async (_label, body) => {
      expect((await ask(body)).status).toBe(403);
    });

    it("donne l'adresse d'envoi à un service autorisé seulement", async () => {
      const { body } = await login();
      const service = await ask({
        service: "job-watch",
        secret: SECRET,
        audience: "auth",
        scope: "users:contact",
      });
      const res = await request(app())
        .get(`/internal/v1/users/${body.user.id}/contact`)
        .auth(service.body.accessToken, { type: "bearer" });
      expect(res.body).toEqual({ id: body.user.id, email: "lea@example.org", status: "active" });
      const asUser = await request(app())
        .get(`/internal/v1/users/${body.user.id}/contact`)
        .auth(body.accessToken, { type: "bearer" });
      expect(asUser.status).toBe(403);
    });
  });

  describe("administration", () => {
    it("réserve les statistiques à l'administrateur, sans donnée personnelle", async () => {
      const candidate = await login("lea@example.org");
      const admin = await login("admin@example.org");
      expect(
        (await request(app()).get("/v1/admin/stats").auth(candidate.body.accessToken, { type: "bearer" }))
          .status,
      ).toBe(403);
      const res = await request(app())
        .get("/v1/admin/stats")
        .auth(admin.body.accessToken, { type: "bearer" });
      expect(AuthAdminStats.parse(res.body)).toMatchObject({ users: 2, admins: 1 });
      expect(JSON.stringify(res.body)).not.toContain("@");
    });

    it("publie le JWKS sans clé privée", async () => {
      const res = await request(app()).get("/.well-known/jwks.json");
      expect(res.body.keys[0]).toMatchObject({
        kid: expect.stringMatching(/^cle-test-/),
        alg: "RS256",
        kty: "RSA",
      });
      expect(res.body.keys[0]).not.toHaveProperty("d");
    });
  });

  describe("purge", () => {
    it("lance la suppression des comptes inactifs depuis 18 mois", async () => {
      const { body } = await login();
      await pool.query("UPDATE app_user SET last_active_at = now() - interval '19 months'");
      expect(await store.purge(["profiles"])).toEqual({ inactive: 1 });
      expect(await store.user(body.user.id)).toMatchObject({ status: "deleting" });
    });
  });
});

describe("service auth (sans base)", () => {
  it("répond à /health et renvoie les erreurs au format commun", async () => {
    const signer = await loadSigner(undefined, "k");
    const a = createApp({
      ...testLogger(),
      readiness: {},
      store: {} as AuthStore,
      signer,
      mailer: new MemoryMailer(),
      clients: new Map(),
      appBaseUrl: "http://localhost:8080",
      adminEmails: [],
      ipHashSecret: "x".repeat(16),
      serviceSecrets: new Map(),
      cookies: { path: "/", secure: false },
    });
    expect((await request(a).get("/health")).body).toEqual({ status: "ok", service: "auth" });
    const res = await request(a).get("/v1/inconnue");
    expect(res.status).toBe(404);
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect((await request(a).get("/v1/me")).status).toBe(401);
  });
});
