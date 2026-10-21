import { z } from "zod";
export declare const WATCH_RADII: readonly [10, 25, 50, 100];
/** Formulaire de veille : la ville est résolue par le service (référentiel GeoNames). */
export declare const SubscriptionInput: z.ZodObject<{
    occupations: z.ZodArray<z.ZodString>;
    country: z.ZodEnum<{
        DE: "DE";
        FR: "FR";
    }>;
    city: z.ZodString;
    radiusKm: z.ZodNumber;
    workingTime: z.ZodEnum<{
        indifferent: "indifferent";
        plein: "plein";
        partiel: "partiel";
    }>;
    consent: z.ZodLiteral<true>;
}, z.core.$strip>;
export type SubscriptionInput = z.input<typeof SubscriptionInput>;
export declare const SubscriptionStatus: z.ZodEnum<{
    en_attente: "en_attente";
    active: "active";
    desabonnee: "desabonnee";
    suspendue: "suspendue";
}>;
export declare const Subscription: z.ZodObject<{
    occupations: z.ZodArray<z.ZodString>;
    country: z.ZodEnum<{
        DE: "DE";
        FR: "FR";
    }>;
    city: z.ZodString;
    radiusKm: z.ZodNumber;
    workingTime: z.ZodEnum<{
        indifferent: "indifferent";
        plein: "plein";
        partiel: "partiel";
    }>;
    status: z.ZodEnum<{
        en_attente: "en_attente";
        active: "active";
        desabonnee: "desabonnee";
        suspendue: "suspendue";
    }>;
    confirmedAt: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type Subscription = z.infer<typeof Subscription>;
export declare const SubscriptionSaved: z.ZodObject<{
    subscription: z.ZodObject<{
        occupations: z.ZodArray<z.ZodString>;
        country: z.ZodEnum<{
            DE: "DE";
            FR: "FR";
        }>;
        city: z.ZodString;
        radiusKm: z.ZodNumber;
        workingTime: z.ZodEnum<{
            indifferent: "indifferent";
            plein: "plein";
            partiel: "partiel";
        }>;
        status: z.ZodEnum<{
            en_attente: "en_attente";
            active: "active";
            desabonnee: "desabonnee";
            suspendue: "suspendue";
        }>;
        confirmedAt: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, z.core.$strip>;
    confirmationSent: z.ZodBoolean;
}, z.core.$strip>;
/** Offre proposée par la veille, telle qu'envoyée dans un rapport quotidien. */
export declare const WatchMatch: z.ZodObject<{
    runDate: z.ZodString;
    rank: z.ZodNumber;
    title: z.ZodString;
    company: z.ZodNullable<z.ZodString>;
    city: z.ZodNullable<z.ZodString>;
    url: z.ZodString;
    rerankScore: z.ZodNullable<z.ZodNumber>;
    missingSkills: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type WatchMatch = z.infer<typeof WatchMatch>;
export declare const WatchRun: z.ZodObject<{
    id: z.ZodString;
    runDate: z.ZodString;
    startedAt: z.ZodString;
    finishedAt: z.ZodNullable<z.ZodString>;
    trigger: z.ZodEnum<{
        planifiee: "planifiee";
        manuelle: "manuelle";
    }>;
    summary: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strip>;
export type WatchRun = z.infer<typeof WatchRun>;
