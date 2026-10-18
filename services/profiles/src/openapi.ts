import { buildOpenApi } from "@attesta/http-kit";
import { operations } from "./routes.js";

/** Contrat du service, généré depuis les schémas Zod des routes (ADR 0017). */
export function openApiDocument() {
  return buildOpenApi(
    {
      title: "Attesta · profiles",
      version: "0.1.0",
      description: "Profil candidat versionné et import d'un CV PDF.",
    },
    operations,
  );
}
