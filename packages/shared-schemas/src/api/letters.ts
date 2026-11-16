import { z } from "zod";
import { FactPointer } from "../common.js";
import { FaithfulnessIssue } from "../cv.js";
import { ProviderKind, Uuid } from "./common.js";
import { Country } from "./jobs.js";

export const LetterTone = z.enum(["sobre", "chaleureux", "dynamique"]);

export const LetterCreate = z.object({
  generationId: Uuid,
  tone: LetterTone.default("sobre"),
});

/** Paragraphe d'une lettre : comme une ligne de CV, il cite les faits du profil qui le prouvent. */
export const LetterParagraph = z.object({
  text: z.string().trim().min(1).max(1500),
  sources: z.array(FactPointer).max(8),
  status: z.enum(["supported", "unsupported", "edited"]),
  issues: z.array(FaithfulnessIssue),
});

export const Letter = z.object({
  id: Uuid,
  generationId: Uuid,
  offerTitle: z.string(),
  company: z.string().nullable(),
  tone: LetterTone,
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Formule d'appel et de politesse, sans fait à prouver. */
  greeting: z.string(),
  closing: z.string(),
  paragraphs: z.array(LetterParagraph),
  removed: z.number().int(),
  providerKind: ProviderKind,
});
export type Letter = z.infer<typeof Letter>;

export const LetterSummary = Letter.pick({
  id: true,
  generationId: true,
  offerTitle: true,
  company: true,
  createdAt: true,
  updatedAt: true,
});

export const LetterUpdate = z.object({
  greeting: z.string().trim().min(1).max(200),
  closing: z.string().trim().min(1).max(400),
  paragraphs: z
    .array(z.object({ text: z.string().trim().min(1, "Un paragraphe ne peut pas être vide").max(1500) }))
    .min(1)
    .max(8),
});

/** Modèles du CV (ADR 0041), tous en une colonne lisible par les ATS. */
export const CvVariant = z.enum(["ats", "design", "classique", "moderne", "compact"]);
export type CvVariant = z.infer<typeof CvVariant>;

/** Export d'un CV : ciblé (génération vérifiée) ou non adapté (profil enregistré, sans IA). */
export const CvExportRequest = z.object({
  generationId: Uuid.optional(),
  variant: CvVariant.default("ats"),
  /** Pièces justificatives choisies par le candidat, ajoutées en annexe après le CV (ADR 0027). */
  evidenceIds: z.array(Uuid).max(20).default([]),
  /** CV traduit (ADR 0029, point 6) : la traduction conservée par cv-generation remplace chaque ligne. */
  lang: z.enum(["fr", "en", "de"]).default("fr"),
  /**
   * Usages du pays visé (ADR 0036) : photo, date de naissance, nationalité et signature affichées ou
   * masquées (Canada : ni photo, ni âge, ni nationalité). Sans pays : usages français.
   */
  norms: Country.default("FR"),
});

/** CV en ligne (ADR 0042) : instantané partagé par un lien secret, non indexé, révocable. */
export const CvShareCreate = CvExportRequest.pick({
  generationId: true,
  variant: true,
  norms: true,
  lang: true,
}).extend({
  generationId: Uuid,
  /** Le candidat accepte que ses coordonnées soient visibles par quiconque reçoit le lien. */
  consent: z.literal(true, "Confirmez que vos coordonnées seront visibles par quiconque a le lien."),
});
export const CvShare = z.object({
  id: Uuid,
  generationId: Uuid.nullable(),
  offerTitle: z.string(),
  /** Lien complet : renvoyé seulement à la création (seule l'empreinte du jeton est stockée). */
  url: z.string().optional(),
  views: z.number().int(),
  lastViewedAt: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type CvShare = z.infer<typeof CvShare>;
