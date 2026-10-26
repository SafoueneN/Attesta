import { Me, RecoveryCodes, SessionResponse } from "@attesta/shared-schemas";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db.js";
import { loadSigner, type Signer } from "../src/keys.js";
import { MemoryMailer } from "../src/mail.js";
import { AuthStore } from "../src/store.js";
import { testLogger } from "./helpers.js";
import { createTestDatabase } from "./pg.js";

/*
 * Comptes par identifiant et mot de passe (ADR 0030) et codes de récupération (ADR 0039), testés par l'API
 * seule : partitions d'équivalence et valeurs limites des entrées, puis parcours complets.
 */

const db = await createTestDatabase("authpw");
const PASSWORD = "mot-de-passe-solide";

describe.skipIf(!db)("comptes par identifiant (intégration PostgreSQL)", () => {
  let pool: pg.Pool;
  let store: AuthStore;
  let signer: Signer;

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
      "TRUNCATE app_user, recovery_code, refresh_token, consent_log, audit_event, outbox CASCADE",
    );
  });

  const app = (overrides: Partial<Parameters<typeof createApp>[0]> = {}) =>
    createApp({
      ...testLogger(),
      readiness: {},
      store,
      signer,
      mailer: new MemoryMailer(),
      clients: new Map(),
      appBaseUrl: "http://localhost:8080",
      adminEmails: [],
      adminUsernames: ["admin"],
      ipHashSecret: "secret-ip-de-test-0000",
      serviceSecrets: new Map(),
      cookies: { path: "/api/auth/v1/session", secure: false },
      ...overrides,
    });

  const create = (a: ReturnType<typeof app>, username: string, password = PASSWORD) =>
    request(a).post("/v1/accounts").send({ username, password, policyAccepted: true });
  const login = (a: ReturnType<typeof app>, username: string, password = PASSWORD) =>
    request(a).post("/v1/session/password").send({ username, password });

  describe("création : partitions et valeurs limites", () => {
    it.each([
      ["2 caractères (limite basse − 1)", "ab", 400],
      ["3 caractères (limite basse)", "abc", 201],
      ["30 caractères (limite haute)", "a".repeat(30), 201],
      ["31 caractères (limite haute + 1)", "a".repeat(31), 400],
      ["majuscules ramenées en minuscules", "Lea.Martin", 201],
      ["accent (classe invalide)", "léa", 400],
      ["espace intérieure (classe invalide)", "lea martin", 400],
      ["commence par un point (classe invalide)", ".lea", 400],
    ])("identifiant %s → %i", async (_cas, username, status) => {
      expect((await create(app(), username)).status).toBe(status);
    });

    it.each([
      ["9 caractères (limite basse − 1)", 9, 400],
      ["10 caractères (limite basse)", 10, 201],
      ["128 caractères (limite haute)", 128, 201],
      ["129 caractères (limite haute + 1)", 129, 400],
    ])("mot de passe de %s → %i", async (_cas, length, status) => {
      const res = await create(app(), `user${length}`, "x".repeat(length));
      expect(res.status).toBe(status);
      if (status === 400) expect(res.body.errors[0]).toMatchObject({ champ: "password" });
    });

    it("exige l'acceptation de la politique de confidentialité", async () => {
      const res = await request(app())
        .post("/v1/accounts")
        .send({ username: "lea", password: PASSWORD, policyAccepted: false });
      expect(res.status).toBe(400);
      expect(res.body.errors[0]).toMatchObject({ champ: "policyAccepted" });
    });
  });

  describe("création et connexion", () => {
    it("crée le compte sans e-mail et remet 8 codes de récupération lisibles", async () => {
      const res = await create(app(), "Lea.Martin");
      expect(res.status).toBe(201);
      const session = SessionResponse.parse(res.body);
      expect(session.user).toMatchObject({ role: "candidate", username: "lea.martin" });
      expect(session.user).not.toHaveProperty("email");
      expect(session.recoveryCodes).toHaveLength(8);
      for (const code of session.recoveryCodes!)
        expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      expect(new Set(session.recoveryCodes).size).toBe(8);
      expect(String(res.headers["set-cookie"])).toMatch(/attesta_rt=/);
      // Les codes ne sont stockés qu'en empreinte.
      const stored = await pool.query("SELECT code_hash FROM recovery_code");
      expect(JSON.stringify(stored.rows)).not.toContain(session.recoveryCodes![0]!.replace("-", ""));
    });

    it("refuse un identifiant déjà pris, et les identifiants réservés à l'administration", async () => {
      const a = app();
      await create(a, "lea").expect(201);
      const taken = await create(a, "LEA");
      expect(taken.status).toBe(409);
      expect(taken.body.errors[0]).toMatchObject({ champ: "username" });
      expect((await create(a, "admin")).status).toBe(409);
    });

    it("connecte avec le bon mot de passe ; même réponse pour un mauvais mot de passe ou un compte inconnu", async () => {
      const a = app();
      await create(a, "lea").expect(201);
      const ok = await login(a, " LEA ");
      expect(ok.status).toBe(200);
      expect(SessionResponse.parse(ok.body).user.username).toBe("lea");
      const wrong = await login(a, "lea", "mauvais-mot-de-passe");
      const unknown = await login(a, "personne", "mauvais-mot-de-passe");
      expect([wrong.status, unknown.status]).toEqual([401, 401]);
      expect(wrong.body.title).toBe(unknown.body.title);
    });

    it("bloque un identifiant après trop d'échecs, sans bloquer les autres", async () => {
      const a = app({ passwordFailuresPer15Min: 3 });
      await create(a, "lea").expect(201);
      await create(a, "karim").expect(201);
      for (let i = 0; i < 3; i++) await login(a, "lea", "mauvais-mot-de-passe").expect(401);
      expect((await login(a, "lea")).status).toBe(429);
      expect((await login(a, "karim")).status).toBe(200);
    });
  });

  describe("mot de passe oublié, codes de récupération, changement", () => {
    it("réinitialise avec un code (saisie tolérante), une seule fois, puis connecte avec le nouveau mot de passe", async () => {
      const a = app();
      const codes = SessionResponse.parse((await create(a, "lea")).body).recoveryCodes!;
      const sloppy = ` ${codes[0]!.toLowerCase().replace("-", " ")} `;
      const reset = await request(a)
        .post("/v1/password/reset")
        .send({ username: "lea", code: sloppy, password: "nouveau-mot-de-passe" });
      expect(reset.status).toBe(200);
      expect((await login(a, "lea")).status).toBe(401);
      expect((await login(a, "lea", "nouveau-mot-de-passe")).status).toBe(200);

      const again = await request(a)
        .post("/v1/password/reset")
        .send({ username: "lea", code: codes[0], password: "encore-un-autre-mdp" });
      expect(again.status).toBe(400);
      expect(again.body.title).toBe("Identifiant ou code de récupération incorrect.");

      const token = SessionResponse.parse(reset.body).accessToken;
      const me = Me.parse((await request(a).get("/v1/me").auth(token, { type: "bearer" })).body);
      expect(me.recoveryCodesLeft).toBe(7);
    });

    it("refuse un code inventé, et un code valide d'un autre compte", async () => {
      const a = app();
      await create(a, "lea").expect(201);
      const karim = SessionResponse.parse((await create(a, "karim")).body).recoveryCodes!;
      for (const code of ["AAAA-AAAA", karim[0]!]) {
        const res = await request(a)
          .post("/v1/password/reset")
          .send({ username: "lea", code, password: "nouveau-mot-de-passe" });
        expect(res.status).toBe(400);
      }
    });

    it("régénère les codes : les anciens ne servent plus", async () => {
      const a = app();
      const first = SessionResponse.parse((await create(a, "lea")).body);
      const res = await request(a).post("/v1/me/recovery-codes").auth(first.accessToken, { type: "bearer" });
      const fresh = RecoveryCodes.parse(res.body).codes;
      expect(fresh).toHaveLength(8);
      const old = await request(a)
        .post("/v1/password/reset")
        .send({ username: "lea", code: first.recoveryCodes![0], password: "nouveau-mot-de-passe" });
      expect(old.status).toBe(400);
      const ok = await request(a)
        .post("/v1/password/reset")
        .send({ username: "lea", code: fresh[0], password: "nouveau-mot-de-passe" });
      expect(ok.status).toBe(200);
    });

    it("change le mot de passe seulement avec le mot de passe actuel", async () => {
      const a = app();
      const { accessToken } = SessionResponse.parse((await create(a, "lea")).body);
      const change = (current: string) =>
        request(a)
          .put("/v1/me/password")
          .auth(accessToken, { type: "bearer" })
          .send({ current, password: "nouveau-mot-de-passe" });
      const wrong = await change("pas-le-bon-mot-de-passe");
      expect(wrong.status).toBe(400);
      expect(wrong.body.errors[0]).toMatchObject({ champ: "current" });
      expect((await change(PASSWORD)).status).toBe(200);
      expect((await login(a, "lea")).status).toBe(401);
      expect((await login(a, "lea", "nouveau-mot-de-passe")).status).toBe(200);
    });
  });
});
