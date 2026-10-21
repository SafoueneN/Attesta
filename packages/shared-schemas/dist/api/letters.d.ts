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
    id: z.ZodUUID;
    createdAt: z.ZodString;
    generationId: z.ZodUUID;
    offerTitle: z.ZodString;
    company: z.ZodNullable<z.ZodString>;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export declare const LetterUpdate: z.ZodObject<{
    greeting: z.ZodString;
    closing: z.ZodString;
    paragraphs: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const CvVariant: z.ZodEnum<{
    ats: "ats";
    design: "design";
}>;
/** Export d'un CV : ciblé (génération vérifiée) ou non adapté (profil enregistré, sans IA). */
export declare const CvExportRequest: z.ZodObject<{
    generationId: z.ZodOptional<z.ZodUUID>;
    variant: z.ZodDefault<z.ZodEnum<{
        ats: "ats";
        design: "design";
    }>>;
}, z.core.$strip>;
