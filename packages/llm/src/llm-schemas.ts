import { z } from "zod";

/**
 * Schémas de sortie demandés au modèle. Volontairement simples (types, énumérations,
 * champs nullables) pour rester compatibles avec les sorties structurées ; les
 * contraintes métier (longueurs, formats, pointeurs) sont vérifiées ensuite par le
 * contrat strict de `@attesta/schema`.
 */

export const OfferAnalysisOutput = z.object({
  title: z.string(),
  company: z.string().nullable(),
  language: z.enum(["fr", "de", "en"]),
  location: z.string().nullable(),
  contractType: z.enum(["cdi", "cdd", "freelance", "stage", "alternance", "autre"]).nullable(),
  requirements: z.array(
    z.object({
      text: z.string(),
      priority: z.enum(["must", "nice"]),
      skills: z.array(z.string()),
    }),
  ),
  keywords: z.array(z.object({ term: z.string(), weight: z.number() })),
});
export type OfferAnalysisOutput = z.infer<typeof OfferAnalysisOutput>;

const Line = z.object({ text: z.string(), sources: z.array(z.string()) });
const EntryLines = z.object({ ref: z.string(), highlights: z.array(Line) });

export const DraftOutput = z.object({
  headline: Line.nullable(),
  summary: z.array(Line),
  work: z.array(EntryLines),
  projects: z.array(EntryLines),
  skills: z.array(z.string()),
});
export type DraftOutput = z.infer<typeof DraftOutput>;

const nullableText = z.string().nullable();

export const ExtractedProfileOutput = z.object({
  basics: z.object({
    name: nullableText,
    label: nullableText,
    email: nullableText,
    phone: nullableText,
    city: nullableText,
    countryCode: nullableText,
    url: nullableText,
    summary: nullableText,
  }),
  work: z.array(
    z.object({
      name: nullableText,
      position: nullableText,
      location: nullableText,
      startDate: nullableText,
      endDate: nullableText,
      summary: nullableText,
      highlights: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      institution: nullableText,
      studyType: nullableText,
      area: nullableText,
      startDate: nullableText,
      endDate: nullableText,
    }),
  ),
  skills: z.array(z.object({ name: z.string(), keywords: z.array(z.string()) })),
  languages: z.array(z.object({ language: z.string(), fluency: nullableText })),
});
export type ExtractedProfileOutput = z.infer<typeof ExtractedProfileOutput>;
