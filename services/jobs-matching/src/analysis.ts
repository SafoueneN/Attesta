import { createHash } from "node:crypto";
import { createPromptLoader, dataBlock, LlmSchemaError, type LlmProvider } from "@attesta/llm-client";
import { OfferAnalysis } from "@attesta/shared-schemas";
import { z } from "zod";
import { normalize } from "./text.js";

/** Prompts versionnés du service (ADR 0016, point 8) ; historique : prompts/CHANGELOG.md. */
export const prompts = createPromptLoader(new URL("../prompts/", import.meta.url), {
  "analyse-offre": "v1",
  "rerank-offres": "v1",
});

/** Relances après une sortie non conforme au contrat (en plus du premier essai). */
export const MAX_SCHEMA_RETRIES = 2;

/**
 * Schéma demandé au modèle : volontairement simple (nullables, énumérations) pour les sorties
 * structurées ; les contraintes du contrat sont appliquées ensuite par `toOfferAnalysis`.
 */
export const OfferAnalysisOutput = z.object({
  title: z.string(),
  company: z.string().nullable(),
  language: z.enum(["fr", "de", "en"]),
  location: z.string().nullable(),
  contractType: z.enum(["cdi", "cdd", "freelance", "stage", "alternance", "autre"]).nullable(),
  requirements: z.array(
    z.object({ text: z.string(), priority: z.enum(["must", "nice"]), skills: z.array(z.string()) }),
  ),
  keywords: z.array(z.object({ term: z.string(), weight: z.number() })),
});
export type OfferAnalysisOutput = z.infer<typeof OfferAnalysisOutput>;

/** Ramène la sortie du modèle au contrat : nulls retirés, bornes appliquées. */
export function toOfferAnalysis(data: OfferAnalysisOutput): OfferAnalysis {
  const clean = (s: string | null) => (s?.trim() ? s.trim().slice(0, 200) : undefined);
  const result = OfferAnalysis.safeParse({
    title: clean(data.title) ?? "Offre sans intitulé",
    company: clean(data.company),
    language: data.language,
    location: clean(data.location),
    contractType: data.contractType ?? undefined,
    requirements: data.requirements
      .filter((r) => r.text.trim())
      .slice(0, 40)
      .map((r) => ({
        text: r.text.trim().slice(0, 300),
        priority: r.priority,
        skills: r.skills
          .map((s) => s.trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 10),
      })),
    keywords: data.keywords
      .filter((k) => k.term.trim())
      .slice(0, 60)
      .map((k) => ({ term: k.term.trim().slice(0, 200), weight: Math.min(1, Math.max(0, k.weight)) })),
  });
  if (!result.success) throw new LlmSchemaError("Analyse d'offre non conforme au contrat");
  return result.data;
}

/** Cache des analyses (texte public de l'offre, aucune donnée du candidat), borné à 500 offres. */
const cache = new Map<string, OfferAnalysis>();

/**
 * Analyse structurée d'une offre : exigences et mots-clés recopiés tels qu'écrits. L'offre est une donnée
 * balisée, jamais une consigne (ADR 0016, point 5). Relances bornées sur sortie non conforme.
 */
export async function analyseOffer(provider: LlmProvider, offerText: string, signal?: AbortSignal) {
  const key = `${provider.model}:${prompts.signature("analyse-offre")}:${createHash("sha256").update(offerText).digest("hex")}`;
  const cached = cache.get(key);
  if (cached) return cached;
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_SCHEMA_RETRIES; attempt++) {
    try {
      const { data } = await provider.generate({
        step: "analyse-offre",
        system: prompts.system("analyse-offre"),
        messages: [{ role: "user", content: dataBlock("offre", { texte: offerText }) }],
        schema: OfferAnalysisOutput,
        effort: "low",
        maxTokens: 8000,
        input: { offerText },
        signal,
      });
      const analysis = toOfferAnalysis(data);
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      cache.set(key, analysis);
      return analysis;
    } catch (error) {
      lastError = error;
      if (!(error instanceof LlmSchemaError)) throw error;
    }
  }
  throw lastError;
}

/**
 * Analyse de démonstration, sans modèle : premier titre de l'offre, et termes techniques (majuscules
 * internes, chiffres, points, noms propres en milieu de phrase) comme mots-clés. Aucune reformulation.
 */
export function demoAnalysis(offerText: string): OfferAnalysisOutput {
  const technical = [...offerText.matchAll(/[\p{L}][\p{L}\p{N}.+#-]*[\p{L}\p{N}+#]/gu)]
    .filter(({ 0: term, index }) => {
      if (/[.+#\d]/.test(term) || /\p{Lu}.*\p{Lu}/u.test(term)) return true;
      const before = offerText.slice(0, index).trimEnd();
      const midSentence =
        before.length > 0 && !/[.!?:\n]$/.test(before) && !/\n\s*$/.test(offerText.slice(0, index));
      return midSentence && /^\p{Lu}/u.test(term);
    })
    .map((m) => m[0]);
  const unique = [...new Map(technical.map((t) => [normalize(t), t])).values()].slice(0, 20);
  return {
    title: offerText.split(/\r?\n/)[0]!.trim().slice(0, 120) || "Offre",
    company: null,
    language: "fr",
    location: null,
    contractType: null,
    requirements: [],
    keywords: unique.map((term) => ({ term, weight: 1 })),
  };
}
