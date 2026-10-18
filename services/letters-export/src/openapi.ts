import { buildOpenApi } from "@attesta/http-kit";
import { operations } from "./routes.js";

/** Contrat du service, généré depuis les schémas Zod des routes (ADR 0017). */
export function openApiDocument() {
  return buildOpenApi(
    {
      title: "Attesta · letters-export",
      version: "0.1.0",
      description: "Lettres de motivation et rendu PDF unique (CV, lettres, rapports).",
    },
    operations,
  );
}
