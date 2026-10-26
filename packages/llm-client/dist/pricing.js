/**
 * Tarifs publics de l'API Anthropic en USD par million de jetons (relevés le 2026-10-16). Sur Vertex AI,
 * la tarification est celle de Google Cloud et peut différer : ces chiffres servent d'estimation et de
 * garde-fou budgétaire, la facture fait foi.
 */
const PRICES_USD_PER_MTOK = {
    "claude-opus-5-5": { input: 4, output: 20 },
    "claude-sonnet-5-5": { input: 2, output: 10 },
    "claude-haiku-5-5": { input: 0.1, output: 0.5 },
    // Groq et Gemini : relevés le 2026-10-26 auprès d'agrégateurs de tarifs (pages officielles à vérifier).
    // Ollama, exécuté localement, n'est pas facturé : son fournisseur compte un coût nul.
    "openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
    "openai/gpt-oss-20b": { input: 0.075, output: 0.3 },
    "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
    "gemini-2.5-flash": { input: 0.3, output: 2.5 },
    "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
};
/** Taux de conversion du budget (fixé le 2026-10-18, revu à chaque changement de tarif). */
export const EUR_PER_USD = 0.92;
/** Coût estimé d'un appel. Modèle inconnu : tarif Opus, par prudence. */
export function estimateCostUsd(model, inputTokens, outputTokens) {
    const price = PRICES_USD_PER_MTOK[model] ?? PRICES_USD_PER_MTOK["claude-opus-5-5"];
    return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
export const usdToEur = (usd) => usd * EUR_PER_USD;
