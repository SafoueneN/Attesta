import { scryptSync } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decoyHash, hashPassword, verifyPassword } from "../src/passwords.js";
import { normalizeCode } from "../src/store.js";

/*
 * Empreintes de mots de passe (ADR 0030). Tests en boîte blanche (format, normalisation NFKC, empreintes
 * malformées) et propriétés (fast-check) : scrypt coûte ~50 ms, d'où un nombre d'essais réduit.
 */

describe("empreintes scrypt", () => {
  it("produit un format auto-décrit, salé : deux empreintes du même mot de passe diffèrent", async () => {
    const [a, b] = await Promise.all([
      hashPassword("correct horse battery"),
      hashPassword("correct horse battery"),
    ]);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("vérifie le bon mot de passe et refuse un mot de passe voisin", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("compare les formes Unicode équivalentes (NFKC) : « é » composé = « e » + accent", async () => {
    const stored = await hashPassword("mot-de-passe-été");
    expect(await verifyPassword("mot-de-passe-été", stored)).toBe(true);
  });

  it.each([
    ["chaîne vide", ""],
    ["autre algorithme", "bcrypt$10$abc$def"],
    ["sans sel", "scrypt$32768$8$1$$abc"],
    ["sans empreinte", "scrypt$32768$8$1$abc$"],
    ["coupée", "scrypt$32768"],
  ])("refuse une empreinte malformée (%s) sans lever d'erreur", async (_cas, stored) => {
    await expect(verifyPassword("un mot de passe", stored)).resolves.toBe(false);
  });

  it("refuse une empreinte aux paramètres scrypt invalides sans lever d'erreur", async () => {
    await expect(verifyPassword("un mot de passe", "scrypt$abc$8$1$c2Vs$a2V5")).resolves.toBe(false);
  });

  it("réutilise une seule empreinte leurre, valide, pour les identifiants inconnus", async () => {
    const decoy = await decoyHash();
    expect(decoy).toMatch(/^scrypt\$/);
    expect(await decoyHash()).toBe(decoy);
    expect(await verifyPassword("n'importe quoi", decoy)).toBe(false);
  });
});

describe("propriétés (fuzzing fast-check)", () => {
  it("tout mot de passe vérifie contre sa propre empreinte, jamais contre celle d'un autre", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }),
        fc.string({ minLength: 1, maxLength: 8 }),
        async (pw, suffix) => {
          const stored = await hashPassword(pw);
          expect(await verifyPassword(pw, stored)).toBe(true);
          const other = pw + suffix;
          if (other.normalize("NFKC") !== pw.normalize("NFKC"))
            expect(await verifyPassword(other, stored)).toBe(false);
        },
      ),
      { numRuns: 12 },
    );
  }, 30_000);

  it("une empreinte quelconque (base corrompue) donne un booléen, jamais une exception", async () => {
    const field = fc.oneof(fc.string({ maxLength: 12 }), fc.integer().map(String), fc.constant("32768"));
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.string({ maxLength: 80 }),
          fc.tuple(field, field, field, field, field).map((p) => ["scrypt", ...p].join("$")),
        ),
        async (stored) => {
          expect(typeof (await verifyPassword("un mot de passe", stored))).toBe("boolean");
        },
      ),
      { numRuns: 100 },
    );
  }, 60_000);

  it("la saisie d'un code de récupération est normalisée de façon idempotente", () => {
    fc.assert(
      fc.property(fc.string(), (code) => {
        const once = normalizeCode(code);
        expect(once).toMatch(/^[A-Z0-9]*$/);
        expect(normalizeCode(once)).toBe(once);
      }),
    );
    expect(normalizeCode(" k7qm-4xrt ")).toBe("K7QM4XRT");
  });
});

describe("bornes des paramètres scrypt (deuxième vague, mutants survivants)", () => {
  /** Empreinte valide fabriquée avec des paramètres choisis : seule la règle de bornes peut la refuser. */
  const forge = (
    N: number,
    r: number,
    p: number,
    kind = "scrypt",
    salt = Buffer.from("sel-de-test-1234"),
  ) => {
    const key = scryptSync("pw-de-test", salt, 32, { N, r, p, maxmem: 256 * N * r * p + 2 ** 20 });
    return [kind, N, r, p, salt.toString("base64url"), key.toString("base64url")].join("$");
  };

  it.each([
    ["N = 2^14 (borne basse)", 2 ** 14, 1, 1],
    // N = 2^20 exigerait r = 8 et 1 Go de mémoire (OpenSSL : N < 2^(16 r)) : borne haute vérifiée par le refus rapide.
    ["N = 2^16 avec r = 8 (paramètres actuels × 2)", 2 ** 16, 8, 1],
    ["r = 32 (borne haute)", 2 ** 14, 32, 1],
    ["p = 4 (borne haute)", 2 ** 14, 1, 4],
  ])(
    "accepte %s",
    async (_cas, N, r, p) => {
      expect(await verifyPassword("pw-de-test", forge(N, r, p))).toBe(true);
    },
    20_000,
  );

  it.each([
    ["N = 2^13 (sous la borne)", 2 ** 13, 1, 1],
    ["r = 33 (au-dessus)", 2 ** 14, 33, 1],
    ["p = 5 (au-dessus)", 2 ** 14, 1, 5],
  ])(
    "refuse %s, même avec la bonne clé",
    async (_cas, N, r, p) => {
      expect(await verifyPassword("pw-de-test", forge(N, r, p))).toBe(false);
    },
    20_000,
  );

  it("refuse sans calcul une empreinte démesurée (N = 2^24) : aucune attente", async () => {
    const started = performance.now();
    expect(await verifyPassword("pw", "scrypt$16777216$8$1$c2Vs$a2V5")).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("refuse un autre algorithme, un sel vide ou une empreinte tronquée, même avec la bonne clé", async () => {
    expect(await verifyPassword("pw-de-test", forge(2 ** 14, 1, 1, "bcrypt"))).toBe(false);
    expect(await verifyPassword("pw-de-test", forge(2 ** 14, 1, 1, "scrypt", Buffer.alloc(0)))).toBe(false);
    const truncated = forge(2 ** 14, 1, 1).slice(0, -10);
    await expect(verifyPassword("pw-de-test", truncated)).resolves.toBe(false);
  });
});
