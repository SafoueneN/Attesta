import type { z } from "zod";

/** Identifiant d'une étape (= d'un prompt versionné) : `analyse-offre`, `redaction`, `lettre`… */
export type LlmStep = string;
export type Effort = "low" | "medium" | "high";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest<T> {
  step: LlmStep;
  /** Prompt système versionné (`prompts/<étape>/vN.md` du service). */
  system: string;
  messages: LlmMessage[];
  /** Schéma de la sortie structurée attendue du modèle. */
  schema: z.ZodType<T>;
  effort: Effort;
  maxTokens: number;
  /**
   * Données structurées à partir desquelles les messages ont été rendus. Ignorées par les fournisseurs
   * réels ; utilisées par les fournisseurs de démonstration et de test.
   */
  input: unknown;
  signal?: AbortSignal;
}

export interface LlmUsage {
  step: LlmStep;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface LlmResult<T> {
  data: T;
  usage: LlmUsage;
}

export interface LlmProvider {
  /** « ia » : modèle réel ; « demo » : aucun modèle, contenu recopié du profil. */
  readonly kind: "ia" | "demo";
  readonly model: string;
  generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
}

/** Cause d'une indisponibilité : « quota » (429) et « timeout » déclenchent le fournisseur suivant. */
export type LlmUnavailableReason = "quota" | "timeout" | "reseau" | "autre";

/** Fournisseur injoignable, quota du fournisseur atteint, délai dépassé : mode dégradé. */
export class LlmUnavailableError extends Error {
  readonly reason: LlmUnavailableReason;

  constructor(
    message: string,
    readonly status?: number,
    options?: { cause?: unknown; reason?: LlmUnavailableReason },
  ) {
    super(message, options);
    this.name = "LlmUnavailableError";
    this.reason = options?.reason ?? (status === 429 ? "quota" : status === undefined ? "reseau" : "autre");
  }
}

/**
 * Erreur d'appel d'un fournisseur, sans rien de la requête ni de la réponse (elles peuvent contenir des
 * données personnelles) : seulement le fournisseur et le statut HTTP.
 */
export function llmUnavailable(provider: string, status: number | undefined, timedOut = false) {
  if (timedOut) {
    return new LlmUnavailableError(`Appel LLM en échec (${provider}, délai dépassé)`, status, {
      reason: "timeout",
    });
  }
  return new LlmUnavailableError(`Appel LLM en échec (${provider}, ${status ?? "réseau"})`, status);
}

/** Le modèle a décliné la requête (stop_reason « refusal »). */
export class LlmRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`Requête déclinée par le modèle (${category ?? "catégorie inconnue"})`);
    this.name = "LlmRefusalError";
  }
}

/** Sortie absente, tronquée ou non conforme au schéma. */
export class LlmSchemaError extends Error {
  constructor(
    message: string,
    readonly usage?: LlmUsage,
  ) {
    super(message);
    this.name = "LlmSchemaError";
  }
}

/** Budget mensuel du service atteint (ADR 0016, point 6) : coupure automatique, mode dégradé. */
export class LlmBudgetExceededError extends Error {
  constructor(readonly service: string) {
    super(`Budget LLM mensuel atteint pour ${service}`);
    this.name = "LlmBudgetExceededError";
  }
}
