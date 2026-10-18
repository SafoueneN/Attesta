import { buildOpenApi } from "@attesta/http-kit";
import { operations } from "./routes.js";

/** Contrat du service, généré depuis les schémas Zod des routes (ADR 0017). */
export function openApiDocument() {
  return buildOpenApi(
    {
      title: "Attesta · auth",
      version: "0.1.0",
      description: "Comptes sans mot de passe, JWT RS256, JWKS, rôles et orchestration RGPD.",
    },
    operations,
  );
}
