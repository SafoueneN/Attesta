/**
 * Fournisseur de test : rejoue des réponses enregistrées, étape par étape, et
 * conserve les requêtes reçues. Utilisé par les tests de contrat et les évaluations
 * en mode rejeu (aucun appel réseau).
 */
export class ScriptedProvider {
    script;
    model;
    kind = "ia";
    requests = [];
    constructor(script, model = "claude-opus-5-5") {
        this.script = script;
        this.model = model;
    }
    async generate(request) {
        this.requests.push(request);
        const reply = this.script[request.step]?.shift();
        if (!reply)
            throw new Error(`Aucune réponse enregistrée pour l'étape ${request.step}`);
        if ("error" in reply)
            throw reply.error;
        const usage = {
            step: request.step,
            model: this.model,
            inputTokens: 1000,
            outputTokens: 500,
            costUsd: 0.014,
            latencyMs: 1,
        };
        return { data: request.schema.parse(reply.data), usage };
    }
}
