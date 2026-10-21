import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type CryptoKey } from "jose";
import { createVerifier, type TokenVerifier } from "@attesta/http-kit";

/** Émetteur de jetons de test, à la place d'`auth`. */
export async function tokens() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "t", alg: "RS256" };
  const verifier: TokenVerifier = createVerifier(createLocalJWKSet({ keys: [jwk] }), {
    audience: ["attesta", "job-watch"],
  });
  const sign = (key: CryptoKey, sub: string, claims: Record<string, unknown>, aud: string) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "t" })
      .setIssuer("attesta-auth")
      .setAudience(aud)
      .setSubject(sub)
      .setExpirationTime("5m")
      .sign(key);
  return {
    verifier,
    user: (sub: string, role: "candidate" | "admin" | "guest" = "candidate") =>
      sign(privateKey, sub, { role, scope: "user" }, "attesta"),
    service: (scope: string, aud = "job-watch") =>
      sign(privateKey, "service:auth", { role: "service", scope }, aud),
  };
}
