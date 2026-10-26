import { z } from "zod";
import { OfferAnalysis } from "../offer.js";
import { Profile } from "../profile.js";
import { ProviderKind, Uuid } from "./common.js";
/** Pays de la veille et des offres collectées (ADR 0033) : Allemagne, France, Canada, Tunisie. */
export const Country = z.enum(["DE", "FR", "CA", "TN"], "Choisissez un pays");
export const WorkingTime = z.enum(["indifferent", "plein", "partiel"]);
/** Offre enregistrée par un candidat, avec son analyse (faite une fois, à l'enregistrement). */
export const StoredOffer = z.object({
    id: Uuid,
    title: z.string(),
    company: z.string().nullable(),
    createdAt: z.string(),
    sourceUrl: z.string().nullable(),
    rawText: z.string(),
    analysis: OfferAnalysis,
    providerKind: ProviderKind,
    /** Offre collectée d'origine, si l'offre en est reprise. */
    postingId: Uuid.nullable(),
});
export const OfferSummary = StoredOffer.pick({
    id: true,
    title: true,
    company: true,
    createdAt: true,
}).extend({
    keywords: z.number().int(),
});
/** Offre collectée auprès d'une source autorisée (BA, Adzuna). */
export const JobPosting = z.object({
    id: Uuid,
    source: z.string(),
    title: z.string(),
    company: z.string().nullable(),
    city: z.string().nullable(),
    country: Country,
    postedAt: z.string(),
    url: z.string(),
    excerpt: z.string(),
    salaryMinEur: z.number().int().nullable(),
    salaryMaxEur: z.number().int().nullable(),
    /** Mention exigée par la source (« Jobs by Adzuna »). */
    attribution: z.object({ text: z.string(), url: z.string() }).nullable(),
});
export const PostingSearch = z.object({
    q: z.string().trim().max(100).optional(),
    country: Country.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    /** Pagination du catalogue (« Voir plus »). */
    offset: z.coerce.number().int().min(0).max(5000).default(0),
});
/** Catalogue des offres collectées (ADR 0034) : volume par pays et dernière synchronisation. */
export const PostingsOverview = z.object({
    total: z.number().int(),
    countries: z.array(z.object({ country: Country, count: z.number().int() })),
    lastSyncAt: z.string().nullable(),
    syncing: z.boolean(),
});
export const City = z.object({ nom: z.string(), pays: Country, lat: z.number(), lon: z.number() });
/** Critères d'une veille : métiers, lieu résolu (coordonnées), rayon et temps de travail. */
export const WatchCriteria = z.object({
    occupations: z.array(z.string().min(2).max(80)).min(1).max(5),
    country: Country,
    city: z.string().min(1).max(100),
    lat: z.number(),
    lon: z.number(),
    radiusKm: z.number().int().min(5).max(200),
    workingTime: WorkingTime,
});
export const IngestionRequest = z.object({ criteria: z.array(WatchCriteria).max(500), date: z.iso.date() });
export const IngestionSummary = z.object({
    sources: z.record(z.string(), z.object({
        requests: z.number().int(),
        fetched: z.number().int(),
        inserted: z.number().int(),
        duplicates: z.number().int(),
        errors: z.number().int(),
    })),
    embedded: z.number().int(),
});
/** Demande de classement pour un abonné : le profil est anonymisé par jobs-matching avant tout calcul. */
export const MatchRequest = z.object({
    profile: Profile,
    criteria: WatchCriteria,
    /** Offres déjà envoyées à l'abonné : jamais proposées deux fois. */
    excludePostingIds: z.array(Uuid).max(5000).default([]),
    date: z.iso.date(),
});
export const MatchedPosting = z.object({
    posting: JobPosting,
    rank: z.number().int(),
    rrfScore: z.number(),
    similarity: z.number().nullable(),
    coverage: z.number().nullable(),
    locationScore: z.number().nullable(),
    /** Pertinence du rerank (0 à 100), absente en mode dégradé. */
    rerankScore: z.number().int().nullable(),
    /** Compétences demandées par l'offre et absentes du profil, vérifiées par le code. */
    missingSkills: z.array(z.string()),
});
export const MatchResponse = z.object({
    degraded: z.boolean(),
    postings: z.array(MatchedPosting),
    /** Compétences déclarées du profil, pour le rapport des points à améliorer. */
    profileSkills: z.array(z.string()),
});
