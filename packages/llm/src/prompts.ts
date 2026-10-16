import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { LlmStep } from "./provider.js";

/** Version en vigueur de chaque prompt (historique : prompts/CHANGELOG.md). */
export const PROMPT_VERSIONS: Record<LlmStep, string> = {
  "analyse-offre": "v1",
  redaction: "v1",
  "extraction-cv": "v1",
};

const promptsDir = new URL("../../../prompts/", import.meta.url);
const cache = new Map<LlmStep, string>();

export function systemPrompt(step: LlmStep): string {
  let text = cache.get(step);
  if (!text) {
    const file = new URL(`${step}/${PROMPT_VERSIONS[step]}.md`, promptsDir);
    text = readFileSync(fileURLToPath(file), "utf8");
    cache.set(step, text);
  }
  return text;
}

/** Identifiant de version de l'ensemble du pipeline, enregistré avec chaque génération. */
export const PIPELINE_VERSION = `analyse-offre@${PROMPT_VERSIONS["analyse-offre"]}+redaction@${PROMPT_VERSIONS.redaction}`;

/**
 * Bloc de données balisé. Le contenu est sérialisé en JSON et chaque « < » est
 * échappé en < : un texte d'offre ou de CV ne peut donc pas fermer la balise
 * pour se faire passer pour une consigne.
 */
export function dataBlock(tag: string, value: unknown): string {
  const json = JSON.stringify(value, null, 2).replace(/</g, "\\u003c");
  return `<${tag}>\n${json}\n</${tag}>`;
}
