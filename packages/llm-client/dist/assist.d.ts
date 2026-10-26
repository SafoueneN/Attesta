import type { z } from "zod";
import { type Effort, type LlmProvider } from "./provider.js";
/**
 * Appel structuré d'un assistant (ADR 0028) : données balisées, sortie validée par schéma, relances bornées
 * si la sortie est non conforme. Toute panne du fournisseur devient une `AssistUnavailableError`, que le
 * service traduit en réponse « indisponible » ; aucune sortie non validée n'est jamais renvoyée.
 * Plomberie commune seulement : le prompt, les données et la vérification restent dans chaque service.
 */
export declare class AssistUnavailableError extends Error {
    readonly reason: "indisponible" | "refus" | "budget" | "non-conforme";
    constructor(reason: "indisponible" | "refus" | "budget" | "non-conforme", options?: {
        cause?: unknown;
    });
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
export declare function assist<T>(request: AssistRequest<T>): Promise<{
    data: T;
    kind: LlmProvider["kind"];
}>;
