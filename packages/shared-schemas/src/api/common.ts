import { z } from "zod";

export const Uuid = z.uuid("Identifiant invalide");

/** Paramètre de chemin `{id}`. */
export const IdParam = z.object({ id: Uuid });

/** Origine d'un contenu rédigé : modèle réel ou démonstration (contenu recopié, sans IA). */
export const ProviderKind = z.enum(["ia", "demo"]);

/** Consommation du LLM d'un service pour le mois en cours (tableau de bord, ADR 0024). */
export const LlmUsageSummary = z.object({
  service: z.string(),
  month: z.string(),
  calls: z.number().int(),
  costEur: z.number(),
  budgetEur: z.number(),
  byStep: z.array(z.object({ step: z.string(), calls: z.number().int(), costEur: z.number() })),
});
export type LlmUsageSummary = z.infer<typeof LlmUsageSummary>;

/** Statistiques d'administration d'un service : compteurs seulement, aucune donnée personnelle. */
export const ServiceStats = z.object({
  service: z.string(),
  counters: z.record(z.string(), z.number()),
  llm: LlmUsageSummary.optional(),
  /** Avis 👍 / 👎 anonymes des 30 derniers jours, par rôle d’assistant (ADR 0029). */
  votes: z.array(z.object({ role: z.string(), up: z.number().int(), down: z.number().int() })).optional(),
});
export type ServiceStats = z.infer<typeof ServiceStats>;

/** Export RGPD d'un service (art. 15 et 20) : données propres au service, agrégées par auth. */
export const UserExport = z.object({ service: z.string(), data: z.unknown() });
