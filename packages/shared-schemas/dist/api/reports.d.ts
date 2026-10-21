import { z } from "zod";
/** Rapport 1 de la veille : offres du jour, avec les composantes du classement (en pourcentage). */
export declare const OffersReport: z.ZodObject<{
    date: z.ZodString;
    criteria: z.ZodString;
    degraded: z.ZodBoolean;
    offers: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        company: z.ZodNullable<z.ZodString>;
        city: z.ZodNullable<z.ZodString>;
        postedAt: z.ZodString;
        url: z.ZodString;
        source: z.ZodString;
        attribution: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            url: z.ZodString;
        }, z.core.$strip>>;
        pertinence: z.ZodNullable<z.ZodNumber>;
        similarity: z.ZodNullable<z.ZodNumber>;
        coverage: z.ZodNullable<z.ZodNumber>;
        location: z.ZodNullable<z.ZodNumber>;
        missingSkills: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type OffersReport = z.infer<typeof OffersReport>;
/** Rapport 2 de la veille : compétences à acquérir, classées par priorité (hypothèse Q16 affichée). */
export declare const GapsReport: z.ZodObject<{
    date: z.ZodString;
    criteria: z.ZodString;
    basis: z.ZodNumber;
    gaps: z.ZodArray<z.ZodObject<{
        skill: z.ZodString;
        count: z.ZodNumber;
        frequency: z.ZodNumber;
        salary: z.ZodString;
        effort: z.ZodEnum<{
            faible: "faible";
            moyen: "moyen";
        }>;
        priority: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type GapsReport = z.infer<typeof GapsReport>;
