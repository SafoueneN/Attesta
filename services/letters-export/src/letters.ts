import { createPromptLoader, dataBlock, LlmSchemaError, type LlmProvider } from "@attesta/llm-client";
import type { Generation } from "@attesta/shared-schemas";
import { z } from "zod";

/** Prompts versionnés du service (ADR 0016, point 8) ; historique : prompts/CHANGELOG.md. */
export const prompts = createPromptLoader(new URL("../prompts/", import.meta.url), { lettre: "v1" });

const MAX_SCHEMA_RETRIES = 2;
export const MAX_PARAGRAPHS = 6;

/** Sortie demandée au modèle : formules et paragraphes, chacun citant ses sources. */
export const LetterOutput = z.object({
  greeting: z.string(),
  paragraphs: z.array(z.object({ text: z.string(), sources: z.array(z.string()) })),
  closing: z.string(),
});
export type LetterOutput = z.infer<typeof LetterOutput>;

export interface VerifiedLine {
  text: string;
  sources: string[];
  /** Intitulé de l'expérience ou du projet, pour situer la ligne (sans employeur). */
  context?: string;
}

/** Lignes du CV vérifié : seule matière autorisée pour la lettre. */
export function verifiedLines(g: Generation): VerifiedLine[] {
  const cv = g.cv;
  if (!cv) return [];
  const entryTitle = (ref: string) => {
    const [, section, index] = ref.split("/");
    const i = Number(index);
    return section === "work" ? g.profile.work[i]?.position : g.profile.projects[i]?.name;
  };
  return [
    ...(cv.headline ? [{ text: cv.headline.text, sources: cv.headline.sources }] : []),
    ...cv.summary.map((l) => ({ text: l.text, sources: l.sources })),
    ...[...cv.work, ...cv.projects].flatMap((e) =>
      e.highlights.map((l) => ({ text: l.text, sources: l.sources, context: entryTitle(e.ref) })),
    ),
  ];
}

const DEFAULT_GREETING = "Madame, Monsieur,";
const DEFAULT_CLOSING =
  "Je me tiens à votre disposition pour un entretien et vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.";

/**
 * Rédaction de la lettre : l'offre analysée, les lignes vérifiées et le ton, en blocs de données. Relances
 * bornées sur une sortie non conforme ; les bornes de longueur sont appliquées par le code.
 */
export async function draftLetter(
  provider: LlmProvider,
  generation: Generation,
  tone: string,
  signal?: AbortSignal,
): Promise<LetterOutput> {
  const lines = verifiedLines(generation);
  const offer = generation.analysis ?? { title: generation.offerTitle, requirements: [], keywords: [] };
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_SCHEMA_RETRIES; attempt++) {
    try {
      const { data } = await provider.generate({
        step: "lettre",
        system: prompts.system("lettre"),
        messages: [
          {
            role: "user",
            content: [
              dataBlock("offre_analysee", offer),
              dataBlock("lignes_verifiees", lines),
              dataBlock("ton", tone),
            ].join("\n\n"),
          },
        ],
        schema: LetterOutput,
        effort: "medium",
        maxTokens: 4000,
        input: { offer, lines, tone },
        signal,
      });
      return {
        greeting: data.greeting.trim().slice(0, 200) || DEFAULT_GREETING,
        closing: data.closing.trim().slice(0, 400) || DEFAULT_CLOSING,
        paragraphs: data.paragraphs
          .map((p) => ({ text: p.text.trim().slice(0, 1500), sources: [...new Set(p.sources)].slice(0, 8) }))
          .filter((p) => p.text)
          .slice(0, MAX_PARAGRAPHS),
      };
    } catch (error) {
      lastError = error;
      if (!(error instanceof LlmSchemaError)) throw error;
    }
  }
  throw lastError;
}

const OPENINGS: Record<string, string> = {
  sobre: "Votre offre a retenu toute mon attention : mon parcours répond à plusieurs de vos attentes.",
  chaleureux:
    "C'est avec un réel enthousiasme que je vous adresse ma candidature : votre offre rejoint pleinement mes aspirations.",
  dynamique:
    "Votre offre m'a immédiatement donné envie de rejoindre votre équipe et de m'y investir pleinement.",
};

/**
 * Lettre de démonstration, sans modèle : une ouverture sans fait, puis les lignes vérifiées les plus proches
 * de l'offre, recopiées à l'identique. Aucune reformulation ; l'interface le signale.
 */
export function demoLetter(input: {
  offer: { keywords: { term: string }[] };
  lines: VerifiedLine[];
  tone: string;
}) {
  const keywords = input.offer.keywords.map((k) => k.term.toLowerCase());
  const relevance = (text: string) => keywords.filter((k) => text.toLowerCase().includes(k)).length;
  const facts = input.lines
    .filter((l) => l.sources.some((s) => /\/highlights\//.test(s)))
    .sort((a, b) => relevance(b.text) - relevance(a.text))
    .slice(0, 3);
  return {
    greeting: DEFAULT_GREETING,
    paragraphs: [
      { text: OPENINGS[input.tone] ?? OPENINGS.sobre!, sources: [] },
      ...facts.map((f) => ({ text: f.text, sources: f.sources })),
    ],
    closing: DEFAULT_CLOSING,
  };
}

export const demoHandlers = {
  lettre: (input: unknown) => demoLetter(input as Parameters<typeof demoLetter>[0]),
};
