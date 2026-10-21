import {
  LlmUnavailableError,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  type LlmStep,
} from "./provider.js";

/** Réponse de démonstration d'une étape, construite par le service à partir des données d'entrée. */
export type DemoHandler = (input: unknown) => unknown;

/**
 * Fournisseur de démonstration, sans modèle ni réseau. Le paquet n'en connaît pas les règles : chaque
 * service fournit, pour ses étapes, une fonction qui recopie le contenu d'entrée (aucune reformulation).
 * Sert au développement local et aux tests de bout en bout ; l'interface l'indique au candidat. Une étape
 * sans gestionnaire est indisponible (l'import de CV, par exemple).
 */
export class DemoProvider implements LlmProvider {
  readonly kind = "demo" as const;
  readonly model = "demo";

  constructor(private readonly handlers: Partial<Record<LlmStep, DemoHandler>> = {}) {}

  async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    const handler = this.handlers[request.step];
    if (!handler) throw new LlmUnavailableError(`Étape ${request.step} indisponible en mode démonstration`);
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
