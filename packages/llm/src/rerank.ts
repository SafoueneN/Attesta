import { z } from "zod";
import { normalize, sanitizeText } from "./faithfulness.js";
import { MAX_SCHEMA_RETRIES, type DegradedReason } from "./pipeline.js";
import { dataBlock, systemPrompt } from "./prompts.js";
import {
  LlmRefusalError,
  LlmSchemaError,
  LlmUnavailableError,
  type LlmProvider,
  type LlmUsage,
} from "./provider.js";

/** Offres soumises au rerank au plus (docs/adr/0007 : top 20 seulement). */
export const RERANK_MAX_POSTINGS = 20;
const POSTING_EXCERPT_CHARS = 1500;
const MAX_MISSING = 5;

export const RerankOutput = z.object({
  offres: z.array(
    z.object({
      id: z.string(),
      pertinence: z.number(),
      competencesManquantes: z.array(z.string()),
    }),
  ),
});
export type RerankOutput = z.infer<typeof RerankOutput>;

export interface RerankPosting {
  id: string;
  title: string;
  body: string;
}

export interface RerankInput {
  /** Profil anonymisé (ni nom, ni coordonnées, ni employeur). */
  profileText: string;
  /** Texte complet du profil, jamais envoyé au modèle : vérifie qu'une compétence citée n'y figure pas déjà. */
  profileCorpus?: string;
  /** Postes classés par l'étage de rappel, du meilleur au moins bon. */
  postings: RerankPosting[];
}

export interface RerankedPosting {
  id: string;
  /** Pertinence de 0 à 100 ; nulle si le modèle n'a pas classé l'offre. */
  score: number | null;
  /** Compétences demandées par l'offre et absentes du profil, vérifiées par le code. */
  missingSkills: string[];
}

export type RerankResult =
  | { status: "ok"; postings: RerankedPosting[]; usage: LlmUsage[] }
  | { status: "degraded"; reason: DegradedReason; usage: LlmUsage[] };

/**
 * Une compétence citée par le modèle n'est retenue que si elle figure dans le
 * texte de l'offre et nulle part dans le profil : le rapport ne peut ni inventer
 * une exigence, ni reprocher l'absence d'une compétence déclarée.
 */
export function groundMissingSkills(skills: string[], postingText: string, profileText: string): string[] {
  const offer = normalize(sanitizeText(postingText));
  const profile = normalize(sanitizeText(profileText));
  const kept = new Map<string, string>();
  for (const raw of skills) {
    const skill = sanitizeText(raw).trim();
    const key = normalize(skill);
    if (!key.trim() || skill.length > 60 || kept.has(key)) continue;
    if (offer.includes(key) && !profile.includes(key)) kept.set(key, skill);
  }
  return [...kept.values()].slice(0, MAX_MISSING);
}

/**
 * Étage de précision de la veille : le modèle reclasse au plus 20 offres et cite
 * les compétences manquantes. Toute panne aboutit au mode dégradé (classement de
 * l'étage de rappel conservé), jamais à une sortie non validée.
 */
export async function rerankPostings(
  deps: { provider: LlmProvider; maxCostUsd: number; onUsage?: (usage: LlmUsage) => void },
  input: RerankInput,
  signal?: AbortSignal,
): Promise<RerankResult> {
  const postings = input.postings.slice(0, RERANK_MAX_POSTINGS);
  // Identifiants courts : moins de jetons, et aucun identifiant interne envoyé au modèle.
  const shortIds = postings.map((_, i) => `o${i + 1}`);
  const payload = {
    profil: input.profileText,
    offres: postings.map((p, i) => ({
      id: shortIds[i],
      intitule: p.title,
      texte: p.body.slice(0, POSTING_EXCERPT_CHARS),
    })),
  };
  const usage: LlmUsage[] = [];
  const spent = () => usage.reduce((sum, u) => sum + u.costUsd, 0);

  for (let attempt = 0; attempt <= MAX_SCHEMA_RETRIES; attempt++) {
    if (spent() >= deps.maxCostUsd) return { status: "degraded", reason: "budget", usage };
    try {
      const result = await deps.provider.generate({
        step: "rerank-offres",
        system: systemPrompt("rerank-offres"),
        messages: [
          {
            role: "user",
            content: [dataBlock("profil", payload.profil), dataBlock("offres", payload.offres)].join("\n\n"),
          },
        ],
        schema: RerankOutput,
        effort: "low",
        maxTokens: 4000,
        input: payload,
        signal,
      });
      usage.push(result.usage);
      deps.onUsage?.(result.usage);
      const byId = new Map(result.data.offres.map((o) => [o.id, o]));
      return {
        status: "ok",
        usage,
        postings: postings.map((p, i) => {
          const ranked = byId.get(shortIds[i]!);
          return {
            id: p.id,
            score: ranked ? Math.max(0, Math.min(100, Math.round(ranked.pertinence))) : null,
            missingSkills: ranked
              ? groundMissingSkills(
                  ranked.competencesManquantes,
                  `${p.title}\n${p.body}`,
                  input.profileCorpus ?? input.profileText,
                )
              : [],
          };
        }),
      };
    } catch (error) {
      if (error instanceof LlmSchemaError) {
        if (error.usage) {
          usage.push(error.usage);
          deps.onUsage?.(error.usage);
        }
        continue;
      }
      if (error instanceof LlmUnavailableError) return { status: "degraded", reason: "indisponible", usage };
      if (error instanceof LlmRefusalError) return { status: "degraded", reason: "refus", usage };
      throw error;
    }
  }
  return { status: "degraded", reason: "non-conforme", usage };
}
