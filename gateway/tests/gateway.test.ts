import type { AddressInfo } from "node:net";
import { request as httpRequest, type Server } from "node:http";
import { createVerifier } from "@attesta/http-kit";
import express from "express";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import { isPublic, normalizeRoute } from "../src/routing.js";
import { testLogger } from "./helpers.js";

let privateKey: CryptoKey;
let verifier: ReturnType<typeof createVerifier>;
const seen: { service: string; method: string; url: string; headers: Record<string, unknown> }[] = [];
const servers: Server[] = [];
let config: Config;

/** Faux service : renvoie ce qu'il a reçu, et un flux SSE sur /v1/flux. */
function fakeService(name: string) {
  const app = express();
  app.get("/ready", (_req, res) => res.json({ status: "ok", checks: { base: "ok" } }));
  app.get("/v1/flux", (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write("event: progress\ndata: {}\n\n");
    setTimeout(() => {
      res.write("event: done\ndata: {}\n\n");
      res.end();
    }, 50);
  });
  app.use((req, res) => {
    seen.push({ service: name, method: req.method, url: req.url, headers: req.headers });
    req.resume();
    req.on("end", () => res.json({ service: name, url: req.url }));
  });
  const server = app.listen(0);
  servers.push(server);
  return server;
}

const url = (server: Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k", alg: "RS256" };
  verifier = createVerifier(createLocalJWKSet({ keys: [jwk] }), { audience: "attesta" });
  const auth = fakeService("auth");
  const profiles = fakeService("profiles");
  const cv = fakeService("cv-generation");
  await new Promise((r) => setTimeout(r, 20));
  config = loadConfig({
    AUTH_URL: url(auth),
    PROFILES_URL: url(profiles),
    CV_GENERATION_URL: url(cv),
    // Service arrêté : port fermé.
    JOBS_MATCHING_URL: "http://127.0.0.1:1",
    RATE_LIMIT_LOGIN_PER_HOUR: "2",
  });
});
afterAll(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));

const token = (claims: Record<string, unknown>, aud = "attesta") =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k" })
    .setIssuer("attesta-auth")
    .setAudience(aud)
    .setSubject(String(claims.sub ?? "u-1"))
    .setExpirationTime("5m")
    .sign(privateKey);

const gateway = (overrides: Partial<Config> = {}) =>
  createGateway({ config: { ...config, ...overrides }, logger: testLogger().logger, verifier });

describe("routage", () => {
  it("relaie une route publique sans jeton, préfixe retiré", async () => {
    const res = await request(gateway()).post("/api/auth/v1/session/guest");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ service: "auth", url: "/v1/session/guest" });
  });

  it("exige un jeton ailleurs", async () => {
    const res = await request(gateway()).get("/api/profiles/v1/profiles/me");
    expect(res.status).toBe(401);
    expect(res.body.type).toBe("urn:attesta:erreur:non_authentifie");
  });

  it("transmet la requête authentifiée avec X-Request-Id et X-Forwarded-For", async () => {
    const t = await token({ sub: "u-1", role: "candidate" });
    const id = "6f0e9a3c-1111-4222-8333-944455556666";
    const res = await request(gateway())
      .get("/api/profiles/v1/profiles/me?x=1")
      .set("Authorization", `Bearer ${t}`)
      .set("X-Request-Id", id);
    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBe(id);
    const last = seen.at(-1)!;
    expect(last).toMatchObject({ service: "profiles", url: "/v1/profiles/me?x=1" });
    expect(last.headers["x-request-id"]).toBe(id);
    expect(last.headers.authorization).toBe(`Bearer ${t}`);
    expect(last.headers["x-forwarded-for"]).toBeDefined();
  });

  it("ne route jamais /internal, même avec un jeton valide", async () => {
    const before = seen.length;
    const t = await token({ sub: "u-1", role: "admin" });
    const res = await request(gateway())
      .post("/api/auth/internal/v1/token")
      .set("Authorization", `Bearer ${t}`);
    expect(res.status).toBe(404);
    expect((await request(gateway()).post("/api/auth/INTERNAL/v1/token")).status).toBe(404);
    expect(seen.length).toBe(before);
  });

  it("réserve /v1/admin/* aux administrateurs", async () => {
    const candidate = await token({ sub: "u-1", role: "candidate" });
    const admin = await token({ sub: "u-2", role: "admin" });
    expect(
      (await request(gateway()).get("/api/auth/v1/admin/stats").auth(candidate, { type: "bearer" })).status,
    ).toBe(403);
    expect(
      (await request(gateway()).get("/api/auth/v1/admin/stats").auth(admin, { type: "bearer" })).status,
    ).toBe(200);
  });

  it("refuse un jeton de service venu de l'extérieur", async () => {
    const service = await token({ sub: "service:job-watch", role: "service", scope: "users:contact" });
    expect(
      (await request(gateway()).get("/api/profiles/v1/x").auth(service, { type: "bearer" })).status,
    ).toBe(403);
  });

  it("répond 503 au format commun quand le service est arrêté", async () => {
    const t = await token({ sub: "u-1", role: "candidate" });
    const res = await request(gateway()).get("/api/jobs/v1/offers").auth(t, { type: "bearer" });
    expect(res.status).toBe(503);
    expect(res.body.title).toMatch(/indisponible/);
  });

  it("relaie un flux SSE sans le mettre en mémoire tampon", async () => {
    const t = await token({ sub: "u-1", role: "candidate" });
    const res = await request(gateway()).get("/api/cv/v1/flux").auth(t, { type: "bearer" });
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.text).toContain("event: done");
  });
});

