import { z } from "zod";
/** Offre collée par le candidat. Traitée comme donnée, jamais comme instruction. */
export declare const JobOfferInput: z.ZodObject<{
    rawText: z.ZodString;
    sourceUrl: z.ZodOptional<z.ZodURL>;
}, z.core.$strip>;
/** Sortie de l'étape 2 du pipeline : analyse structurée de l'offre. */
export declare const OfferAnalysis: z.ZodObject<{
    title: z.ZodString;
    company: z.ZodOptional<z.ZodString>;
    language: z.ZodEnum<{
        fr: "fr";
        de: "de";
        en: "en";
    }>;
    location: z.ZodOptional<z.ZodString>;
    contractType: z.ZodOptional<z.ZodEnum<{
        cdi: "cdi";
        cdd: "cdd";
        freelance: "freelance";
        stage: "stage";
        alternance: "alternance";
        autre: "autre";
    }>>;
    requirements: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        priority: z.ZodEnum<{
            must: "must";
            nice: "nice";
        }>;
        skills: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    keywords: z.ZodArray<z.ZodObject<{
        term: z.ZodString;
        weight: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type JobOfferInput = z.infer<typeof JobOfferInput>;
export type OfferAnalysis = z.infer<typeof OfferAnalysis>;
