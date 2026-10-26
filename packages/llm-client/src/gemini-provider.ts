import { ApiError, FinishReason, GoogleGenAI, type GenerateContentResponse } from "@google/genai";
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

/** Surface du SDK Google Gen AI utilisée. */
type ModelsClient = { models: Pick<GoogleGenAI["models"], "generateContent"> };

export interface GeminiProviderOptions {
  model: string;
  timeoutMs: number;
}

/** Fins de génération qui signifient un blocage par les filtres du modèle. */
const BLOCKED: ReadonlySet<string> = new Set([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

/**
 * Fournisseur Gemini (SDK officiel `@google/genai`). Sortie structurée demandée par `responseJsonSchema`
 * puis revalidée par le schéma Zod. Le délai est appliqué par un signal d'annulation propre, pour
 * distinguer un délai dépassé (fournisseur suivant) d'une annulation par l'appelant.
 */
export class GeminiProvider implements LlmProvider {
  readonly kind = "ia" as const;
  readonly model: string;

  constructor(
    private readonly client: ModelsClient,
    private readonly options: GeminiProviderOptions,
  ) {
    this.model = options.model;
  }

  async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    const started = performance.now();
    const timeout = AbortSignal.timeout(this.options.timeoutMs);
    let response: GenerateContentResponse;
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents: request.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        config: {
          systemInstruction: request.system,
          maxOutputTokens: request.maxTokens,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchemaOf(request.schema),
          abortSignal: request.signal ? AbortSignal.any([request.signal, timeout]) : timeout,
        },
      });
    } catch (error) {
      if (request.signal?.aborted) throw error;
      if (timeout.aborted) throw llmUnavailable("gemini", undefined, true);
      if (error instanceof ApiError) throw llmUnavailable("gemini", error.status);
      // `fetch` lève une TypeError quand le réseau est coupé.
      if (error instanceof TypeError) throw llmUnavailable("gemini", undefined);
      throw error;
    }

    const meta = response.usageMetadata;
    const inputTokens = meta?.promptTokenCount ?? 0;
    // Les jetons de réflexion sont facturés comme des jetons de sortie.
    const outputTokens = (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0);
    const usage = {
      step: request.step,
      model: this.model,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(this.model, inputTokens, outputTokens),
      latencyMs: Math.round(performance.now() - started),
    };

    if (response.promptFeedback?.blockReason) {
      throw new LlmRefusalError(String(response.promptFeedback.blockReason));
    }
    const finish = response.candidates?.[0]?.finishReason;
    if (finish && BLOCKED.has(finish)) throw new LlmRefusalError(finish);
    if (finish === FinishReason.MAX_TOKENS) {
      throw new LlmSchemaError("Sortie tronquée (max_tokens atteint)", usage);
    }
    return { data: parseStructuredOutput(request.schema, response.text, usage), usage };
  }
}

/** `maxRetries` : relances du SDK ; 0 quand un fournisseur de repli prend le relais. */
export function createGeminiClient(config: { apiKey?: string; maxRetries?: number }): ModelsClient {
  return new GoogleGenAI({
    apiKey: config.apiKey,
    httpOptions: { retryOptions: { attempts: (config.maxRetries ?? 2) + 1 } },
  });
}
