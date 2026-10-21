import { z } from "zod";
import { Country, WorkingTime } from "./jobs.js";
export const WATCH_RADII = [10, 25, 50, 100];
/** Formulaire de veille : la ville est résolue par le service (référentiel GeoNames). */
export const SubscriptionInput = z.object({
    occupations: z
        .array(z.string().trim().min(2, "Chaque métier compte au moins 2 caractères").max(80, "80 caractères au plus"))
        .min(1, "Indiquez au moins un métier")
        .max(5, "5 métiers au plus"),
    country: Country,
    city: z.string().trim().min(1, "Indiquez une ville").max(100),
    radiusKm: z
        .number()
        .int()
        .refine((n) => WATCH_RADII.includes(n), "Choisissez un rayon dans la liste"),
    workingTime: WorkingTime,
    consent: z.literal(true, "Cochez la case pour accepter de recevoir la veille par e-mail"),
});
export const SubscriptionStatus = z.enum(["en_attente", "active", "desabonnee", "suspendue"]);
export const Subscription = z.object({
    occupations: z.array(z.string()),
    country: Country,
    city: z.string(),
    radiusKm: z.number().int(),
    workingTime: WorkingTime,
    status: SubscriptionStatus,
    confirmedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export const SubscriptionSaved = z.object({
    subscription: Subscription,
    /** Vrai si un e-mail de confirmation (double opt-in) vient d'être envoyé. */
    confirmationSent: z.boolean(),
});
/** Offre proposée par la veille, telle qu'envoyée dans un rapport quotidien. */
export const WatchMatch = z.object({
    runDate: z.string(),
    rank: z.number().int(),
    title: z.string(),
    company: z.string().nullable(),
    city: z.string().nullable(),
    url: z.string(),
    rerankScore: z.number().int().nullable(),
    missingSkills: z.array(z.string()),
});
export const WatchRun = z.object({
    id: z.string(),
    runDate: z.string(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
    trigger: z.enum(["planifiee", "manuelle"]),
    summary: z.record(z.string(), z.unknown()),
});
