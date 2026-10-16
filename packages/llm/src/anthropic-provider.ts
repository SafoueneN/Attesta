import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import { estimateCostUsd } from "./pricing.js";
import {
  LlmRefusalError,
  LlmSchemaError,
  LlmUnavailableError,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
} from "./provider.js";

/** Surface commune au client Anthropic direct et au client Vertex AI. */
type MessagesClient = { messages: Pick<Anthropic["messages"], "parse"> };

export interface AnthropicProviderOptions {
  model: string;
  timeoutMs: number;
}

/**
 * Fournisseur Claude. Sorties structurées via `messages.parse` + schéma Zod ;
 * pas de paramètre de température (refusé par les modèles actuels) : la
 * stabilité vient du schéma strict, de l'effort et du contrôle de fidélité.
 * Les relances réseau (429, 5xx, coupures) sont faites par le SDK (2 au plus,
 * backoff exponentiel).
 */
export class AnthropicProvider implements LlmProvider {
  readonly kind = "ia" as const;
  readonly model: string;

  constructor(
    private readonly client: MessagesClient,
    private readonly options: AnthropicProviderOptions,
  ) {
    this.model = options.model;
  }

  async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    const started = performance.now();
    let response;
    try {
      response = await this.client.messages.parse(
        {
          model: this.model,
          max_tokens: request.maxTokens,
          system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
          messages: request.messages,
          output_config: { format: zodOutputFormat(request.schema), effort: request.effort },
        },
        { signal: request.signal, timeout: this.options.timeoutMs },
      );
    } catch (error) {
      if (error instanceof Anthropic.APIUserAbortError) throw error;
      if (error instanceof Anthropic.APIError) {
        throw new LlmUnavailableError(`Appel LLM en échec (${error.status ?? "réseau"})`, error.status, {
          cause: error,
        });
      }
      throw error;
    }

    const usage = {
      step: request.step,
      model: this.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd: estimateCostUsd(this.model, response.usage.input_tokens, response.usage.output_tokens),
      latencyMs: Math.round(performance.now() - started),
    };

    if (response.stop_reason === "refusal") {
      throw new LlmRefusalError(response.stop_details?.category ?? null);
    }
    if (response.stop_reason === "max_tokens") {
      throw new LlmSchemaError("Sortie tronquée (max_tokens atteint)", usage);
    }
    if (response.parsed_output == null) {
      throw new LlmSchemaError("Sortie non conforme au schéma", usage);
    }
    return { data: response.parsed_output as T, usage };
  }
}

export interface ClaudeClientConfig {
  provider: "vertex" | "anthropic";
  timeoutMs: number;
  vertexProjectId?: string;
  vertexRegion?: string;
}

/**
 * Vertex AI en région « eu » : traitement dans l'Union européenne (décision Q5).
 * L'API Anthropic directe n'offre pas d'ancrage UE ; elle n'est admise qu'en
 * développement, avec des données fictives (contrôlé par la configuration).
 */
export function createClaudeClient(config: ClaudeClientConfig): MessagesClient {
  if (config.provider === "vertex") {
    return new AnthropicVertex({
      projectId: config.vertexProjectId,
      region: config.vertexRegion ?? "eu",
      timeout: config.timeoutMs,
      maxRetries: 2,
    });
  }
  return new Anthropic({ timeout: config.timeoutMs, maxRetries: 2 });
}
