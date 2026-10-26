import { z } from "zod";
/** Pays de la veille et des offres collectées (ADR 0033) : Allemagne, France, Canada, Tunisie. */
export declare const Country: z.ZodEnum<{
    DE: "DE";
    FR: "FR";
    CA: "CA";
    TN: "TN";
}>;
export type Country = z.infer<typeof Country>;
export declare const WorkingTime: z.ZodEnum<{
    indifferent: "indifferent";
    plein: "plein";
    partiel: "partiel";
}>;
/** Offre enregistrée par un candidat, avec son analyse (faite une fois, à l'enregistrement). */
export declare const StoredOffer: z.ZodObject<{
    id: z.ZodUUID;
    title: z.ZodString;
    company: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    sourceUrl: z.ZodNullable<z.ZodString>;
    rawText: z.ZodString;
    analysis: z.ZodObject<{
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
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
    postingId: z.ZodNullable<z.ZodUUID>;
}, z.core.$strip>;
export type StoredOffer = z.infer<typeof StoredOffer>;
export declare const OfferSummary: z.ZodObject<{
    id: z.ZodUUID;
    title: z.ZodString;
    company: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    keywords: z.ZodNumber;
}, z.core.$strip>;
export type OfferSummary = z.infer<typeof OfferSummary>;
/** Offre collectée auprès d'une source autorisée (BA, Adzuna). */
export declare const JobPosting: z.ZodObject<{
    id: z.ZodUUID;
    source: z.ZodString;
    title: z.ZodString;
    company: z.ZodNullable<z.ZodString>;
    city: z.ZodNullable<z.ZodString>;
    country: z.ZodEnum<{
        DE: "DE";
        FR: "FR";
        CA: "CA";
        TN: "TN";
    }>;
    postedAt: z.ZodString;
    url: z.ZodString;
    excerpt: z.ZodString;
    salaryMinEur: z.ZodNullable<z.ZodNumber>;
    salaryMaxEur: z.ZodNullable<z.ZodNumber>;
    attribution: z.ZodNullable<z.ZodObject<{
        text: z.ZodString;
        url: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type JobPosting = z.infer<typeof JobPosting>;
export declare const PostingSearch: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    country: z.ZodOptional<z.ZodEnum<{
        DE: "DE";
        FR: "FR";
        CA: "CA";
        TN: "TN";
    }>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
/** Catalogue des offres collectées (ADR 0034) : volume par pays et dernière synchronisation. */
export declare const PostingsOverview: z.ZodObject<{
    total: z.ZodNumber;
    countries: z.ZodArray<z.ZodObject<{
        country: z.ZodEnum<{
            DE: "DE";
            FR: "FR";
            CA: "CA";
            TN: "TN";
        }>;
        count: z.ZodNumber;
    }, z.core.$strip>>;
    lastSyncAt: z.ZodNullable<z.ZodString>;
    syncing: z.ZodBoolean;
}, z.core.$strip>;
export type PostingsOverview = z.infer<typeof PostingsOverview>;
export declare const City: z.ZodObject<{
    nom: z.ZodString;
    pays: z.ZodEnum<{
        DE: "DE";
        FR: "FR";
        CA: "CA";
        TN: "TN";
    }>;
    lat: z.ZodNumber;
    lon: z.ZodNumber;
}, z.core.$strip>;
export type City = z.infer<typeof City>;
/** Critères d'une veille : métiers, lieu résolu (coordonnées), rayon et temps de travail. */
export declare const WatchCriteria: z.ZodObject<{
    occupations: z.ZodArray<z.ZodString>;
    country: z.ZodEnum<{
        DE: "DE";
        FR: "FR";
        CA: "CA";
        TN: "TN";
    }>;
    city: z.ZodString;
    lat: z.ZodNumber;
    lon: z.ZodNumber;
    radiusKm: z.ZodNumber;
    workingTime: z.ZodEnum<{
        indifferent: "indifferent";
        plein: "plein";
        partiel: "partiel";
    }>;
}, z.core.$strip>;
export type WatchCriteria = z.infer<typeof WatchCriteria>;
export declare const IngestionRequest: z.ZodObject<{
    criteria: z.ZodArray<z.ZodObject<{
        occupations: z.ZodArray<z.ZodString>;
        country: z.ZodEnum<{
            DE: "DE";
            FR: "FR";
            CA: "CA";
            TN: "TN";
        }>;
        city: z.ZodString;
        lat: z.ZodNumber;
        lon: z.ZodNumber;
        radiusKm: z.ZodNumber;
        workingTime: z.ZodEnum<{
            indifferent: "indifferent";
            plein: "plein";
            partiel: "partiel";
        }>;
    }, z.core.$strip>>;
    date: z.ZodISODate;
}, z.core.$strip>;
export declare const IngestionSummary: z.ZodObject<{
    sources: z.ZodRecord<z.ZodString, z.ZodObject<{
        requests: z.ZodNumber;
        fetched: z.ZodNumber;
        inserted: z.ZodNumber;
        duplicates: z.ZodNumber;
        errors: z.ZodNumber;
    }, z.core.$strip>>;
    embedded: z.ZodNumber;
}, z.core.$strip>;
export type IngestionSummary = z.infer<typeof IngestionSummary>;
/** Demande de classement pour un abonné : le profil est anonymisé par jobs-matching avant tout calcul. */
export declare const MatchRequest: z.ZodObject<{
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
            birthDate: z.ZodOptional<z.ZodISODate>;
            nationality: z.ZodOptional<z.ZodString>;
            workPermit: z.ZodOptional<z.ZodString>;
            drivingLicence: z.ZodOptional<z.ZodString>;
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
    criteria: z.ZodObject<{
        occupations: z.ZodArray<z.ZodString>;
        country: z.ZodEnum<{
            DE: "DE";
            FR: "FR";
            CA: "CA";
            TN: "TN";
        }>;
        city: z.ZodString;
        lat: z.ZodNumber;
        lon: z.ZodNumber;
        radiusKm: z.ZodNumber;
        workingTime: z.ZodEnum<{
            indifferent: "indifferent";
            plein: "plein";
            partiel: "partiel";
        }>;
    }, z.core.$strip>;
    excludePostingIds: z.ZodDefault<z.ZodArray<z.ZodUUID>>;
    date: z.ZodISODate;
}, z.core.$strip>;
export type MatchRequest = z.infer<typeof MatchRequest>;
export declare const MatchedPosting: z.ZodObject<{
    posting: z.ZodObject<{
        id: z.ZodUUID;
        source: z.ZodString;
        title: z.ZodString;
        company: z.ZodNullable<z.ZodString>;
        city: z.ZodNullable<z.ZodString>;
        country: z.ZodEnum<{
            DE: "DE";
            FR: "FR";
            CA: "CA";
            TN: "TN";
        }>;
        postedAt: z.ZodString;
        url: z.ZodString;
        excerpt: z.ZodString;
        salaryMinEur: z.ZodNullable<z.ZodNumber>;
        salaryMaxEur: z.ZodNullable<z.ZodNumber>;
        attribution: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            url: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    rank: z.ZodNumber;
    rrfScore: z.ZodNumber;
    similarity: z.ZodNullable<z.ZodNumber>;
    coverage: z.ZodNullable<z.ZodNumber>;
    locationScore: z.ZodNullable<z.ZodNumber>;
    rerankScore: z.ZodNullable<z.ZodNumber>;
    missingSkills: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type MatchedPosting = z.infer<typeof MatchedPosting>;
export declare const MatchResponse: z.ZodObject<{
    degraded: z.ZodBoolean;
    postings: z.ZodArray<z.ZodObject<{
        posting: z.ZodObject<{
            id: z.ZodUUID;
            source: z.ZodString;
            title: z.ZodString;
            company: z.ZodNullable<z.ZodString>;
            city: z.ZodNullable<z.ZodString>;
            country: z.ZodEnum<{
                DE: "DE";
                FR: "FR";
                CA: "CA";
                TN: "TN";
            }>;
            postedAt: z.ZodString;
            url: z.ZodString;
            excerpt: z.ZodString;
            salaryMinEur: z.ZodNullable<z.ZodNumber>;
            salaryMaxEur: z.ZodNullable<z.ZodNumber>;
            attribution: z.ZodNullable<z.ZodObject<{
                text: z.ZodString;
                url: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        rank: z.ZodNumber;
        rrfScore: z.ZodNumber;
        similarity: z.ZodNullable<z.ZodNumber>;
        coverage: z.ZodNullable<z.ZodNumber>;
        locationScore: z.ZodNullable<z.ZodNumber>;
        rerankScore: z.ZodNullable<z.ZodNumber>;
        missingSkills: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    profileSkills: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type MatchResponse = z.infer<typeof MatchResponse>;
