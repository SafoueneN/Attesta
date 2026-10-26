import { LlmUnavailableError, } from "./provider.js";
/** Quota atteint (429) ou délai dépassé : le fournisseur suivant peut répondre. */
export function shouldFallBack(error) {
    return error instanceof LlmUnavailableError && (error.reason === "quota" || error.reason === "timeout");
}
/**
 * Chaîne de fournisseurs : en cas de quota atteint ou de délai dépassé, la même requête passe au suivant.
 * Un refus, une sortie non conforme, une autre panne ou une annulation par l'appelant ne déclenchent pas
 * de bascule : l'erreur remonte telle quelle. La consommation réelle (`usage.model`) dit quel modèle a
 * répondu.
 */
export class FallbackProvider {
    providers;
    onFallback;
    kind;
    model;
    constructor(providers, 
    /** Appelé à chaque bascule, pour le journal (jamais de contenu). */
    onFallback) {
        this.providers = providers;
        this.onFallback = onFallback;
        const first = providers[0];
        if (!first)
            throw new Error("FallbackProvider : au moins un fournisseur est requis");
        this.kind = first.kind;
        this.model = first.model;
    }
    async generate(request) {
        for (let i = 0;; i++) {
            const provider = this.providers[i];
            try {
                return await provider.generate(request);
            }
            catch (error) {
                const next = this.providers[i + 1];
                if (!next || request.signal?.aborted || !shouldFallBack(error))
                    throw error;
                this.onFallback?.({ from: provider.model, to: next.model, reason: error.reason });
            }
        }
    }
}
