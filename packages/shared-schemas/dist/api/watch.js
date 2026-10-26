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
    /**
     * Adresse qui reçoit la veille ; absente : celle du compte. Une adresse nouvelle ou modifiée est toujours
     * confirmée par un lien envoyé à cette adresse (double opt-in) avant tout envoi d'offres.
     */
    email: z
        .email("Saisissez une adresse e-mail valide.")
        .max(254, "254 caractères au plus")
        .transform((e) => e.toLowerCase())
        .optional(),
    consent: z.literal(true, "Cochez la case pour accepter de recevoir la veille par e-mail"),
});
export const SubscriptionStatus = z.enum(["en_attente", "active", "desabonnee", "suspendue"]);
export const Subscription = z.object({
    occupations: z.array(z.string()),
    country: Country,
    city: z.string(),
    radiusKm: z.number().int(),
    workingTime: WorkingTime,
    /** Adresse de réception choisie ; `null` : celle du compte. */
    email: z.string().nullable(),
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
/**
 * Rappel par courriel (ADR 0029, point 5) : étape du plan de progression ou relance d'une candidature,
 * envoyé à l'adresse du compte le jour dit. Le lien reste interne à l'application.
 */
export const ReminderKind = z.enum(["progression", "relance"]);
export const ReminderInput = z.object({
    kind: ReminderKind,
    sendOn: z.iso.date(),
    title: z.string().trim().min(1).max(200),
    detail: z.string().trim().max(1000).default(""),
    link: z
        .string()
        .regex(/^\/[\w\-/?=&%.]*$/, "Lien interne attendu")
        .max(300)
        .nullable()
        .default(null),
});
export const Reminder = z.object({
    id: z.string(),
    kind: ReminderKind,
    sendOn: z.string(),
    title: z.string(),
    detail: z.string(),
    link: z.string().nullable(),
    sentAt: z.string().nullable(),
});
