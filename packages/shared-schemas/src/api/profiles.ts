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

export const ImportResult = z.object({
  profile: ImportedProfile,
  /** Éléments proposés par l'IA mais absents du PDF, écartés. */
  dropped: z.number().int().min(0),
});
export type ImportResult = z.infer<typeof ImportResult>;
