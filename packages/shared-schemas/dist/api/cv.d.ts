import { z } from "zod";
export declare const GenerationCreate: z.ZodObject<{
    offerId: z.ZodUUID;
}, z.core.$strip>;
/** Ligne écartée par le contrôle de fidélité, avec ses raisons. */
export declare const RemovedLine: z.ZodObject<{
    path: z.ZodString;
    text: z.ZodString;
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
export type RemovedLine = z.infer<typeof RemovedLine>;
export declare const GenerationStatus: z.ZodEnum<{
    ok: "ok";
    degraded: "degraded";
}>;
export declare const DegradedReason: z.ZodEnum<{
    indisponible: "indisponible";
    refus: "refus";
    budget: "budget";
    "non-conforme": "non-conforme";
    quota: "quota";
}>;
/**
 * Génération d'un CV ciblé. Le profil est l'instantané utilisé : les pointeurs du CV désignent ses
 * faits, même si le candidat modifie ensuite son profil.
 */
export declare const Generation: z.ZodObject<{
    id: z.ZodUUID;
    offerId: z.ZodUUID;
    offerTitle: z.ZodString;
    profileVersion: z.ZodNullable<z.ZodNumber>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    status: z.ZodEnum<{
        ok: "ok";
        degraded: "degraded";
    }>;
    degradedReason: z.ZodNullable<z.ZodEnum<{
        indisponible: "indisponible";
        refus: "refus";
        budget: "budget";
        "non-conforme": "non-conforme";
        quota: "quota";
    }>>;
    message: z.ZodNullable<z.ZodString>;
    cv: z.ZodNullable<z.ZodObject<{
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
    }, z.core.$strip>>;
    report: z.ZodNullable<z.ZodObject<{
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
    }, z.core.$strip>>;
    removed: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        text: z.ZodString;
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
    edited: z.ZodArray<z.ZodString>;
    revision: z.ZodNumber;
    analysis: z.ZodNullable<z.ZodObject<{
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
    }, z.core.$strip>>;
    profile: z.ZodObject<{
        basics: z.ZodObject<{
            name: z.ZodString;
            label: z.ZodOptional<z.ZodString>;
            email: z.ZodOptional<z.ZodEmail>;
            phone: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodURL>;
            summary: z.ZodOptional<z.ZodString>;
            location: z.ZodOptional<z.ZodObject<{
                city: z.ZodOptional<z.ZodString>;
                region: z.ZodOptional<z.ZodString>;
                countryCode: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            profiles: z.ZodDefault<z.ZodArray<z.ZodObject<{
                network: z.ZodString;
                url: z.ZodURL;
            }, z.core.$strip>>>;
        }, z.core.$strip>;
        work: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            position: z.ZodString;
            url: z.ZodOptional<z.ZodURL>;
            location: z.ZodOptional<z.ZodString>;
            startDate: z.ZodString;
            endDate: z.ZodOptional<z.ZodString>;
            summary: z.ZodOptional<z.ZodString>;
            highlights: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
        education: z.ZodDefault<z.ZodArray<z.ZodObject<{
            institution: z.ZodString;
            area: z.ZodOptional<z.ZodString>;
            studyType: z.ZodOptional<z.ZodString>;
            startDate: z.ZodOptional<z.ZodString>;
            endDate: z.ZodOptional<z.ZodString>;
            score: z.ZodOptional<z.ZodString>;
            courses: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
        skills: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            level: z.ZodOptional<z.ZodString>;
            keywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
        languages: z.ZodDefault<z.ZodArray<z.ZodObject<{
            language: z.ZodString;
            fluency: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        projects: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            highlights: z.ZodDefault<z.ZodArray<z.ZodString>>;
            startDate: z.ZodOptional<z.ZodString>;
            endDate: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodURL>;
        }, z.core.$strip>>>;
        certificates: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            issuer: z.ZodOptional<z.ZodString>;
            date: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodURL>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
    model: z.ZodString;
    pipelineVersion: z.ZodString;
}, z.core.$strip>;
export type Generation = z.infer<typeof Generation>;
export declare const GenerationSummary: z.ZodObject<{
    id: z.ZodUUID;
    offerTitle: z.ZodString;
    createdAt: z.ZodString;
    status: z.ZodEnum<{
        ok: "ok";
        degraded: "degraded";
    }>;
    score: z.ZodNullable<z.ZodNumber>;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
export type GenerationSummary = z.infer<typeof GenerationSummary>;
export declare const Corrections: z.ZodObject<{
    revision: z.ZodNumber;
    lines: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        text: z.ZodOptional<z.ZodString>;
        remove: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Corrections = z.infer<typeof Corrections>;
/** Événements du flux de génération (SSE, ADR 0012, point 6). */
export declare const GenerationEvent: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"progress">;
    message: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"done">;
    generationId: z.ZodUUID;
    status: z.ZodEnum<{
        ok: "ok";
        degraded: "degraded";
    }>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"failure">;
    message: z.ZodString;
}, z.core.$strip>], "type">;
export type GenerationEvent = z.infer<typeof GenerationEvent>;
