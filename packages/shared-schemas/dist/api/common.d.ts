import { z } from "zod";
export declare const Uuid: z.ZodUUID;
/** Paramètre de chemin `{id}`. */
export declare const IdParam: z.ZodObject<{
    id: z.ZodUUID;
}, z.core.$strip>;
/** Origine d'un contenu rédigé : modèle réel ou démonstration (contenu recopié, sans IA). */
export declare const ProviderKind: z.ZodEnum<{
    ia: "ia";
    demo: "demo";
}>;
/** Consommation du LLM d'un service pour le mois en cours (tableau de bord, ADR 0024). */
export declare const LlmUsageSummary: z.ZodObject<{
    service: z.ZodString;
    month: z.ZodString;
    calls: z.ZodNumber;
    costEur: z.ZodNumber;
    budgetEur: z.ZodNumber;
    byStep: z.ZodArray<z.ZodObject<{
        step: z.ZodString;
        calls: z.ZodNumber;
        costEur: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type LlmUsageSummary = z.infer<typeof LlmUsageSummary>;
/** Statistiques d'administration d'un service : compteurs seulement, aucune donnée personnelle. */
export declare const ServiceStats: z.ZodObject<{
    service: z.ZodString;
    counters: z.ZodRecord<z.ZodString, z.ZodNumber>;
    llm: z.ZodOptional<z.ZodObject<{
        service: z.ZodString;
        month: z.ZodString;
        calls: z.ZodNumber;
        costEur: z.ZodNumber;
        budgetEur: z.ZodNumber;
        byStep: z.ZodArray<z.ZodObject<{
            step: z.ZodString;
            calls: z.ZodNumber;
            costEur: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    votes: z.ZodOptional<z.ZodArray<z.ZodObject<{
        role: z.ZodString;
        up: z.ZodNumber;
        down: z.ZodNumber;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type ServiceStats = z.infer<typeof ServiceStats>;
/** Export RGPD d'un service (art. 15 et 20) : données propres au service, agrégées par auth. */
export declare const UserExport: z.ZodObject<{
    service: z.ZodString;
    data: z.ZodUnknown;
}, z.core.$strip>;
