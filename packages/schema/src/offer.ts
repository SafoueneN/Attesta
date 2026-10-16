import { z } from "zod";
import { ShortText } from "./common.js";

/** Offre collée par le candidat. Traitée comme donnée, jamais comme instruction. */
export const JobOfferInput = z.object({
  rawText: z.string().trim().min(50, "L'offre semble trop courte").max(20000),
  sourceUrl: z.url().optional(),
});

/** Sortie de l'étape 2 du pipeline : analyse structurée de l'offre. */
export const OfferAnalysis = z.object({
  title: ShortText,
  company: ShortText.optional(),
  language: z.enum(["fr", "de", "en"]),
  location: ShortText.optional(),
  contractType: z.enum(["cdi", "cdd", "freelance", "stage", "alternance", "autre"]).optional(),
  requirements: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(300),
        priority: z.enum(["must", "nice"]),
        skills: z.array(ShortText).max(10),
      }),
    )
    .max(40),
  keywords: z
    .array(z.object({ term: ShortText, weight: z.number().min(0).max(1) }))
    .max(60),
});

export type JobOfferInput = z.infer<typeof JobOfferInput>;
export type OfferAnalysis = z.infer<typeof OfferAnalysis>;
