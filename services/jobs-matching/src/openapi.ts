import { buildOpenApi } from "@attesta/http-kit";
import { operations } from "./routes.js";

/** Contrat du service, généré depuis les schémas Zod des routes (ADR 0017). */
export function openApiDocument() {
  return buildOpenApi(
    {
      title: "Attesta · jobs-matching",
      version: "0.1.0",
      description: "Offres, analyse, ESCO, vecteurs pgvector et classement.",
    },
    operations,
  );
}
