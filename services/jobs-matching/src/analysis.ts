import { createHash } from "node:crypto";
import { createPromptLoader, dataBlock, LlmSchemaError, type LlmProvider } from "@attesta/llm-client";
import { OfferAnalysis } from "@attesta/shared-schemas";
import { z } from "zod";
import { normalize } from "./text.js";

/** Prompts versionnés du service (ADR 0016, point 8) ; historique : prompts/CHANGELOG.md. */
export const prompts = createPromptLoader(new URL("../prompts/", import.meta.url), {
  "analyse-offre": "v1",
  "rerank-offres": "v1",
  "explication-correspondance": "v2",
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
/** Mots d'annonce qui ne sont pas des compétences : contrat, horaire, mentions légales. */
const NOT_SKILLS = new Set([
  "cdi",
  "cdd",
  "h f",
  "f h",
  "m w d",
  "rtt",
  "sas",
  "sarl",
  "smic",
  "temps plein",
  "temps partiel",
]);

/**
 * Lieux cités dans une annonce, repérés sans modèle : mot à majuscule après « à », « sur », « près de »,
 * « in », « bei », ou sur une ligne « Lieu : … » / « Standort: … ». Ils ne sont jamais des compétences.
 */
export function placeNames(offerText: string): Set<string> {
  const places = new Set<string>();
  const after =
    /(?:\b(?:à|a|sur|près de|proche de|in|bei|nahe)\s+)(\p{Lu}[\p{L}'-]+(?:[\s-]\p{Lu}[\p{L}'-]+)*)/gu;
  for (const m of offerText.matchAll(after)) for (const w of m[1]!.split(/[\s-]+/)) places.add(normalize(w));
  const line = /^\s*(?:lieu|localisation|ville|standort|arbeitsort|location)\s*:\s*(.+)$/gimu;
  for (const m of offerText.matchAll(line))
    for (const w of m[1]!.split(/[\s,()–-]+/)) if (/^\p{Lu}/u.test(w)) places.add(normalize(w));
  // Ligne de conditions (« CDI, 39 h, Mérignac. ») : un nom propre seul entre virgules y est un lieu.
  for (const l of offerText.split(/\r?\n/))
    if (/\b(cdi|cdd|stage|alternance|freelance|int[ée]rim|vollzeit|teilzeit)\b/i.test(l))
      for (const part of l.split(/[,;·|]/).map((p) => p.trim().replace(/[.]$/, "")))
        if (/^\p{Lu}[\p{Ll}'-]+(?:[\s-]\p{Lu}[\p{Ll}'-]+)*$/u.test(part))
          for (const w of part.split(/[\s-]+/)) places.add(normalize(w));
  return places;
}

export function demoAnalysis(offerText: string): OfferAnalysisOutput {
  // En allemand, tout nom commun prend une majuscule : la règle du « nom propre en milieu de phrase » n'y
  // repère pas des compétences. Seuls les sigles et termes techniques sont alors retenus.
  const german = (offerText.match(/\b(und|der|die|das|mit|für|wir|Sie)\b/g) ?? []).length >= 5;
  const technical = [...offerText.matchAll(/[\p{L}][\p{L}\p{N}.+#-]*[\p{L}\p{N}+#]/gu)]
    .filter(({ 0: term, index }) => {
      if (/[.+#\d]/.test(term) || /\p{Lu}.*\p{Lu}/u.test(term)) return true;
      if (german) return false;
      const before = offerText.slice(0, index).trimEnd();
      const midSentence =
        before.length > 0 && !/[.!?:\n]$/.test(before) && !/\n\s*$/.test(offerText.slice(0, index));
      return midSentence && /^\p{Lu}/u.test(term);
    })
    .map((m) => m[0]);
  // Le lieu, en fin de titre (« … – Paris La Défense »), n'est pas une compétence ; ni les mots de 2 lettres.
  const firstLine = offerText.split(/\r?\n/)[0]!.trim();
  const location = /\s[–—-]\s([^–—-]+)$/.exec(firstLine)?.[1]?.trim();
  const place = location ? normalize(location) : "";
  const places = placeNames(offerText);
  const unique = [...new Map(technical.map((t) => [normalize(t), t])).values()]
    // « BI », « C# » sont des compétences ; « La », « de », le contrat ou l'horaire non.
    .filter((t) => (t.length > 2 || /^[\p{Lu}\d+#]+$/u.test(t)) && !(place && place.includes(normalize(t))))
    .filter((t) => !NOT_SKILLS.has(normalize(t).trim()) && !places.has(normalize(t)))
    .slice(0, 20);
  return {
    title: firstLine.slice(0, 120) || "Offre",
    company: null,
    language: "fr",
    location: location?.slice(0, 120) ?? null,
    contractType: null,
    requirements: [],
    keywords: unique.map((term) => ({ term, weight: 1 })),
  };
}
