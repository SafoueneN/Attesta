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
export declare class LlmUnavailableError extends Error {
    readonly status?: number | undefined;
    readonly reason: LlmUnavailableReason;
    constructor(message: string, status?: number | undefined, options?: {
        cause?: unknown;
        reason?: LlmUnavailableReason;
    });
}
/**
 * Erreur d'appel d'un fournisseur, sans rien de la requête ni de la réponse (elles peuvent contenir des
 * données personnelles) : seulement le fournisseur et le statut HTTP.
 */
export declare function llmUnavailable(provider: string, status: number | undefined, timedOut?: boolean): LlmUnavailableError;
/** Le modèle a décliné la requête (stop_reason « refusal »). */
export declare class LlmRefusalError extends Error {
    readonly category: string | null;
    constructor(category: string | null);
}
/** Sortie absente, tronquée ou non conforme au schéma. */
export declare class LlmSchemaError extends Error {
    readonly usage?: LlmUsage | undefined;
    constructor(message: string, usage?: LlmUsage | undefined);
}
/** Budget mensuel du service atteint (ADR 0016, point 6) : coupure automatique, mode dégradé. */
export declare class LlmBudgetExceededError extends Error {
    readonly service: string;
    constructor(service: string);
}
