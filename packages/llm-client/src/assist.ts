import type { z } from "zod";
import { dataBlock } from "./prompts.js";
import {
  LlmBudgetExceededError,
  LlmRefusalError,
  LlmSchemaError,
  LlmUnavailableError,
  type Effort,
  type LlmMessage,
  type LlmProvider,
} from "./provider.js";

/**
 * Appel structuré d'un assistant (ADR 0028) : données balisées, sortie validée par schéma, relances bornées
 * si la sortie est non conforme. Toute panne du fournisseur devient une `AssistUnavailableError`, que le
 * service traduit en réponse « indisponible » ; aucune sortie non validée n'est jamais renvoyée.
 * Plomberie commune seulement : le prompt, les données et la vérification restent dans chaque service.
 */
export class AssistUnavailableError extends Error {
  constructor(
    readonly reason: "indisponible" | "refus" | "budget" | "non-conforme",
    options?: { cause?: unknown },
  ) {
    super(`Assistant indisponible (${reason})`, options);
    this.name = "AssistUnavailableError";
  }
}

export interface AssistRequest<T> {
  provider: LlmProvider;
  step: string;
  system: string;
  /** Données transmises au modèle, chacune dans un bloc balisé (jamais traitées comme des consignes). */
  data: Record<string, unknown>;
  schema: z.ZodType<T>;
  effort?: Effort;
  maxTokens?: number;
  /** Relances après une sortie non conforme (en plus du premier essai). */
  retries?: number;
}

export async function assist<T>(request: AssistRequest<T>): Promise<{ data: T; kind: LlmProvider["kind"] }> {
  const messages: LlmMessage[] = [
    {
      role: "user",
      content: Object.entries(request.data)
        .map(([tag, value]) => dataBlock(tag, value))
        .join("\n\n"),
    },
  ];
  const retries = request.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await request.provider.generate({
        step: request.step,
        system: request.system,
        messages,
        schema: request.schema,
        effort: request.effort ?? "low",
        maxTokens: request.maxTokens ?? 4000,
        input: request.data,
      });
      return { data: result.data, kind: request.provider.kind };
    } catch (error) {
      if (error instanceof LlmSchemaError && attempt < retries) continue;
      if (error instanceof LlmSchemaError) throw new AssistUnavailableError("non-conforme", { cause: error });
      if (error instanceof LlmUnavailableError)
        throw new AssistUnavailableError("indisponible", { cause: error });
      if (error instanceof LlmRefusalError) throw new AssistUnavailableError("refus", { cause: error });
      if (error instanceof LlmBudgetExceededError)
        throw new AssistUnavailableError("budget", { cause: error });
      throw error;
    }
  }
}
