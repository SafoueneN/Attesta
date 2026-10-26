import { LlmUnavailableError, type LlmProvider, type LlmRequest, type LlmResult, type LlmUnavailableReason } from "./provider.js";
/** Quota atteint (429) ou délai dépassé : le fournisseur suivant peut répondre. */
export declare function shouldFallBack(error: unknown): error is LlmUnavailableError;
export interface FallbackEvent {
    from: string;
    to: string;
    reason: LlmUnavailableReason;
}
/**
 * Chaîne de fournisseurs : en cas de quota atteint ou de délai dépassé, la même requête passe au suivant.
 * Un refus, une sortie non conforme, une autre panne ou une annulation par l'appelant ne déclenchent pas
 * de bascule : l'erreur remonte telle quelle. La consommation réelle (`usage.model`) dit quel modèle a
 * répondu.
 */
export declare class FallbackProvider implements LlmProvider {
    private readonly providers;
    /** Appelé à chaque bascule, pour le journal (jamais de contenu). */
    private readonly onFallback?;
    readonly kind: LlmProvider["kind"];
    readonly model: string;
    constructor(providers: readonly LlmProvider[], 
    /** Appelé à chaque bascule, pour le journal (jamais de contenu). */
    onFallback?: ((event: FallbackEvent) => void) | undefined);
    generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
}
