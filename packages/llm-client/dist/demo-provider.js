import { LlmUnavailableError, } from "./provider.js";
/**
 * Fournisseur de démonstration, sans modèle ni réseau. Le paquet n'en connaît pas les règles : chaque
 * service fournit, pour ses étapes, une fonction qui recopie le contenu d'entrée (aucune reformulation).
 * Sert au développement local et aux tests de bout en bout ; l'interface l'indique au candidat. Une étape
 * sans gestionnaire est indisponible (l'import de CV, par exemple).
 */
export class DemoProvider {
    handlers;
    kind = "demo";
    model = "demo";
    constructor(handlers = {}) {
        this.handlers = handlers;
    }
    async generate(request) {
        const handler = this.handlers[request.step];
        if (!handler)
            throw new LlmUnavailableError(`Étape ${request.step} indisponible en mode démonstration`);
        const usage = {
            step: request.step,
            model: this.model,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            latencyMs: 0,
        };
        return { data: request.schema.parse(handler(request.input)), usage };
    }
}
