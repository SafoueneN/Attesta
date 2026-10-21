import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { loadSigner } from "../src/keys.js";
import { generateKeyPair, exportPKCS8 } from "jose";
import { maskEmail } from "../src/store.js";

const DATABASE_URL = "postgres://attesta_auth:attesta_auth-dev-uniquement@localhost:5433/attesta_auth";

describe("loadConfig", () => {
  it("applique le port du service par défaut (4001)", () => {
    expect(loadConfig({ DATABASE_URL })).toMatchObject({
      PORT: 4001,
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

  it("exige la clé privée en production", () => {
    expect(() => loadConfig({ DATABASE_URL, NODE_ENV: "production" })).toThrow(/AUTH_PRIVATE_KEY/);
  });

  it("lit les administrateurs, les secrets de service et les services détenteurs", () => {
    const config = loadConfig({
      DATABASE_URL,
      ADMIN_EMAILS: " Admin@Example.org , autre@example.org",
      SERVICE_SECRET_JOB_WATCH: "s".repeat(32),
      SERVICE_SECRET_TROP_COURT: "court",
      PROFILES_URL: "http://profiles:4002",
    });
    expect(config.ADMIN_EMAILS).toEqual(["admin@example.org", "autre@example.org"]);
    expect([...config.serviceSecrets.keys()]).toEqual(["job-watch"]);
    expect([...config.holders]).toEqual([["profiles", "http://profiles:4002"]]);
  });
});

describe("clés de signature", () => {
  it("importe une clé PEM fournie et publie sa seule partie publique", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const pem = (await exportPKCS8(privateKey)).replace(/\n/g, "\\n");
    const signer = await loadSigner(pem, "prod-1");
    const jwk = signer.jwks().keys[0]!;
    expect(jwk).toMatchObject({ kid: "prod-1", kty: "RSA" });
    expect(jwk).not.toHaveProperty("d");
    const token = await signer.accessToken("u-1", "admin", 60);
    expect(await signer.verifier.verify(token)).toMatchObject({ sub: "u-1", role: "admin" });
  });

  it("refuse un cookie d'invité forgé ou pris pour un jeton d'accès", async () => {
    const signer = await loadSigner(undefined, "k");
    expect(await signer.readGuestCookie("a.b.c")).toBeUndefined();
    expect(await signer.readGuestCookie(await signer.accessToken("guest_1", "guest", 60))).toBeUndefined();
    const cookie = await signer.guestCookie("guest_1", Date.now());
    expect(await signer.readGuestCookie(cookie)).toMatchObject({ sub: "guest_1" });
  });

  it("masque l'adresse affichée", () => {
    expect(maskEmail("lea.martin@example.org")).toBe("l***@example.org");
  });
});
