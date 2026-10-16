import { z } from "zod";
import { entryRef, FactPointer } from "./common.js";

/**
 * CV ciblé produit par l'étape 3 du pipeline.
 *
 * Règle de conception : le modèle n'écrit que des lignes de texte libre, chacune
 * rattachée à au moins un fait du profil. Les champs factuels (employeur, poste,
 * dates, diplômes, compétences) ne passent jamais par le modèle : ils sont
 * recopiés par le code depuis le profil via `ref`. Le modèle choisit et ordonne,
 * il ne crée pas.
 */
export const CvLine = z.object({
  // 500 : longueur maximale d'un fait du profil, recopié tel quel quand le modèle ne le reprend pas.
  text: z.string().trim().min(1).max(500),
  sources: z.array(FactPointer).min(1, "Chaque ligne doit citer au moins une source").max(5),
});

const EntryWithLines = (section: string) =>
  z.object({ ref: entryRef(section), highlights: z.array(CvLine).max(20) });

export const TailoredCv = z.object({
  headline: CvLine.optional(),
  summary: z.array(CvLine).max(4),
  work: z.array(EntryWithLines("work")).max(15),
  projects: z.array(EntryWithLines("projects")).max(10),
  education: z.array(z.object({ ref: entryRef("education") })).max(10),
  skills: z.array(entryRef("skills")).max(30),
  languages: z.array(entryRef("languages")).max(10),
  certificates: z.array(entryRef("certificates")).max(15),
  /** Mots-clés de l'offre sans preuve dans le profil : signalés, jamais ajoutés. */
  missingKeywords: z.array(z.string().trim().min(1).max(100)).max(60),
});

/** Sortie de l'étape 4 : contrôle de fidélité, ligne par ligne. */
export const FaithfulnessIssue = z.object({
  kind: z.enum(["number", "date", "entity", "skill", "unresolved-source"]),
  value: z.string(),
});

export const FaithfulnessReport = z.object({
  score: z.number().min(0).max(1),
  checkedLines: z.number().int().min(0),
  supportedLines: z.number().int().min(0),
  lines: z.array(
    z.object({
      /** Position de la ligne dans le CV, ex. "/work/0/highlights/1". */
      path: z.string(),
      status: z.enum(["supported", "unsupported"]),
      issues: z.array(FaithfulnessIssue),
    }),
  ),
});

export type CvLine = z.infer<typeof CvLine>;
export type TailoredCv = z.infer<typeof TailoredCv>;
export type FaithfulnessReport = z.infer<typeof FaithfulnessReport>;
