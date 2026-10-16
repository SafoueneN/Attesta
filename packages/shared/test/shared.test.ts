import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { ConfigError, createLogger, loadConfig } from "../src/index.js";

const secret = "x".repeat(32);

describe("loadConfig", () => {
  it("applique les valeurs par défaut", () => {
    const config = loadConfig({ SESSION_SECRET: secret, SESSION_STORE: "memory" });
    expect(config).toMatchObject({ PORT: 3000, NODE_ENV: "development", PDF_CHROMIUM_NO_SANDBOX: false });
  });

  it("exige DATABASE_URL pour le stockage PostgreSQL", () => {
    expect(() => loadConfig({ SESSION_SECRET: secret })).toThrow(/DATABASE_URL/);
  });

  it("interdit le stockage mémoire en production", () => {
    expect(() =>
      loadConfig({ SESSION_SECRET: secret, SESSION_STORE: "memory", NODE_ENV: "production" }),
    ).toThrow(/SESSION_STORE/);
  });

  it("ne recopie jamais la valeur d'un secret dans l'erreur", () => {
    // Arrange
    const env = { SESSION_SECRET: "trop-court-mais-secret", SESSION_STORE: "memory" };
    // Act
    const error = (() => {
      try {
        loadConfig(env);
      } catch (e) {
        return e as ConfigError;
      }
    })();
    // Assert
    expect(error).toBeInstanceOf(ConfigError);
    expect(error?.message).toContain("SESSION_SECRET");
    expect(error?.message).not.toContain("trop-court-mais-secret");
  });
});

describe("createLogger", () => {
  it("masque les données personnelles", () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const logger = createLogger("info", sink);

    logger.info({ user: { email: "lea@example.org" }, offer: "texte de l'offre" }, "événement");

    expect(lines.join("")).not.toContain("lea@example.org");
    expect(lines.join("")).not.toContain("texte de l'offre");
    expect(lines.join("")).toContain("[supprimé]");
  });
});
