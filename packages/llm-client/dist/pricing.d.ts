/** Taux de conversion du budget (fixé le 2026-10-18, revu à chaque changement de tarif). */
export declare const EUR_PER_USD = 0.92;
/** Coût estimé d'un appel. Modèle inconnu : tarif Opus, par prudence. */
export declare function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number;
export declare const usdToEur: (usd: number) => number;
