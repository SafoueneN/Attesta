import { randomUUID } from "node:crypto";
import { createVerifier, TOKEN_ISSUER, USER_AUDIENCE, type TokenVerifier } from "@attesta/http-kit";
import {
  calculateJwkThumbprint,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  importPKCS8,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JWK,
} from "jose";

/** Durées des jetons (ADR 0014). */
export const ACCESS_TTL_S = 15 * 60;
export const GUEST_ACCESS_TTL_S = 2 * 60 * 60;
export const GUEST_MAX_S = 24 * 60 * 60;
export const SERVICE_TTL_S = 5 * 60;
/** Audience du cookie d'invité : il ne vaut pas jeton d'accès. */
const GUEST_COOKIE_AUDIENCE = "attesta-invite";

export interface Signer {
  jwks(): { keys: JWK[] };
  /** Jeton d'accès d'un utilisateur ou d'un invité. */
  accessToken(sub: string, role: "candidate" | "admin" | "guest", ttlSeconds: number): Promise<string>;
  /** Jeton de service : audience = service cible, portée minimale (ADR 0014, point 8). */
  serviceToken(service: string, audience: string, scope: string): Promise<string>;
  /** Valeur du cookie `attesta_guest` : identité d'invité et date de début (plafond de 24 h). */
  guestCookie(sub: string, startedAt: number): Promise<string>;
  readGuestCookie(value: string): Promise<{ sub: string; startedAt: number } | undefined>;
  /** Vérifie les jetons d'accès et de service émis par ce service (routes de `auth`). */
  verifier: TokenVerifier;
}

/**
 * Clé de signature RS256. En production, `AUTH_PRIVATE_KEY` est obligatoire ; ailleurs, une clé éphémère
 * est générée au démarrage (les jetons deviennent invalides au redémarrage, ce qui est acceptable en local).
 * Son `kid` reçoit l'empreinte de la clé (RFC 7638) : une nouvelle clé a un nouveau `kid`, ce qui fait
 * recharger le JWKS aux autres services ; avec un `kid` fixe, ils garderaient l'ancienne clé en cache et
 * refuseraient tous les jetons jusqu'à leur propre redémarrage.
 */
export async function loadSigner(pem: string | undefined, configuredKid: string): Promise<Signer> {
  let privateKey: CryptoKey;
  let publicJwk: JWK;
  let kid = configuredKid;
  if (pem) {
    privateKey = await importPKCS8(pem.replace(/\\n/g, "\n"), "RS256", { extractable: true });
    // Seuls kty, n et e sont repris plus bas : la partie privée n'est jamais publiée.
    publicJwk = await exportJWK(privateKey);
  } else {
    const pair = await generateKeyPair("RS256", { extractable: true });
    privateKey = pair.privateKey;
    publicJwk = await exportJWK(pair.publicKey);
    kid = `${configuredKid}-${(await calculateJwkThumbprint(publicJwk)).slice(0, 12)}`;
  }
  const jwk: JWK = { kty: publicJwk.kty, n: publicJwk.n, e: publicJwk.e, kid, alg: "RS256", use: "sig" };
  const keySet = createLocalJWKSet({ keys: [jwk] });

  const sign = (claims: Record<string, unknown>, sub: string, audience: string, ttlSeconds: number) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuer(TOKEN_ISSUER)
      .setAudience(audience)
      .setSubject(sub)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(privateKey);

  return {
    jwks: () => ({ keys: [jwk] }),
    accessToken: (sub, role, ttl) =>
      sign({ role, scope: role === "guest" ? "guest" : "user" }, sub, USER_AUDIENCE, ttl),
    serviceToken: (service, audience, scope) =>
      sign({ role: "service", scope }, `service:${service}`, audience, SERVICE_TTL_S),
    guestCookie: (sub, startedAt) => {
      const remaining = Math.max(1, Math.floor(startedAt / 1000 + GUEST_MAX_S - Date.now() / 1000));
      return sign(
        { role: "guest", gst: Math.floor(startedAt / 1000) },
        sub,
        GUEST_COOKIE_AUDIENCE,
        remaining,
      );
    },
    async readGuestCookie(value) {
      try {
        const { payload } = await jwtVerify(value, keySet, {
          issuer: TOKEN_ISSUER,
          audience: GUEST_COOKIE_AUDIENCE,
          algorithms: ["RS256"],
        });
        if (
          typeof payload.sub !== "string" ||
          !payload.sub.startsWith("guest_") ||
          typeof payload.gst !== "number"
        ) {
          return undefined;
        }
        return { sub: payload.sub, startedAt: payload.gst * 1000 };
      } catch {
        return undefined;
      }
    },
    verifier: createVerifier(keySet, { audience: [USER_AUDIENCE, "auth"] }),
  };
}
