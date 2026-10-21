import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { createLogger } from "@attesta/logger";
import express from "express";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type CryptoKey, type JWK } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authenticate,
  createJwksVerifier,
  createServiceApp,
  createServiceClient,
  createServiceTokens,
  createVerifier,
  principalOf,
  requireAccount,
  requireRole,
  requireScope,
  UpstreamError,
  type TokenVerifier,
} from "../src/index.js";

let privateKey: CryptoKey;
let jwk: JWK;
let verifier: TokenVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  verifier = createVerifier(createLocalJWKSet({ keys: [jwk] }), { audience: ["attesta", "profiles"] });
});

function sign(claims: Record<string, unknown>, options: { aud?: string; exp?: string; iss?: string } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(options.iss ?? "attesta-auth")
    .setAudience(options.aud ?? "attesta")
    .setIssuedAt()
    .setExpirationTime(options.exp ?? "15m")
    .sign(privateKey);
}

const quietLogger = () =>
  createLogger({ service: "essai", destination: new Writable({ write: (_c, _e, done) => done() }) });

function app() {
  return createServiceApp({
    service: "essai",
    logger: quietLogger(),
    routes: (a) => {
      a.get("/v1/moi", authenticate(verifier), (_req, res) => {
        const { sub, role, scope } = principalOf(res);
        res.json({ sub, role, scope });
      });
      a.get("/v1/admin/stats", authenticate(verifier), requireRole("admin"), (_req, res) => {
        res.json({ ok: true });
      });
      a.get("/v1/compte", authenticate(verifier), requireAccount(), (_req, res) => res.json({ ok: true }));
      a.delete(
        "/internal/v1/users/:id",
        authenticate(verifier),
        requireScope("users:delete"),
        (_req, res) => {
          res.status(204).end();
        },
      );
    },
  });
}

