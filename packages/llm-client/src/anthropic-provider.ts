import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import { DemoProvider } from "./demo-provider.js";
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
    const model = this.options.stepModels?.[request.step] ?? this.model;
    let response;
    try {
      response = await this.client.messages.parse(
        {
          model,
          max_tokens: request.maxTokens,
          system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
          messages: request.messages,
          output_config: { format: zodOutputFormat(request.schema), effort: request.effort },
        },
        { signal: request.signal, timeout: this.options.timeoutMs },
      );
    } catch (error) {
      if (error instanceof Anthropic.APIUserAbortError) throw error;
      if (error instanceof Anthropic.APIConnectionTimeoutError) {
        throw new LlmUnavailableError("Appel LLM en échec (délai dépassé)", undefined, { reason: "timeout" });
      }
      if (error instanceof Anthropic.APIError) {
        throw new LlmUnavailableError(`Appel LLM en échec (${error.status ?? "réseau"})`, error.status);
      }
      // Sortie tronquée, texte libre au lieu de JSON, JSON hors schéma : `parse`
      // lève une erreur dont le message cite la sortie du modèle. On ne la propage
      // pas (elle pourrait contenir des données personnelles) : relance ou mode dégradé.
      if (
        error instanceof Anthropic.AnthropicError ||
        error instanceof SyntaxError ||
        (error instanceof Error && error.name === "ZodError")
      ) {
        throw new LlmSchemaError("Sortie du modèle non analysable");
      }
      throw error;
    }

    const usage = {
      step: request.step,
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd: estimateCostUsd(model, response.usage.input_tokens, response.usage.output_tokens),
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
  /** Relances du SDK (429, 5xx, coupures) ; 0 quand un fournisseur de repli prend le relais. */
  maxRetries?: number;
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
      maxRetries: config.maxRetries ?? 2,
    });
  }
  return new Anthropic({ timeout: config.timeoutMs, maxRetries: config.maxRetries ?? 2 });
}

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
export function parseStepModels(value: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (value ?? "").split(",")) {
    const [step, model] = pair.split("=").map((p) => p.trim());
    if (step && model && /^[a-z0-9-]+$/.test(step) && /^[w.@-]+$/.test(model)) out[step] = model;
  }
  return out;
}

/**
 * Fournisseur configuré d'un service ; « none » : aucun. En démonstration, `demo` donne les réponses
 * recopiées propres au service, étape par étape.
 */
export function createLlmProvider(
  settings: ProviderSettings,
  demo: ConstructorParameters<typeof DemoProvider>[0] = {},
): LlmProvider | undefined {
  switch (settings.provider) {
    case "none":
      return undefined;
    case "demo":
      return new DemoProvider(demo);
    default:
      return new AnthropicProvider(
        createClaudeClient({
          provider: settings.provider,
          timeoutMs: settings.timeoutMs,
          vertexProjectId: settings.vertexProjectId,
          vertexRegion: settings.vertexRegion,
        }),
        { model: settings.model, timeoutMs: settings.timeoutMs, stepModels: settings.stepModels },
      );
  }
}
