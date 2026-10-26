import { GoogleGenAI } from "@google/genai";
import { type LlmProvider, type LlmRequest, type LlmResult } from "./provider.js";
/** Surface du SDK Google Gen AI utilisée. */
type ModelsClient = {
    models: Pick<GoogleGenAI["models"], "generateContent">;
};
export interface GeminiProviderOptions {
    model: string;
    timeoutMs: number;
}
/**
 * Fournisseur Gemini (SDK officiel `@google/genai`). Sortie structurée demandée par `responseJsonSchema`
 * puis revalidée par le schéma Zod. Le délai est appliqué par un signal d'annulation propre, pour
 * distinguer un délai dépassé (fournisseur suivant) d'une annulation par l'appelant.
 */
export declare class GeminiProvider implements LlmProvider {
    private readonly client;
    private readonly options;
    readonly kind: "ia";
    readonly model: string;
    constructor(client: ModelsClient, options: GeminiProviderOptions);
    generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
}
/** `maxRetries` : relances du SDK ; 0 quand un fournisseur de repli prend le relais. */
export declare function createGeminiClient(config: {
    apiKey?: string;
    maxRetries?: number;
}): ModelsClient;
export {};
