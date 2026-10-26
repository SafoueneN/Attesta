import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/*
 * Empreintes de mots de passe (ADR 0030) : scrypt de node:crypto, sans dépendance. Format auto-décrit
 * « scrypt$N$r$p$sel$empreinte » (base64url), pour pouvoir durcir les paramètres plus tard sans migration.
 */

const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 32;

const derive = (password: string, salt: Buffer, o: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...o, maxmem: 128 * o.N! * o.r! * 2 }, (e, k) =>
      e ? reject(e) : resolve(k),
    ),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join(
    "$",
  );
}

/**
 * Paramètres lus dans l'empreinte, bornés : une empreinte corrompue (N absent, énorme ou non puissance de 2)
 * ne doit ni lever d'erreur ni lancer un calcul démesuré. Bornes : celles qu'on pourrait adopter un jour.
 */
const validParams = (N: number, r: number, p: number) =>
  Number.isInteger(N) &&
  N >= 2 ** 14 &&
  N <= 2 ** 20 &&
  (N & (N - 1)) === 0 &&
  Number.isInteger(r) &&
  r >= 1 &&
  r <= 32 &&
  Number.isInteger(p) &&
  p >= 1 &&
  p <= 4;

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, key] = stored.split("$");
  if (kind !== "scrypt" || !salt || !key) return false;
  const o = { N: Number(n), r: Number(r), p: Number(p) };
  if (!validParams(o.N, o.r, o.p)) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), o).catch(() => undefined);
  return actual !== undefined && actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Empreinte de référence : la vérification d'un identifiant inconnu prend le même temps qu'un vrai échec. */
let decoy: Promise<string> | undefined;
export const decoyHash = () => (decoy ??= hashPassword(randomBytes(16).toString("hex")));
