import type { z } from "zod";

export type LlmStep = "analyse-offre" | "redaction" | "extraction-cv";
export type Effort = "low" | "medium" | "high";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest<T> {
  step: LlmStep;
  /** Prompt système versionné (prompts/<étape>/vN.md). */
  system: string;
  messages: LlmMessage[];
  /** Schéma de la sortie structurée attendue du modèle. */
  schema: z.ZodType<T>;
  effort: Effort;
  maxTokens: number;
  /**
   * Données structurées à partir desquelles les messages ont été rendus. Ignorées
   * par les fournisseurs réels ; utilisées par les fournisseurs de démo et de test.
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

/** Fournisseur injoignable, quota du fournisseur atteint, délai dépassé : mode dégradé. */
export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "LlmUnavailableError";
  }
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
