import { z } from "zod";
import { Profile } from "../profile.js";

export const ProfileSave = z.object({ profile: Profile });

export const StoredProfile = z.object({
  version: z.number().int().positive(),
  createdAt: z.string(),
  schemaVersion: z.string(),
  profile: Profile,
});
export type StoredProfile = z.infer<typeof StoredProfile>;

export const ProfileVersionSummary = z.object({
  version: z.number().int().positive(),
  createdAt: z.string(),
  /** Libellé lisible : nom et titre du profil enregistré. */
  label: z.string(),
});

const text = z.string().nullable();

/**
 * Profil extrait d'un CV PDF : brouillon à relire, jamais enregistré tel quel. Champs nullables : le
 * candidat complète dans le formulaire, qui applique ensuite le contrat strict `Profile`.
 */
export const ImportedProfile = z.object({
  basics: z.object({
    name: text,
    label: text,
    email: text,
    phone: text,
    city: text,
    countryCode: text,
    url: text,
    summary: text,
  }),
  work: z.array(
    z.object({
      name: text,
      position: text,
      location: text,
      startDate: text,
      endDate: text,
      summary: text,
      highlights: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({ institution: text, studyType: text, area: text, startDate: text, endDate: text }),
  ),
  skills: z.array(z.object({ name: z.string(), keywords: z.array(z.string()) })),
  languages: z.array(z.object({ language: z.string(), fluency: text })),
});
export type ImportedProfile = z.infer<typeof ImportedProfile>;

/* ------------------------------------------------------------------------------------------------------ */
/* Pièces justificatives (ADR 0027)                                                                       */
/* ------------------------------------------------------------------------------------------------------ */

export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_MAX_COUNT = 20;
export const EVIDENCE_MIME = ["application/pdf", "image/png", "image/jpeg"] as const;

/** Élément du profil qu'une pièce peut appuyer : une expérience, une formation, un certificat, une langue. */
export const EvidenceTarget = z
  .string()
  .regex(/^\/(work|education|certificates|languages)\/\d{1,2}$/, "Élément du profil inconnu");

export const EvidenceKind = z.enum([
  "diplome",
  "attestation_employeur",
  "certificat",
  "recommandation",
  "autre",
]);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

/** Champs du formulaire de dépôt (le fichier voyage à côté, en multipart). */
export const EvidenceUpload = z.object({
  target: EvidenceTarget,
  kind: EvidenceKind,
  label: z.string().trim().min(1, "Donnez un nom à la pièce").max(120, "120 caractères au plus"),
});

/** Pièce jointe par le candidat : métadonnées seulement (le fichier se télécharge à part). */
export const Evidence = z.object({
  id: z.string(),
  target: EvidenceTarget,
  kind: EvidenceKind,
  label: z.string(),
  fileName: z.string(),
  mimeType: z.enum(EVIDENCE_MIME),
  sizeBytes: z.number().int().positive(),
  /** Libellé de l'élément du profil au moment du dépôt (ex. « Développeuse back-end – Transports Rhône »). */
  anchor: z.string(),
  /** Faux si l'élément visé a changé depuis : la pièce doit être rattachée de nouveau. */
  current: z.boolean(),
  createdAt: z.string(),
});
export type Evidence = z.infer<typeof Evidence>;

export const ImportResult = z.object({
  profile: ImportedProfile,
  /** Éléments proposés par l'IA mais absents du PDF, écartés. */
  dropped: z.number().int().min(0),
  /** Méthode d'extraction (ADR 0038) : par l'IA, ou par règles sans IA (aucun modèle, ou modèle en panne). */
  method: z.enum(["ia", "regles"]).default("ia"),
});
export type ImportResult = z.infer<typeof ImportResult>;

/** Photo du CV (ADR 0036) : stockée chiffrée à part du profil, jamais envoyée à l'IA. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const ProfilePhoto = z.object({
  mimeType: z.enum(["image/jpeg", "image/png"]),
  sizeBytes: z.number().int(),
  updatedAt: z.string(),
});
export type ProfilePhoto = z.infer<typeof ProfilePhoto>;
