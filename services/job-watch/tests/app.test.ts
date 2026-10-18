import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { testLogger } from "./helpers.js";

const up = async () => undefined;
const down = async () => {
  throw new Error("connexion refusée");
};

describe("service job-watch", () => {
  it("répond à /health", async () => {
    const res = await request(createApp({ ...testLogger(), readiness: { base: down } })).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "job-watch" });
  });

  it("/ready vaut 200 quand la base répond", async () => {
    const res = await request(createApp({ ...testLogger(), readiness: { base: up } })).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.checks).toEqual({ base: "ok" });
  });

  it("/ready vaut 503 quand la base ne répond pas", async () => {
    const res = await request(createApp({ ...testLogger(), readiness: { base: down } })).get("/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "indisponible", checks: { base: "echec" } });
  });

  it("renvoie un X-Request-Id et une erreur 404 au format commun", async () => {
    const res = await request(createApp({ ...testLogger(), readiness: { base: up } })).get("/v1/inconnue");
    expect(res.status).toBe(404);
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body).toMatchObject({ type: "urn:attesta:erreur:introuvable", status: 404 });
  });
});