describe("authenticate", () => {
  it("accepte un jeton valide et expose l'identité sans donnée personnelle", async () => {
    const token = await sign({ sub: "u-1", role: "candidate", scope: "profil cv" });
    const res = await request(app()).get("/v1/moi").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sub: "u-1", role: "candidate", scope: ["profil", "cv"] });
  });

  it.each([
    ["absent", undefined],
    ["mal formé", "Bearer pas-un-jwt"],
  ])("refuse un jeton %s (401)", async (_label, header) => {
    const req = request(app()).get("/v1/moi");
    const res = await (header ? req.set("Authorization", header) : req);
    expect(res.status).toBe(401);
    expect(res.body.type).toBe("urn:attesta:erreur:non_authentifie");
  });

  it.each([
    ["expiré", { exp: "-1m" }],
    ["d'une autre audience", { aud: "ailleurs" }],
    ["d'un autre émetteur", { iss: "pirate" }],
  ])("refuse un jeton %s", async (_label, options) => {
    const token = await sign({ sub: "u-1", role: "candidate" }, options);
    const res = await request(app()).get("/v1/moi").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("refuse un jeton signé par une autre clé", async () => {
    const other = await generateKeyPair("RS256");
    const token = await new SignJWT({ sub: "u-1", role: "admin" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer("attesta-auth")
      .setAudience("attesta")
      .setExpirationTime("15m")
      .sign(other.privateKey);
    const res = await request(app()).get("/v1/moi").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("refuse un rôle inconnu", async () => {
    const token = await sign({ sub: "u-1", role: "root" });
    const res = await request(app()).get("/v1/moi").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe("rôles et portées", () => {
  it("réserve l'administration au rôle admin (403 sinon)", async () => {
    const candidate = await sign({ sub: "u-1", role: "candidate" });
    const admin = await sign({ sub: "u-2", role: "admin" });
    expect((await request(app()).get("/v1/admin/stats").auth(candidate, { type: "bearer" })).status).toBe(
      403,
    );
    expect((await request(app()).get("/v1/admin/stats").auth(admin, { type: "bearer" })).status).toBe(200);
  });

  it("refuse un invité sur une route de compte, avec un message explicite", async () => {
    const guest = await sign({ sub: "guest_1", role: "guest" });
    const res = await request(app()).get("/v1/compte").auth(guest, { type: "bearer" });
    expect(res.status).toBe(403);
    expect(res.body.title).toMatch(/Connectez-vous/);
  });

  it("exige un jeton de service avec la bonne portée", async () => {
    const good = await sign(
      { sub: "service:auth", role: "service", scope: "users:delete" },
      { aud: "profiles" },
    );
    const wrongScope = await sign(
      { sub: "service:auth", role: "service", scope: "users:export" },
      { aud: "profiles" },
    );
    const user = await sign({ sub: "u-1", role: "admin", scope: "users:delete" });
    const call = (t: string) => request(app()).delete("/internal/v1/users/u-1").auth(t, { type: "bearer" });
    expect((await call(good)).status).toBe(204);
    expect((await call(wrongScope)).status).toBe(403);
    expect((await call(user)).status).toBe(403);
  });
});

describe("createJwksVerifier", () => {
  let server: ReturnType<express.Express["listen"]>;
  let url: string;

  beforeAll(async () => {
    const jwks = express();
    jwks.get("/.well-known/jwks.json", (_req, res) => res.json({ keys: [jwk] }));
    server = jwks.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/.well-known/jwks.json`;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it("vérifie un jeton avec les clés publiées par auth", async () => {
    const remote = createJwksVerifier(url, { audience: "attesta" });
    const principal = await remote.verify(await sign({ sub: "u-9", role: "admin" }));
    expect(principal).toMatchObject({ sub: "u-9", role: "admin" });
  });
});

describe("createServiceClient", () => {
  const fakeFetch = (responses: (Response | Error)[], calls: RequestInit[] = []) =>
    (async (_url: string, init: RequestInit) => {
      calls.push(init);
      const next = responses.shift()!;
      if (next instanceof Error) throw next;
      return next;
    }) as unknown as typeof fetch;

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("relaie le jeton et renvoie le JSON", async () => {
    const calls: RequestInit[] = [];
    const client = createServiceClient({
      target: "profiles",
      baseUrl: "http://profiles:4002/",
      fetchImpl: fakeFetch([json(200, { version: 3 })], calls),
    });
    const { status, data } = await client.json<{ version: number }>("GET", "/internal/v1/profiles/me", {
      token: "abc",
    });
    expect(status).toBe(200);
    expect(data.version).toBe(3);
    expect((calls[0]!.headers as Record<string, string>).authorization).toBe("Bearer abc");
  });

  it("reprend un GET après une panne réseau puis un 503", async () => {
    const calls: RequestInit[] = [];
    const client = createServiceClient({
      target: "profiles",
      baseUrl: "http://profiles",
      fetchImpl: fakeFetch([new Error("ECONNRESET"), json(503, {}), json(200, { ok: true })], calls),
    });
    const { data } = await client.json<{ ok: boolean }>("GET", "/x");
    expect(data.ok).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it("ne reprend jamais un POST (non idempotent)", async () => {
    const calls: RequestInit[] = [];
    const client = createServiceClient({
      target: "cv",
      baseUrl: "http://cv",
      fetchImpl: fakeFetch([new Error("ECONNRESET")], calls),
    });
    await expect(client.json("POST", "/x", { body: {} })).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(1);
  });

  it("transmet le statut et le problème d'un refus du fournisseur", async () => {
    const client = createServiceClient({
      target: "profiles",
      baseUrl: "http://profiles",
      fetchImpl: fakeFetch([json(404, { type: "urn:attesta:erreur:introuvable", title: "x", status: 404 })]),
    });
    const error = await client.json("GET", "/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({ upstreamStatus: 404, status: 502, problem: { status: 404 } });
  });

  it("accepte des statuts déclarés comme attendus", async () => {
    const client = createServiceClient({
      target: "profiles",
      baseUrl: "http://profiles",
      fetchImpl: fakeFetch([new Response(null, { status: 404 })]),
    });
    const res = await client.json("GET", "/x", { accept: [200, 404] });
    expect(res).toEqual({ status: 404, data: undefined });
  });

  it("met en cache les jetons de service", async () => {
    const calls: RequestInit[] = [];
    const client = createServiceClient({
      target: "auth",
      baseUrl: "http://auth",
      fetchImpl: fakeFetch([json(200, { accessToken: "t1", expiresIn: 300 })], calls),
    });
    const tokens = createServiceTokens({ client, service: "job-watch", secret: "s".repeat(32) });
    expect(await tokens("jobs-matching", "matching:run")).toBe("t1");
    expect(await tokens("jobs-matching", "matching:run")).toBe("t1");
    expect(calls).toHaveLength(1);
  });
});