describe("protections", () => {
  it("refuse les requêtes préalables CORS (aucune origine tierce)", async () => {
    const res = await request(gateway())
      .options("/api/auth/v1/session/refresh")
      .set("Origin", "https://pirate.example");
    expect(res.status).toBe(403);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("limite la taille des corps (1 Mo, 10 Mo pour l'import)", async () => {
    const t = await token({ sub: "u-1", role: "candidate" });
    // Taille annoncée sans envoyer le corps : le refus arrive avant toute lecture.
    const server = gateway().listen(0);
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/profiles/v1/profiles/me`,
        {
          method: "PUT",
          headers: { authorization: `Bearer ${t}`, "content-length": String(2 * 1024 * 1024) },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
          req.destroy();
        },
      );
      req.on("error", reject);
      req.flushHeaders();
    });
    server.close();
    expect(status).toBe(413);
  });

  it("accepte un import PDF jusqu'à 10 Mo", async () => {
    const t = await token({ sub: "u-1", role: "candidate" });
    const imported = await request(gateway())
      .post("/api/profiles/v1/profiles/import")
      .auth(t, { type: "bearer" })
      .set("content-type", "application/octet-stream")
      .send(Buffer.alloc(2 * 1024 * 1024));
    expect(imported.status).toBe(200);
  });

  it("plafonne les demandes de lien de connexion", async () => {
    const g = gateway();
    for (let i = 0; i < 2; i++) await request(g).post("/api/auth/v1/login-links").send({});
    const res = await request(g).post("/api/auth/v1/login-links").send({});
    expect(res.status).toBe(429);
    expect(res.body.title).toMatch(/Trop de demandes/);
  });

  it("pose les en-têtes de sécurité, sans X-Powered-By", async () => {
    const res = await request(gateway()).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.body).toEqual({ status: "ok", service: "gateway" });
  });

  it("n'écrit dans le journal ni jeton ni chaîne de requête", async () => {
    const { logger, lines } = testLogger();
    const g = createGateway({ config, logger, verifier });
    await request(g).get("/api/auth/v1/login-links/AbCdEfGhIjKlMnOpQrStUvWxYz012345?email=lea@example.org");
    const text = JSON.stringify(lines);
    expect(text).toContain("/api/auth/v1/login-links/:jeton");
    expect(text).not.toContain("AbCdEfGh");
    expect(text).not.toContain("lea@");
  });
});

describe("santé agrégée", () => {
  it("réservée à l'administrateur, elle signale le service arrêté", async () => {
    const candidate = await token({ sub: "u-1", role: "candidate" });
    const admin = await token({ sub: "u-2", role: "admin" });
    expect((await request(gateway()).get("/api/admin/v1/health")).status).toBe(401);
    expect(
      (await request(gateway()).get("/api/admin/v1/health").auth(candidate, { type: "bearer" })).status,
    ).toBe(403);
    const res = await request(gateway()).get("/api/admin/v1/health").auth(admin, { type: "bearer" });
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(
      res.body.services.map((s: { service: string; status: string }) => [s.service, s.status]),
    );
    expect(byName).toMatchObject({ auth: "ok", profiles: "ok", "jobs-matching": "injoignable" });
  });
});

describe("table de routage", () => {
  it("liste blanche explicite", () => {
    expect(isPublic("auth", "POST", "/v1/session/refresh")).toBe(true);
    expect(isPublic("auth", "GET", "/v1/me")).toBe(false);
    expect(isPublic("job-watch", "POST", "/v1/subscriptions/unsubscribe/AbCdEfGhIjKlMnOpQrStUv")).toBe(true);
    expect(isPublic("profiles", "GET", "/v1/profiles/me")).toBe(false);
  });

  it("normalise les routes du journal", () => {
    expect(normalizeRoute("/api/cv/v1/generations/6f0e9a3c-1111-4222-8333-944455556666/lines")).toBe(
      "/api/cv/v1/generations/:id/lines",
    );
    expect(normalizeRoute("/api/profiles/v1/profiles/me/versions/3")).toBe(
      "/api/profiles/v1/profiles/me/versions/:n",
    );
  });
});
