import { z } from "zod";
export * from "./common.js";
export * from "./cv.js";
export * from "./offer.js";
export * from "./pointer.js";
export * from "./profile.js";
export * from "./api/auth.js";
export * from "./api/common.js";
export * from "./api/cv.js";
export * from "./api/letters.js";
export * from "./api/profiles.js";
export declare const SCHEMA_VERSION = "1.0.0";
/** Export JSON Schema du contrat, utilisé pour les sorties structurées du LLM. */
export declare function toJsonSchemas(): {
    [k: string]: z.core.ZodStandardJSONSchemaPayload<z.ZodObject<{
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
    }, z.core.$strip> | z.ZodObject<{
        rawText: z.ZodString;
        sourceUrl: z.ZodOptional<z.ZodURL>;
    }, z.core.$strip> | z.ZodObject<{
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
    }, z.core.$strip> | z.ZodObject<{
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
    }, z.core.$strip> | z.ZodObject<{
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
};
