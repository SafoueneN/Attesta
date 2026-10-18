import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConfigError, databaseUrl, envBool, loadEnv, serviceEnv, serviceUrl } from "../src/index.js";

const Env = serviceEnv(4002).extend({
  DATABASE_URL: databaseUrl,
  SECRET: z.string().min(32, "doit contenir au moins 32 caractères"),
  FEATURE: envBool(false),
  PEER_URL: serviceUrl,
});

const valid = {
  DATABASE_URL: "postgres://attesta_profiles:x@localhost:5433/attesta_profiles",
  SECRET: "s".repeat(32),
  PEER_URL: "mock",
};

describe("loadEnv", () => {
  it("applique les valeurs par défaut du service", () => {
    const env = loadEnv(Env, valid);
    expect(env).toMatchObject({ NODE_ENV: "development", PORT: 4002, LOG_LEVEL: "info", FEATURE: false });
  });

  it("convertit les nombres et les booléens", () => {
    const env = loadEnv(Env, { ...valid, PORT: "9000", FEATURE: "true", TRUST_PROXY: "1" });
    expect(env).toMatchObject({ PORT: 9000, FEATURE: true, TRUST_PROXY: 1 });
  });

  it("accepte une URL de service ou « mock », rien d'autre", () => {
    expect(loadEnv(Env, { ...valid, PEER_URL: "http://profiles:4002" }).PEER_URL).toBe(
      "http://profiles:4002",
    );
    expect(() => loadEnv(Env, { ...valid, PEER_URL: "ftp://x" })).toThrow(/PEER_URL/);
  });

  it("liste toutes les variables invalides, sans recopier leurs valeurs", () => {
    const error = (() => {
      try {
        loadEnv(Env, {
          DATABASE_URL: "mysql://secret-en-clair",
          SECRET: "court-mais-secret",
          PEER_URL: "mock",
        });
      } catch (e) {
        return e as ConfigError;
      }
    })();
    expect(error).toBeInstanceOf(ConfigError);
    expect(error?.problems).toHaveLength(2);
    expect(error?.message).toContain("DATABASE_URL");
    expect(error?.message).toContain("SECRET");
    expect(error?.message).not.toContain("secret-en-clair");
    expect(error?.message).not.toContain("court-mais-secret");
  });

  it("signale en français une variable obligatoire absente", () => {
    expect(() => loadEnv(Env, { SECRET: "s".repeat(32), PEER_URL: "mock" })).toThrow(
      "DATABASE_URL : variable obligatoire absente",
    );
  });

  it("refuse un port hors limites", () => {
    expect(() => loadEnv(Env, { ...valid, PORT: "70000" })).toThrow(/PORT/);
  });
});
