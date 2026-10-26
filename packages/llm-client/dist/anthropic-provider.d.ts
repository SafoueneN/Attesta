import Anthropic from "@anthropic-ai/sdk";
import { DemoProvider } from "./demo-provider.js";
import { type LlmProvider, type LlmRequest, type LlmResult } from "./provider.js";
/** Surface commune au client Anthropic direct et au client Vertex AI. */
type MessagesClient = {
    messages: Pick<Anthropic["messages"], "parse">;
};
export interface AnthropicProviderOptions {
    model: string;
    timeoutMs: number;
    /** Modèle propre à une étape (ADR 0029, point 3) ; à défaut, `model`. */
    stepModels?: Record<string, string>;
}
/**
 * Fournisseur Claude. Sorties structurées via `messages.parse` + schéma Zod ;
 * pas de paramètre de température (refusé par les modèles actuels) : la
 * stabilité vient du schéma strict, de l'effort et du contrôle de fidélité.
 * Les relances réseau (429, 5xx, coupures) sont faites par le SDK (2 au plus,
 * backoff exponentiel).
 */
export declare class AnthropicProvider implements LlmProvider {
    private readonly client;
    private readonly options;
    readonly kind: "ia";
    readonly model: string;
    constructor(client: MessagesClient, options: AnthropicProviderOptions);
    generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
}
export interface ClaudeClientConfig {
    provider: "vertex" | "anthropic";
    timeoutMs: number;
    vertexProjectId?: string;
    vertexRegion?: string;
    /** Relances du SDK (429, 5xx, coupures) ; 0 quand un fournisseur de repli prend le relais. */
    maxRetries?: number;
}
/**
 * Vertex AI en région « eu » : traitement dans l'Union européenne (décision Q5).
 * L'API Anthropic directe n'offre pas d'ancrage UE ; elle n'est admise qu'en
 * développement, avec des données fictives (contrôlé par la configuration).
 */
export declare function createClaudeClient(config: ClaudeClientConfig): MessagesClient;
export interface ProviderSettings {
    provider: "vertex" | "anthropic" | "demo" | "none";
    model: string;
    timeoutMs: number;
    vertexProjectId?: string;
    vertexRegion?: string;
    /** Surcharges par étape : `{ "traduction": "claude-haiku-5-5" }`. */
    stepModels?: Record<string, string>;
}
/**
 * Lit `LLM_STEP_MODELS` (« etape=modele,etape=modele ») ; entrées mal formées ignorées.
 */
export declare function parseStepModels(value: string | undefined): Record<string, string>;
/**
 * Fournisseur configuré d'un service ; « none » : aucun. En démonstration, `demo` donne les réponses
 * recopiées propres au service, étape par étape.
 */
export declare function createLlmProvider(settings: ProviderSettings, demo?: ConstructorParameters<typeof DemoProvider>[0]): LlmProvider | undefined;
export {};
