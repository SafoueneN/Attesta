import { z } from "zod";
import { FactPointer } from "../common.js";
import { FaithfulnessIssue } from "../cv.js";
import { ProviderKind, Uuid } from "./common.js";
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
export const CvVariant = z.enum(["ats", "design"]);
/** Export d'un CV : ciblé (génération vérifiée) ou non adapté (profil enregistré, sans IA). */
export const CvExportRequest = z.object({
    generationId: Uuid.optional(),
    variant: CvVariant.default("ats"),
});
