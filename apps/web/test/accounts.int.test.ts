import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LOCK_TIMEOUT_MS, lockTestDatabase } from "../../../test-support/db-lock.js";
import { MemoryMailer } from "@attesta/jobwatch";
import { createLogger, loadConfig } from "@attesta/shared";
import { createApp } from "../src/app.js";
import { csrfFrom, FakeRenderer, submit, validBasics, validParcours } from "./helpers.js";

/** Comptes et veille sur un vrai PostgreSQL migré. Adresses fictives. */
const url = process.env.TEST_DATABASE_URL;
if (process.env.CI && !url) throw new Error("TEST_DATABASE_URL est requis en CI");

const WEBHOOK_TOKEN = "w".repeat(40);

describe.skipIf(!url)("comptes et veille (PostgreSQL)", () => {
  const pool = new pg.Pool({ connectionString: url });
  let unlock: () => Promise<void> = async () => {};
  beforeAll(async () => {
    unlock = await lockTestDatabase(url!);
  }, LOCK_TIMEOUT_MS);
  afterAll(async () => {
    await pool.end();
    await unlock();
  });
  beforeEach(() => pool.query("TRUNCATE app_user, login_token, email_event, rate_limit CASCADE"));

  function setup() {
    const mailer = new MemoryMailer();
    const app = createApp({
      config: loadConfig({ SESSION_SECRET: "s".repeat(32), SESSION_STORE: "memory", NODE_ENV: "test" }),
      logger: createLogger("silent"),
      renderer: new FakeRenderer(),
      pool,
      limits: { general: 1000, export: 100, login: 100, loginPerEmail: 3 },
      accounts: { mailer, baseUrl: "https://attesta.example", brevoWebhookToken: WEBHOOK_TOKEN },
    });
    return { app, mailer, agent: request.agent(app) };
  }

  const linkIn = (text: string, path: string) =>
    new RegExp(`https://attesta\\.example(${path}/[A-Za-z0-9_-]+)`).exec(text)?.[1] ?? "";

  async function login(
    agent: ReturnType<typeof request.agent>,
    mailer: MemoryMailer,
    email = "lea@example.org",
  ) {
    const page = await agent.get("/compte/connexion");
    await agent
      .post("/compte/connexion")
      .type("form")
      .send({ _csrf: csrfFrom(page.text), email, policy: "yes" });
    const path = linkIn(mailer.sent.at(-1)!.text, "/compte/connexion");
    const confirm = await agent.get(path);
    return agent
      .post(path)
      .type("form")
      .send({ _csrf: csrfFrom(confirm.text) });
  }

  async function accountForm(agent: ReturnType<typeof request.agent>) {
    return csrfFrom((await agent.get("/compte")).text);
  }

  async function saveProfile(agent: ReturnType<typeof request.agent>) {
    const csrf = await accountForm(agent);
    return agent.post("/compte/profil").type("form").send({ _csrf: csrf });
  }

  it("connexion par lien à usage unique ; création du compte avec consentement journalisé", async () => {
    const { agent, mailer } = setup();
    expect((await agent.get("/compte")).headers.location).toBe("/compte/connexion");

    const page = await agent.get("/compte/connexion");
    const refused = await agent
      .post("/compte/connexion")
      .type("form")
      .send({ _csrf: csrfFrom(page.text), email: "lea@example.org" });
    expect(refused.status).toBe(422);
    expect(refused.text).toContain("politique de confidentialité");

    const done = await login(agent, mailer, "Lea@Example.org");
    expect(done.headers.location).toBe("/compte");
    expect(mailer.sent[0]!.to).toBe("lea@example.org");
    expect((await agent.get("/compte")).text).toContain("lea@example.org");

    const consent = await pool.query("SELECT purpose, granted, policy_version FROM consent_log");
    expect(consent.rows).toEqual([{ purpose: "service", granted: true, policy_version: "2026-10-16" }]);
    expect((await pool.query("SELECT count(*)::int AS n FROM login_token")).rows[0].n).toBe(0);

    // Le lien ne sert qu'une fois.
    const path = linkIn(mailer.sent[0]!.text, "/compte/connexion");
    const other = request.agent(setup().app);
    const replay = await other.get(path);
    expect(
      (
        await other
          .post(path)
          .type("form")
          .send({ _csrf: csrfFrom(replay.text) })
      ).status,
    ).toBe(410);
  });

  it("connexion : l'adresse saisie dans le CV est proposée par défaut", async () => {
    const { agent } = setup();
    await submit(agent, 1, { ...validBasics, "basics[email]": "lea.martin@example.org" });
    const page = await agent.get("/compte/connexion");
    expect(page.text).toContain('value="lea.martin@example.org"');
    expect(page.text).toContain("un seul e-mail par jour");
  });

  it("demande de lien : même réponse que l'adresse ait un compte ou non", async () => {
    const { agent, mailer } = setup();
    await login(agent, mailer, "connu@example.org");
    const anonymous = request.agent(setup().app);
    const responses = [];
    for (const email of ["connu@example.org", "inconnu@example.org"]) {
      const page = await anonymous.get("/compte/connexion");
      const res = await anonymous
        .post("/compte/connexion")
        .type("form")
        .send({ _csrf: csrfFrom(page.text), email, policy: "yes" });
      responses.push([res.status, res.text.replace(/name="_csrf" value="[^"]+"/, "")]);
    }
    expect(responses[0]).toEqual(responses[1]);
  });

  it("profil, veille en double opt-in, désabonnement en un clic (RFC 8058)", async () => {
    const { agent, mailer } = setup();
    await login(agent, mailer);

    // Aucun CV dans la session : rien à enregistrer.
    await saveProfile(agent);
    expect((await agent.get("/compte")).text).toContain("Aucun CV complet");

    await submit(agent, 1, validBasics);
    await submit(agent, 2, validParcours);
    await saveProfile(agent);
    expect((await agent.get("/compte")).text).toContain("Profil enregistré (version 1)");

    const subscribe = (fields: Record<string, string>) =>
      accountForm(agent).then((csrf) =>
        agent
          .post("/compte/veille")
          .type("form")
          .send({ _csrf: csrf, ...fields }),
      );
    const base = {
      occupations: "Développeuse back-end",
      country: "DE",
      radiusKm: "25",
      workingTime: "plein",
    };

    const unknownCity = await subscribe({ ...base, city: "Atlantis", consent: "yes" });
    expect(unknownCity.status).toBe(422);
    expect(unknownCity.text).toContain("Ville introuvable");
    expect((await subscribe({ ...base, city: "Munich" })).status).toBe(422);

    await subscribe({ ...base, city: "Munich", consent: "yes" });
    const sub = await pool.query("SELECT status, city, lat, unsubscribe_token FROM watch_subscription");
    expect(sub.rows[0]).toMatchObject({ status: "en_attente", city: "Munich" });
    expect(sub.rows[0].lat).toBeCloseTo(48.14, 1);

    const confirmPath = linkIn(mailer.sent.at(-1)!.text, "/veille/confirmer");
    expect(mailer.sent.at(-1)!.subject).toContain("confirmez");
    const anonymous = request(setup().app);
    expect((await anonymous.get(confirmPath)).headers["referrer-policy"]).toBe("no-referrer");
    expect((await anonymous.post(confirmPath)).status).toBe(200);
    expect((await anonymous.post(confirmPath)).status).toBe(410);
    expect((await pool.query("SELECT status FROM watch_subscription")).rows[0].status).toBe("active");

    // Modifier les critères d'une veille active ne redemande pas de confirmation.
    const sentBefore = mailer.sent.length;
    await subscribe({ ...base, city: "Berlin", consent: "yes" });
    expect(mailer.sent).toHaveLength(sentBefore);
    expect((await pool.query("SELECT status, city FROM watch_subscription")).rows[0]).toEqual({
      status: "active",
      city: "Berlin",
    });

    // Désabonnement en un clic : POST sans cookie ni CSRF, le jeton suffit.
    const token = sub.rows[0].unsubscribe_token;
    const oneClick = await anonymous
      .post(`/veille/desabonner/${token}`)
      .type("form")
      .send("List-Unsubscribe=One-Click");
    expect(oneClick.status).toBe(200);
    expect((await pool.query("SELECT status FROM watch_subscription")).rows[0].status).toBe("desabonnee");
    const consents = await pool.query("SELECT purpose, granted FROM consent_log ORDER BY id");
    expect(consents.rows.map((r) => `${r.purpose}:${r.granted}`)).toEqual([
      "service:true",
      "veille:true", // demande
      "veille:true", // confirmation (double opt-in)
      "veille:true", // modification des critères
      "veille:false", // désabonnement
    ]);
    expect((await anonymous.post("/veille/desabonner/inconnu-inconnu-inconnu-0")).status).toBe(410);
  });

  it("webhook Brevo : authentifié ; une plainte arrête la veille", async () => {
    const { app, agent, mailer } = setup();
    await login(agent, mailer);
    const user = (await pool.query("SELECT id FROM app_user")).rows[0].id;
    const version = await pool.query(
      "INSERT INTO profile_version (user_id, version, data, schema_version) VALUES ($1, 1, '{}', '1') RETURNING id",
      [user],
    );
    const sub = await pool.query(
      `INSERT INTO watch_subscription (user_id, profile_version_id, occupations, country, city, lat, lon, radius_km,
         working_time, status, unsubscribe_token) VALUES ($1, $2, '{x}', 'DE', 'Berlin', 52.5, 13.4, 25, 'plein', 'active', 't')
       RETURNING id`,
      [user, version.rows[0].id],
    );
    await pool.query(
      "INSERT INTO email_delivery (subscription_id, run_date, offers, provider_message_id, status) VALUES ($1, '2026-10-16', 3, '<m1@brevo>', 'envoye')",
      [sub.rows[0].id],
    );

    const event = { event: "spam", email: "lea@example.org", "message-id": "<m1@brevo>" };
    expect((await request(app).post("/webhooks/brevo").send(event)).status).toBe(401);
    // Jeton de même longueur en caractères, mais pas en octets : 401, jamais 500.
    expect(
      (
        await request(app)
          .post("/webhooks/brevo")
          .set("Authorization", `Bearer ${"é".repeat(40)}`)
          .send(event)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/webhooks/brevo")
          .set("Authorization", `Bearer ${"x".repeat(40)}`)
          .send(event)
      ).status,
    ).toBe(401);
    const ok = await request(app)
      .post("/webhooks/brevo")
      .set("Authorization", `Bearer ${WEBHOOK_TOKEN}`)
      .send(event);
    expect(ok.status).toBe(204);

    expect((await pool.query("SELECT status FROM watch_subscription")).rows[0].status).toBe("desabonnee");
    expect((await pool.query("SELECT status FROM email_delivery")).rows[0].status).toBe("plainte");
    expect((await pool.query("SELECT event FROM email_event")).rows).toEqual([{ event: "plainte" }]);
  });

  it("webhook : l'envoi est retrouvé par l'en-tête X-Mailin-custom (identifiant Brevo différent)", async () => {
    const { app, agent, mailer } = setup();
    await login(agent, mailer);
    const user = (await pool.query("SELECT id FROM app_user")).rows[0].id;
    const version = await pool.query(
      "INSERT INTO profile_version (user_id, version, data, schema_version) VALUES ($1, 1, '{}', '1') RETURNING id",
      [user],
    );
    const sub = await pool.query(
      `INSERT INTO watch_subscription (user_id, profile_version_id, occupations, country, city, lat, lon, radius_km,
         working_time, status, unsubscribe_token) VALUES ($1, $2, '{x}', 'DE', 'Berlin', 52.5, 13.4, 25, 'plein', 'active', 't')
       RETURNING id`,
      [user, version.rows[0].id],
    );
    const delivery = await pool.query(
      "INSERT INTO email_delivery (subscription_id, run_date, offers, provider_message_id, status) VALUES ($1, '2026-10-16', 3, '<nodemailer@attesta>', 'envoye') RETURNING id",
      [sub.rows[0].id],
    );
    const event = {
      event: "hard_bounce",
      "message-id": "<202610161200.123@smtp-relay.mailin.fr>",
      "X-Mailin-custom": delivery.rows[0].id,
    };
    const ok = await request(app)
      .post("/webhooks/brevo")
      .set("Authorization", `Bearer ${WEBHOOK_TOKEN}`)
      .send(event);
    expect(ok.status).toBe(204);
    expect((await pool.query("SELECT status FROM watch_subscription")).rows[0].status).toBe("suspendue");
    expect((await pool.query("SELECT status FROM email_delivery")).rows[0].status).toBe("rebond");
  });

  it("page de connexion : adresse du compte affichée masquée ; lien inconnu refusé dès l'ouverture", async () => {
    const { agent, mailer } = setup();
    const page = await agent.get("/compte/connexion");
    await agent
      .post("/compte/connexion")
      .type("form")
      .send({ _csrf: csrfFrom(page.text), email: "lea.martin@example.org", policy: "yes" });
    const confirm = await agent.get(linkIn(mailer.sent[0]!.text, "/compte/connexion"));
    expect(confirm.text).toContain("l***@example.org");
    expect(confirm.text).not.toContain("lea.martin");
    expect((await agent.get("/compte/connexion/inconnu-inconnu-inconnu-0")).status).toBe(410);
  });

  it("demandes de lien plafonnées par adresse, quelle que soit l'IP", async () => {
    const { app, mailer } = setup();
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const visitor = request.agent(app);
      const page = await visitor.get("/compte/connexion");
      const res = await visitor
        .post("/compte/connexion")
        .type("form")
        .send({ _csrf: csrfFrom(page.text), email: "cible@example.org", policy: "yes" });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(mailer.sent).toHaveLength(3);
  });

  it("export de toutes les données, puis suppression définitive en cascade", async () => {
    const { agent, mailer } = setup();
    await login(agent, mailer);
    await submit(agent, 1, validBasics);
    await submit(agent, 2, validParcours);
    await saveProfile(agent);

    const other = setup();
    await login(other.agent, other.mailer, "autre@example.org");

    const exported = await agent.get("/compte/export");
    expect(exported.headers["content-disposition"]).toContain("attesta-mes-donnees.json");
    const data = JSON.parse(exported.text);
    expect(data.compte.email).toBe("lea@example.org");
    expect(data.profils).toHaveLength(1);
    expect(data.profils[0].data.basics.name).toBe("Léa Martin");
    expect(exported.text).not.toContain("autre@example.org");

    const csrf = await accountForm(agent);
    await agent.post("/compte/supprimer").type("form").send({ _csrf: csrf });
    expect((await pool.query("SELECT count(*)::int AS n FROM app_user")).rows[0].n).toBe(2);

    const deleted = await agent.post("/compte/supprimer").type("form").send({ _csrf: csrf, confirm: "yes" });
    expect(deleted.headers.location).toBe("/?efface=1");
    const left = await pool.query("SELECT email FROM app_user");
    expect(left.rows).toEqual([{ email: "autre@example.org" }]);
    expect((await pool.query("SELECT count(*)::int AS n FROM profile_version")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM consent_log")).rows[0].n).toBe(1);
    expect((await agent.get("/compte")).headers.location).toBe("/compte/connexion");
  });

  it("formulaires du compte protégés par CSRF ; demandes de lien limitées par IP", async () => {
    const { agent, mailer } = setup();
    await login(agent, mailer);
    expect((await agent.post("/compte/profil").type("form").send({})).status).toBe(403);

    const limited = createApp({
      config: loadConfig({ SESSION_SECRET: "s".repeat(32), SESSION_STORE: "memory", NODE_ENV: "test" }),
      logger: createLogger("silent"),
      renderer: new FakeRenderer(),
      pool,
      limits: { general: 1000, export: 100, login: 2 },
      accounts: { mailer: new MemoryMailer(), baseUrl: "https://attesta.example" },
    });
    await pool.query("TRUNCATE rate_limit");
    const visitor = request.agent(limited);
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const page = await visitor.get("/compte/connexion");
      const res = await visitor
        .post("/compte/connexion")
        .type("form")
        .send({ _csrf: csrfFrom(page.text), email: `x${i}@example.org`, policy: "yes" });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 429]);
  });

  it("sans serveur d'envoi : comptes désactivés, lien absent de l'en-tête", async () => {
    const app = createApp({
      config: loadConfig({ SESSION_SECRET: "s".repeat(32), SESSION_STORE: "memory", NODE_ENV: "test" }),
      logger: createLogger("silent"),
      renderer: new FakeRenderer(),
      pool,
    });
    expect((await request(app).get("/compte/connexion")).status).toBe(404);
    expect((await request(app).get("/")).text).not.toContain('href="/compte"');
    expect((await request(app).get("/confidentialite")).status).toBe(200);
  });
});
