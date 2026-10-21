import { z } from "zod";
import { comparePartialDates, Email, Highlight, LongText, PartialDate, ShortText, WebUrl } from "./common.js";

/**
 * Profil candidat, compatible JSON Resume (https://jsonresume.org/schema).
 * C'est la seule source de vérité : toute ligne du CV généré doit y renvoyer.
 */

const Location = z.object({
  city: z.string().trim().max(100).optional(),
  region: z.string().trim().max(100).optional(),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/, "Code pays ISO 3166-1 alpha-2")
    .optional(),
});

/** Refus d'une date de fin antérieure à la date de début. */
function withDateOrder<T extends z.ZodObject<{ startDate: z.ZodTypeAny; endDate: z.ZodTypeAny }>>(schema: T) {
  return schema.superRefine((entry, ctx) => {
    const { startDate, endDate } = entry as { startDate?: string; endDate?: string };
    if (startDate && endDate && comparePartialDates(endDate, startDate) < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "La date de fin précède la date de début",
      });
    }
  });
}

export const Basics = z.object({
  name: ShortText,
  label: ShortText.optional(),
  email: Email.optional(),
  phone: z.string().trim().max(40).optional(),
  url: WebUrl.optional(),
  summary: LongText.optional(),
  location: Location.optional(),
  profiles: z
    .array(z.object({ network: ShortText, url: WebUrl }))
    .max(10)
    .default([]),
});

export const Work = withDateOrder(
  z.object({
    name: ShortText,
    position: ShortText,
    url: WebUrl.optional(),
    location: z.string().trim().max(100).optional(),
    startDate: PartialDate,
    endDate: PartialDate.optional(),
    summary: LongText.optional(),
    highlights: z.array(Highlight).max(20).default([]),
  }),
);

export const Education = withDateOrder(
  z.object({
    institution: ShortText,
    area: ShortText.optional(),
    studyType: ShortText.optional(),
    startDate: PartialDate.optional(),
    endDate: PartialDate.optional(),
    score: z.string().trim().max(50).optional(),
    courses: z.array(ShortText).max(20).default([]),
  }),
);

export const Skill = z.object({
  name: ShortText,
  level: z.string().trim().max(50).optional(),
  keywords: z.array(ShortText).max(30).default([]),
});

export const Language = z.object({
  language: ShortText,
  fluency: z.string().trim().max(50).optional(),
});

export const Project = withDateOrder(
  z.object({
    name: ShortText,
    description: LongText.optional(),
    highlights: z.array(Highlight).max(20).default([]),
    startDate: PartialDate.optional(),
    endDate: PartialDate.optional(),
    url: WebUrl.optional(),
  }),
);

export const Certificate = z.object({
  name: ShortText,
  issuer: ShortText.optional(),
  date: PartialDate.optional(),
  url: WebUrl.optional(),
});

export const Profile = z.object({
  basics: Basics,
  work: z.array(Work).max(30).default([]),
  education: z.array(Education).max(15).default([]),
  skills: z.array(Skill).max(50).default([]),
  languages: z.array(Language).max(15).default([]),
  projects: z.array(Project).max(30).default([]),
  certificates: z.array(Certificate).max(30).default([]),
});

export type Profile = z.infer<typeof Profile>;
export type ProfileInput = z.input<typeof Profile>;
