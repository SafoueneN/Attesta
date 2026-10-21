import { z } from "zod";
/**
 * CV ciblé produit par l'étape 3 du pipeline.
 *
 * Règle de conception : le modèle n'écrit que des lignes de texte libre, chacune
 * rattachée à au moins un fait du profil. Les champs factuels (employeur, poste,
 * dates, diplômes, compétences) ne passent jamais par le modèle : ils sont
 * recopiés par le code depuis le profil via `ref`. Le modèle choisit et ordonne,
 * il ne crée pas.
 */
export declare const CvLine: z.ZodObject<{
    text: z.ZodString;
    sources: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const TailoredCv: z.ZodObject<{
    headline: z.ZodOptional<z.ZodObject<{
        text: z.ZodString;
        sources: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    summary: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        sources: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    work: z.ZodArray<z.ZodObject<{
        ref: z.ZodString;
        highlights: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            sources: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    projects: z.ZodArray<z.ZodObject<{
        ref: z.ZodString;
        highlights: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            sources: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    education: z.ZodArray<z.ZodObject<{
        ref: z.ZodString;
    }, z.core.$strip>>;
    skills: z.ZodArray<z.ZodString>;
    languages: z.ZodArray<z.ZodString>;
    certificates: z.ZodArray<z.ZodString>;
    missingKeywords: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
/** Sortie de l'étape 4 : contrôle de fidélité, ligne par ligne. */
export declare const FaithfulnessIssue: z.ZodObject<{
    kind: z.ZodEnum<{
        number: "number";
        date: "date";
        entity: "entity";
        skill: "skill";
        "unresolved-source": "unresolved-source";
        "foreign-source": "foreign-source";
    }>;
    value: z.ZodString;
}, z.core.$strip>;
export declare const FaithfulnessReport: z.ZodObject<{
    score: z.ZodNumber;
    checkedLines: z.ZodNumber;
    supportedLines: z.ZodNumber;
    lines: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        status: z.ZodEnum<{
            supported: "supported";
            unsupported: "unsupported";
        }>;
        issues: z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                number: "number";
                date: "date";
                entity: "entity";
                skill: "skill";
                "unresolved-source": "unresolved-source";
                "foreign-source": "foreign-source";
            }>;
            value: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CvLine = z.infer<typeof CvLine>;
export type TailoredCv = z.infer<typeof TailoredCv>;
export type FaithfulnessReport = z.infer<typeof FaithfulnessReport>;
