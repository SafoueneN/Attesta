import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { AppError, ConfigError, createLogger, loadConfig, loadWorkerConfig } from "../src/index.js";

const secret = "x".repeat(32);

describe("loadConfig", () => {
  it("applique les valeurs par défaut", () => {
    const config = loadConfig({ SESSION_SECRET: secret, SESSION_STORE: "memory" });
    expect(config).toMatchObject({ PORT: 3000, NODE_ENV: "development", PDF_CHROMIUM_NO_SANDBOX: false });
  });

  it("laisse HTTPS_ONLY indéfini par défaut et lit sa valeur explicite", () => {
    const base = { SESSION_SECRET: secret, SESSION_STORE: "memory" };
    expect(loadConfig(base).HTTPS_ONLY).toBeUndefined();
    expect(loadConfig({ ...base, HTTPS_ONLY: "false" }).HTTPS_ONLY).toBe(false);
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

describe("AppError", () => {
  it("sépare le message public du code technique", () => {
    const error = new AppError("csrf_invalid", 403, "Rechargez la page.");
    expect(error).toMatchObject({ code: "csrf_invalid", status: 403, publicMessage: "Rechargez la page." });
    expect(error.message).toBe("csrf_invalid: Rechargez la page.");
  });
});

describe("configuration du worker de veille", () => {
  const worker = { DATABASE_URL: "postgres://x", SMTP_URL: "smtp://mailpit:1025" };

  it("n'exige pas de secret de session, mais la base et le serveur d'envoi", () => {
    expect(loadWorkerConfig(worker).JOBWATCH_SOURCES).toEqual(["ba"]);
    expect(() => loadWorkerConfig({})).toThrow(/DATABASE_URL.*\n.*SMTP_URL/);
  });

  it("production : vecteurs « hash » interdits, https obligatoire", () => {
    expect(() => loadWorkerConfig({ ...worker, NODE_ENV: "production" })).toThrow(/EMBEDDINGS_PROVIDER/);
    expect(() =>
      loadWorkerConfig({
        ...worker,
        NODE_ENV: "production",
        EMBEDDINGS_PROVIDER: "tei",
        TEI_URL: "http://tei",
      }),
    ).toThrow(/APP_BASE_URL/);
  });

  it("source adzuna : clés requises ; source inconnue refusée", () => {
    expect(() => loadWorkerConfig({ ...worker, JOBWATCH_SOURCES: "ba,adzuna" })).toThrow(/ADZUNA/);
    expect(
      loadWorkerConfig({ ...worker, JOBWATCH_SOURCES: "ba, adzuna", ADZUNA_APP_ID: "i", ADZUNA_APP_KEY: "k" })
        .JOBWATCH_SOURCES,
    ).toEqual(["ba", "adzuna"]);
    expect(() => loadWorkerConfig({ ...worker, JOBWATCH_SOURCES: "indeed" })).toThrow();
  });

  it("application web en production : serveur d'envoi requis", () => {
    expect(() =>
      loadConfig({
        SESSION_SECRET: "s".repeat(32),
        NODE_ENV: "production",
        DATABASE_URL: "postgres://x",
        APP_BASE_URL: "https://attesta.example",
      }),
    ).toThrow(/SMTP_URL/);
  });
});
