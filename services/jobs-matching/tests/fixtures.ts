import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type CryptoKey } from "jose";
import { createVerifier, type TokenVerifier } from "@attesta/http-kit";
import type { ProfileInput } from "@attesta/shared-schemas";

/** Profil fictif de la persona Léa, développeuse back-end. */
export const leaProfile: ProfileInput = {
  basics: {
    name: "Léa Martin",
    label: "Développeuse back-end",
    email: "lea.martin@example.org",
    location: { city: "Lyon", countryCode: "FR" },
    summary: "Développeuse back-end, 5 ans d'expérience sur des API Node.js.",
  },
  work: [
    {
      name: "Transports Rhône",
      position: "Développeuse back-end",
      startDate: "2021-03",
      highlights: [
        "Migration de 12 services Express vers Node.js 20",
        "Réduction de 40 % du temps de réponse de l'API de réservation",
      ],
    },
  ],
  education: [
    { institution: "INSA Lyon", studyType: "Diplôme d'ingénieur", area: "Informatique", endDate: "2019" },
  ],
  skills: [{ name: "Node.js", keywords: ["Express", "PostgreSQL"] }],
};

/** Émetteur de jetons de test, à la place d'`auth`. */
export async function tokens() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "t", alg: "RS256" };
  const verifier: TokenVerifier = createVerifier(createLocalJWKSet({ keys: [jwk] }), {
    audience: ["attesta", "jobs-matching"],
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
    service: (scope: string, aud = "jobs-matching") =>
      sign(privateKey, "service:job-watch", { role: "service", scope }, aud),
  };
}
