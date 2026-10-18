import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const DATABASE_URL =
  "postgres://attesta_letters:attesta_letters-dev-uniquement@localhost:5433/attesta_letters";

describe("loadConfig", () => {
  it("applique le port du service par défaut (4006)", () => {
    expect(loadConfig({ DATABASE_URL })).toMatchObject({
      PORT: 4006,
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
