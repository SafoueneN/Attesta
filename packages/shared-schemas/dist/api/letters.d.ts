import { z } from "zod";
export declare const LetterTone: z.ZodEnum<{
    sobre: "sobre";
    chaleureux: "chaleureux";
    dynamique: "dynamique";
}>;
export declare const LetterCreate: z.ZodObject<{
    generationId: z.ZodUUID;
    tone: z.ZodDefault<z.ZodEnum<{
        sobre: "sobre";
        chaleureux: "chaleureux";
        dynamique: "dynamique";
    }>>;
}, z.core.$strip>;
/** Paragraphe d'une lettre : comme une ligne de CV, il cite les faits du profil qui le prouvent. */
export declare const LetterParagraph: z.ZodObject<{
    text: z.ZodString;
    sources: z.ZodArray<z.ZodString>;
    status: z.ZodEnum<{
        supported: "supported";
        unsupported: "unsupported";
        edited: "edited";
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
}, z.core.$strip>;
export declare const Letter: z.ZodObject<{
    id: z.ZodUUID;
    generationId: z.ZodUUID;
    offerTitle: z.ZodString;
    company: z.ZodNullable<z.ZodString>;
    tone: z.ZodEnum<{
        sobre: "sobre";
        chaleureux: "chaleureux";
        dynamique: "dynamique";
    }>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    greeting: z.ZodString;
    closing: z.ZodString;
    paragraphs: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        sources: z.ZodArray<z.ZodString>;
        status: z.ZodEnum<{
            supported: "supported";
            unsupported: "unsupported";
            edited: "edited";
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
    removed: z.ZodNumber;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
export type Letter = z.infer<typeof Letter>;
export declare const LetterSummary: z.ZodObject<{
    generationId: z.ZodUUID;
    id: z.ZodUUID;
    offerTitle: z.ZodString;
    company: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export declare const LetterUpdate: z.ZodObject<{
    greeting: z.ZodString;
    closing: z.ZodString;
    paragraphs: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** Modèles du CV (ADR 0041), tous en une colonne lisible par les ATS. */
export declare const CvVariant: z.ZodEnum<{
    ats: "ats";
    design: "design";
    classique: "classique";
    moderne: "moderne";
    compact: "compact";
}>;
export type CvVariant = z.infer<typeof CvVariant>;
/** Export d'un CV : ciblé (génération vérifiée) ou non adapté (profil enregistré, sans IA). */
export declare const CvExportRequest: z.ZodObject<{
    generationId: z.ZodOptional<z.ZodUUID>;
    variant: z.ZodDefault<z.ZodEnum<{
        ats: "ats";
        design: "design";
        classique: "classique";
        moderne: "moderne";
        compact: "compact";
    }>>;
    evidenceIds: z.ZodDefault<z.ZodArray<z.ZodUUID>>;
    lang: z.ZodDefault<z.ZodEnum<{
        fr: "fr";
        en: "en";
        de: "de";
    }>>;
    norms: z.ZodDefault<z.ZodEnum<{
        DE: "DE";
        FR: "FR";
        CA: "CA";
        TN: "TN";
    }>>;
}, z.core.$strip>;
/** CV en ligne (ADR 0042) : instantané partagé par un lien secret, non indexé, révocable. */
export declare const CvShareCreate: z.ZodObject<{
    variant: z.ZodDefault<z.ZodEnum<{
        ats: "ats";
        design: "design";
        classique: "classique";
        moderne: "moderne";
        compact: "compact";
    }>>;
    lang: z.ZodDefault<z.ZodEnum<{
        fr: "fr";
        en: "en";
        de: "de";
    }>>;
    norms: z.ZodDefault<z.ZodEnum<{
        DE: "DE";
        FR: "FR";
        CA: "CA";
        TN: "TN";
    }>>;
    generationId: z.ZodUUID;
    consent: z.ZodLiteral<true>;
}, z.core.$strip>;
export declare const CvShare: z.ZodObject<{
    id: z.ZodUUID;
    generationId: z.ZodNullable<z.ZodUUID>;
    offerTitle: z.ZodString;
    url: z.ZodOptional<z.ZodString>;
    views: z.ZodNumber;
    lastViewedAt: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    expiresAt: z.ZodString;
}, z.core.$strip>;
export type CvShare = z.infer<typeof CvShare>;
