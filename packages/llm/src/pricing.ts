/**
 * Tarifs publics de l'API Anthropic en USD par million de jetons (relevés le
 * 2026-10-16). Sur Vertex AI, la tarification est celle de Google Cloud et peut
 * différer : ces chiffres servent d'estimation et de garde-fou budgétaire, la
 * facture fait foi.
 */
const PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

/** Coût estimé d'un appel. Modèle inconnu : tarif Opus, par prudence. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES_USD_PER_MTOK[model] ?? PRICES_USD_PER_MTOK["claude-opus-5-5"]!;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
