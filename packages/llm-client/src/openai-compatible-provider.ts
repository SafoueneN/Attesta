import OpenAI from "openai";
import { estimateCostUsd } from "./pricing.js";
import {
  LlmRefusalError,
  LlmSchemaError,
  llmUnavailable,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
} from "./provider.js";
import { jsonSchemaOf, parseStructuredOutput } from "./structured-output.js";

/** Surface du SDK OpenAI utilisée : Groq et Ollama exposent la même API sous une autre `baseURL`. */
type ChatClient = { chat: { completions: Pick<OpenAI["chat"]["completions"], "create"> } };

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
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly kind = "ia" as const;
  readonly model: string;

  constructor(
    private readonly client: ChatClient,
    private readonly options: OpenAiCompatibleOptions,
  ) {
    this.model = options.model;
  }

  async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    const started = performance.now();
    let response: OpenAI.Chat.ChatCompletion;
    try {
      response = await this.client.chat.completions.create(
        {
          model: this.model,
          // `max_tokens` plutôt que `max_completion_tokens` : seul nom accepté par Groq et Ollama.
          max_tokens: request.maxTokens,
          messages: [{ role: "system", content: request.system }, ...request.messages],
          response_format: {
            type: "json_schema",
            json_schema: { name: "sortie", schema: jsonSchemaOf(request.schema) },
          },
        },
        { signal: request.signal, timeout: this.options.timeoutMs },
      );
    } catch (error) {
      if (error instanceof OpenAI.APIUserAbortError) throw error;
      if (error instanceof OpenAI.APIError) {
        throw llmUnavailable(
          this.options.name,
          error.status,
          error instanceof OpenAI.APIConnectionTimeoutError,
        );
      }
      throw error;
    }

    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const usage = {
      step: request.step,
      model: this.model,
      inputTokens,
      outputTokens,
      costUsd: this.options.free ? 0 : estimateCostUsd(this.model, inputTokens, outputTokens),
      latencyMs: Math.round(performance.now() - started),
    };

    const choice = response.choices[0];
    if (choice?.message.refusal) throw new LlmRefusalError(null);
    if (choice?.finish_reason === "content_filter") throw new LlmRefusalError("content_filter");
    if (choice?.finish_reason === "length") {
      throw new LlmSchemaError("Sortie tronquée (max_tokens atteint)", usage);
    }
    return { data: parseStructuredOutput(request.schema, choice?.message.content, usage), usage };
  }
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
export function createOpenAiCompatibleClient(config: OpenAiCompatibleClientConfig): ChatClient {
  return new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey ?? "ollama",
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries ?? 2,
  });
}
