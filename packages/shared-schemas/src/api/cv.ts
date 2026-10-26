import { z } from "zod";
import { FaithfulnessIssue, FaithfulnessReport, TailoredCv } from "../cv.js";
import { OfferAnalysis } from "../offer.js";
import { Profile } from "../profile.js";
import { ProviderKind, Uuid } from "./common.js";

export const GenerationCreate = z.object({ offerId: Uuid });

/** Ligne écartée par le contrôle de fidélité, avec ses raisons. */
export const RemovedLine = z.object({
  path: z.string(),
  text: z.string(),
  issues: z.array(FaithfulnessIssue),
});
export type RemovedLine = z.infer<typeof RemovedLine>;

export const GenerationStatus = z.enum(["ok", "degraded"]);

export const DegradedReason = z.enum(["indisponible", "refus", "budget", "non-conforme", "quota"]);

/**
 * Génération d'un CV ciblé. Le profil est l'instantané utilisé : les pointeurs du CV désignent ses
 * faits, même si le candidat modifie ensuite son profil.
 */
export const Generation = z.object({
  id: Uuid,
  offerId: Uuid,
  offerTitle: z.string(),
  profileVersion: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: GenerationStatus,
  degradedReason: DegradedReason.nullable(),
  /** Message lisible en cas de mode dégradé. */
  message: z.string().nullable(),
  cv: TailoredCv.nullable(),
  report: FaithfulnessReport.nullable(),
  removed: z.array(RemovedLine),
  /** Positions des lignes modifiées à la main par le candidat. */
  edited: z.array(z.string()),
  /** Révision, incrémentée à chaque correction : protège contre l'écrasement d'un autre onglet. */
  revision: z.number().int(),
  analysis: OfferAnalysis.nullable(),
  profile: Profile,
  providerKind: ProviderKind,
  model: z.string(),
  pipelineVersion: z.string(),
});
export type Generation = z.infer<typeof Generation>;

export const GenerationSummary = z.object({
  id: Uuid,
  offerTitle: z.string(),
  createdAt: z.string(),
  status: GenerationStatus,
  score: z.number().nullable(),
  providerKind: ProviderKind,
});
export type GenerationSummary = z.infer<typeof GenerationSummary>;

export const Corrections = z.object({
  revision: z.number().int(),
  lines: z
    .array(
      z.object({
        path: z.string().regex(/^\/(headline|summary\/\d+|(work|projects)\/\d+\/highlights\/\d+)$/),
        text: z.string().max(500, "500 caractères maximum").optional(),
        remove: z.boolean().optional(),
      }),
    )
    .max(200),
  /**
   * Lignes ajoutées (ADR 0029, conseil ATS appliqué) : un fait du profil recopié, avec sa source, dans
   * l'entrée du CV qui le porte. Le service vérifie que la source existe et appartient à cette entrée.
   */
  additions: z
    .array(
      z.object({
        entry: z.string().regex(/^\/(summary|(work|projects)\/\d+)$/),
        text: z.string().trim().min(1).max(500),
        sources: z.array(z.string().max(100)).min(1).max(5),
      }),
    )
    .max(10)
    .default([]),
});
export type Corrections = z.infer<typeof Corrections>;

/**
 * Contrôle de fidélité de lignes libres (paragraphes d'une lettre) contre le profil d'une génération :
 * une seule implémentation du contrôle, celle de cv-generation.
 */
export const LinesCheck = z.object({
  lines: z
    .array(z.object({ text: z.string().max(1500), sources: z.array(z.string().max(100)).max(8) }))
    .min(1)
    .max(20),
});
export type LinesCheck = z.infer<typeof LinesCheck>;

export const LinesCheckResult = z.object({
  lines: z.array(
    z.object({ status: z.enum(["supported", "unsupported"]), issues: z.array(FaithfulnessIssue) }),
  ),
});
export type LinesCheckResult = z.infer<typeof LinesCheckResult>;

/** Événements du flux de génération (SSE, ADR 0012, point 6). */
export const GenerationEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), message: z.string() }),
  z.object({ type: z.literal("done"), generationId: Uuid, status: GenerationStatus }),
  z.object({ type: z.literal("failure"), message: z.string() }),
]);
export type GenerationEvent = z.infer<typeof GenerationEvent>;
