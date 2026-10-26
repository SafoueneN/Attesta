/** Fournisseur injoignable, quota du fournisseur atteint, délai dépassé : mode dégradé. */
export class LlmUnavailableError extends Error {
    status;
    reason;
    constructor(message, status, options) {
        super(message, options);
        this.status = status;
        this.name = "LlmUnavailableError";
        this.reason = options?.reason ?? (status === 429 ? "quota" : status === undefined ? "reseau" : "autre");
    }
}
/**
 * Erreur d'appel d'un fournisseur, sans rien de la requête ni de la réponse (elles peuvent contenir des
 * données personnelles) : seulement le fournisseur et le statut HTTP.
 */
export function llmUnavailable(provider, status, timedOut = false) {
    if (timedOut) {
        return new LlmUnavailableError(`Appel LLM en échec (${provider}, délai dépassé)`, status, {
            reason: "timeout",
        });
    }
    return new LlmUnavailableError(`Appel LLM en échec (${provider}, ${status ?? "réseau"})`, status);
}
/** Le modèle a décliné la requête (stop_reason « refusal »). */
export class LlmRefusalError extends Error {
    category;
    constructor(category) {
        super(`Requête déclinée par le modèle (${category ?? "catégorie inconnue"})`);
        this.category = category;
        this.name = "LlmRefusalError";
    }
}
/** Sortie absente, tronquée ou non conforme au schéma. */
export class LlmSchemaError extends Error {
    usage;
    constructor(message, usage) {
        super(message);
        this.usage = usage;
        this.name = "LlmSchemaError";
    }
}
/** Budget mensuel du service atteint (ADR 0016, point 6) : coupure automatique, mode dégradé. */
export class LlmBudgetExceededError extends Error {
    service;
    constructor(service) {
        super(`Budget LLM mensuel atteint pour ${service}`);
        this.service = service;
        this.name = "LlmBudgetExceededError";
    }
}
