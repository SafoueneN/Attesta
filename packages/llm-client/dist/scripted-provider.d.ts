import type { LlmProvider, LlmRequest, LlmResult, LlmStep } from "./provider.js";
/** Réponse enregistrée : une donnée brute (validée par le schéma demandé) ou une erreur à lever. */
export type ScriptedReply = {
    data: unknown;
} | {
    error: Error;
};
/**
 * Fournisseur de test : rejoue des réponses enregistrées, étape par étape, et
 * conserve les requêtes reçues. Utilisé par les tests de contrat et les évaluations
 * en mode rejeu (aucun appel réseau).
 */
export declare class ScriptedProvider implements LlmProvider {
    private readonly script;
    readonly model: string;
    readonly kind: "ia";
    readonly requests: LlmRequest<unknown>[];
    constructor(script: Partial<Record<LlmStep, ScriptedReply[]>>, model?: string);
    generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
}
