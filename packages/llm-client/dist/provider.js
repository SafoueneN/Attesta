/** Fournisseur injoignable, quota du fournisseur atteint, délai dépassé : mode dégradé. */
export class LlmUnavailableError extends Error {
    status;
    constructor(message, status, options) {
        super(message, options);
        this.status = status;
        this.name = "LlmUnavailableError";
    }
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
