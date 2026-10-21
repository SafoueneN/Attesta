import type { LlmProvider, LlmRequest, LlmResult, LlmStep } from "./provider.js";

/** Réponse enregistrée : une donnée brute (validée par le schéma demandé) ou une erreur à lever. */
export type ScriptedReply = { data: unknown } | { error: Error };

/**
 * Fournisseur de test : rejoue des réponses enregistrées, étape par étape, et
 * conserve les requêtes reçues. Utilisé par les tests de contrat et les évaluations
 * en mode rejeu (aucun appel réseau).
 */
export class ScriptedProvider implements LlmProvider {
  readonly kind = "ia" as const;
  readonly requests: LlmRequest<unknown>[] = [];

  constructor(
    private readonly script: Partial<Record<LlmStep, ScriptedReply[]>>,
    readonly model = "claude-opus-5-5",
  ) {}

  async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    this.requests.push(request as LlmRequest<unknown>);
    const reply = this.script[request.step]?.shift();
    if (!reply) throw new Error(`Aucune réponse enregistrée pour l'étape ${request.step}`);
    if ("error" in reply) throw reply.error;
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
