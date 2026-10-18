import { buildOpenApi } from "@attesta/http-kit";
import { operations } from "./routes.js";

/** Contrat du service, généré depuis les schémas Zod des routes (ADR 0017). */
export function openApiDocument() {
  return buildOpenApi(
    {
      title: "Attesta · cv-generation",
      version: "0.1.0",
      description: "CV ciblé par offre, contrôle de fidélité et traçabilité ligne par ligne.",
    },
    operations,
  );
}
