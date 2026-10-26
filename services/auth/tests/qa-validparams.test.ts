import { randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPassword } from "../src/passwords.js";

/*
 * Campagne QA (A-11) : bornes exactes de validParams. Chaque empreinte est réellement valide pour ses
 * paramètres : seule la borne, et non un échec de scrypt, peut la faire refuser. C'est ce qui distingue le
 * code des mutants qui suppriment ou déplacent une borne.
 */

const PASSWORD = "mot-de-passe-de-recette";

/** Empreinte au format du service, calculée directement avec les paramètres donnés. */
function stored(N: number, r: number, p: number) {
  const salt = randomBytes(16);
  const key = scryptSync(PASSWORD.normalize("NFKC"), salt, 32, { N, r, p, maxmem: 128 * N * r * 2 });
  return ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

describe("validParams : valeurs limites (campagne QA)", () => {
  // r = 2 : OpenSSL exige N < 2^(16·r) ; mémoire 256 Mo (2^20) et 512 Mo (2^21).
  it("accepte N = 2^20, borne haute incluse", async () => {
    expect(await verifyPassword(PASSWORD, stored(2 ** 20, 2, 1))).toBe(true);
  }, 30_000);

  it("refuse N = 2^21 alors que l'empreinte est valide : la borne haute fait le refus", async () => {
    expect(await verifyPassword(PASSWORD, stored(2 ** 21, 2, 1))).toBe(false);
  }, 30_000);

  it("accepte N = 2^14, borne basse incluse, et refuse N = 2^13", async () => {
    expect(await verifyPassword(PASSWORD, stored(2 ** 14, 8, 1))).toBe(true);
    expect(await verifyPassword(PASSWORD, stored(2 ** 13, 8, 1))).toBe(false);
  });

  it("accepte r = 32 et p = 4, bornes hautes incluses ; refuse r = 33 et p = 5", async () => {
    expect(await verifyPassword(PASSWORD, stored(2 ** 14, 32, 1))).toBe(true);
    expect(await verifyPassword(PASSWORD, stored(2 ** 14, 33, 1))).toBe(false);
    expect(await verifyPassword(PASSWORD, stored(2 ** 14, 1, 4))).toBe(true);
    expect(await verifyPassword(PASSWORD, stored(2 ** 14, 1, 5))).toBe(false);
  });

  it("refuse p = 0 et r = 0 sans lever d'erreur", async () => {
    const salt = randomBytes(16).toString("base64url");
    const key = randomBytes(32).toString("base64url");
    await expect(verifyPassword(PASSWORD, `scrypt$16384$8$0$${salt}$${key}`)).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, `scrypt$16384$0$1$${salt}$${key}`)).resolves.toBe(false);
  });

  it("refuse un N qui n'est pas une puissance de 2 (3 × 2^14) sans lever d'erreur", async () => {
    const salt = randomBytes(16).toString("base64url");
    const key = randomBytes(32).toString("base64url");
    await expect(verifyPassword(PASSWORD, `scrypt$49152$8$1$${salt}$${key}`)).resolves.toBe(false);
  });
});
