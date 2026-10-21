import type { DemoHandler } from "@attesta/llm-client";
import { demoAnalysis } from "./analysis.js";

/**
 * Réponses du fournisseur de démonstration (aucun modèle) : analyse par termes techniques, et classement
 * de l'étage de rappel conservé, sans compétence citée par un modèle.
 */
export const demoHandlers: Record<string, DemoHandler> = {
  "analyse-offre": (input) => demoAnalysis((input as { offerText: string }).offerText),
  "rerank-offres": (input) => ({
    offres: (input as { offres: { id: string }[] }).offres.map((o, i) => ({
      id: o.id,
      pertinence: 100 - i,
      competencesManquantes: [],
    })),
  }),
};
