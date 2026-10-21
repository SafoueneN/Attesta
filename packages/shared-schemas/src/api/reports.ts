import { z } from "zod";

/** Rapport 1 de la veille : offres du jour, avec les composantes du classement (en pourcentage). */
export const OffersReport = z.object({
  date: z.string(),
  criteria: z.string().max(400),
  degraded: z.boolean(),
  offers: z
    .array(
      z.object({
        title: z.string().max(300),
        company: z.string().max(200).nullable(),
        city: z.string().max(100).nullable(),
        postedAt: z.string(),
        url: z.string().max(2000),
        source: z.string().max(100),
        attribution: z.object({ text: z.string(), url: z.string() }).nullable(),
        pertinence: z.number().nullable(),
        similarity: z.number().nullable(),
        coverage: z.number().nullable(),
        location: z.number().nullable(),
        missingSkills: z.array(z.string().max(100)).max(10),
      }),
    )
    .max(20),
});
export type OffersReport = z.infer<typeof OffersReport>;

/** Rapport 2 de la veille : compétences à acquérir, classées par priorité (hypothèse Q16 affichée). */
export const GapsReport = z.object({
  date: z.string(),
  criteria: z.string().max(400),
  basis: z.number().int(),
  gaps: z
    .array(
      z.object({
        skill: z.string().max(100),
        count: z.number().int(),
        frequency: z.number(),
        salary: z.string().max(400),
        effort: z.enum(["faible", "moyen"]),
        priority: z.number(),
      }),
    )
    .max(10),
});
export type GapsReport = z.infer<typeof GapsReport>;
