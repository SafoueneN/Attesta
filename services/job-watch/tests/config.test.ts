import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const DATABASE_URL = "postgres://attesta_watch:attesta_watch-dev-uniquement@localhost:5433/attesta_watch";

describe("loadConfig", () => {
  it("applique le port du service par défaut (4005)", () => {
    expect(loadConfig({ DATABASE_URL, SERVICE_SECRET: "s".repeat(32) })).toMatchObject({
      PORT: 4005,
      NODE_ENV: "development",
      LOG_LEVEL: "info",
    });
  });

  it("exige DATABASE_URL, sans recopier de valeur dans l'erreur", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    let message = "";
    try {
      loadConfig({ DATABASE_URL: "mysql://hote/valeur-a-ne-pas-journaliser" });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain("valeur-a-ne-pas-journaliser");
  });
});

describe("secret de service", () => {
  it("exige un secret de 32 caractères au moins pour obtenir les jetons d'auth", () => {
    expect(() => loadConfig({ DATABASE_URL, SERVICE_SECRET: "court" })).toThrow(/SERVICE_SECRET/);
  });
});
