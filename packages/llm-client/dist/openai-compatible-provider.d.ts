import OpenAI from "openai";
import { type LlmProvider, type LlmRequest, type LlmResult } from "./provider.js";
/** Surface du SDK OpenAI utilisée : Groq et Ollama exposent la même API sous une autre `baseURL`. */
type ChatClient = {
    chat: {
        completions: Pick<OpenAI["chat"]["completions"], "create">;
    };
};
export interface OpenAiCompatibleOptions {
    /** Nom du fournisseur, pour les messages d'erreur : « groq », « ollama ». */
    name: string;
    model: string;
    timeoutMs: number;
    /** Modèle local (Ollama) : coût nul, hors budget. */
    free?: boolean;
}
/**
 * Fournisseur à API compatible OpenAI (Groq, Ollama). Sortie structurée demandée par
 * `response_format: json_schema` puis revalidée par le schéma Zod. L'effort n'est pas transmis : seuls
 * certains modèles l'acceptent, les autres refusent la requête.
 */
export declare class OpenAiCompatibleProvider implements LlmProvider {
    private readonly client;
    private readonly options;
    readonly kind: "ia";
    readonly model: string;
    constructor(client: ChatClient, options: OpenAiCompatibleOptions);
    generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
}
export interface OpenAiCompatibleClientConfig {
    baseURL: string;
    /** Ollama n'en demande pas ; le SDK en exige une, d'où une valeur factice. */
    apiKey?: string;
    timeoutMs: number;
    /** Relances du SDK (429, 5xx, coupures) ; 0 quand un fournisseur de repli prend le relais. */
    maxRetries?: number;
}
/** Client Groq (`https://api.groq.com/openai/v1`) ou Ollama (`http://ollama:11434/v1`). */
export declare function createOpenAiCompatibleClient(config: OpenAiCompatibleClientConfig): ChatClient;
export {};
