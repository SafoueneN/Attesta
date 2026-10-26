import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";
import { estimateCostUsd } from "./pricing.js";
import { LlmRefusalError, LlmSchemaError, llmUnavailable, } from "./provider.js";
import { jsonSchemaOf, parseStructuredOutput } from "./structured-output.js";
/** Fins de génération qui signifient un blocage par les filtres du modèle. */
const BLOCKED = new Set([
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
export class GeminiProvider {
    client;
    options;
    kind = "ia";
    model;
    constructor(client, options) {
        this.client = client;
        this.options = options;
        this.model = options.model;
    }
    async generate(request) {
        const started = performance.now();
        const timeout = AbortSignal.timeout(this.options.timeoutMs);
        let response;
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
        }
        catch (error) {
            if (request.signal?.aborted)
                throw error;
            if (timeout.aborted)
                throw llmUnavailable("gemini", undefined, true);
            if (error instanceof ApiError)
                throw llmUnavailable("gemini", error.status);
            // `fetch` lève une TypeError quand le réseau est coupé.
            if (error instanceof TypeError)
                throw llmUnavailable("gemini", undefined);
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
        if (finish && BLOCKED.has(finish))
            throw new LlmRefusalError(finish);
        if (finish === FinishReason.MAX_TOKENS) {
            throw new LlmSchemaError("Sortie tronquée (max_tokens atteint)", usage);
        }
        return { data: parseStructuredOutput(request.schema, response.text, usage), usage };
    }
}
/** `maxRetries` : relances du SDK ; 0 quand un fournisseur de repli prend le relais. */
export function createGeminiClient(config) {
    return new GoogleGenAI({
        apiKey: config.apiKey,
        httpOptions: { retryOptions: { attempts: (config.maxRetries ?? 2) + 1 } },
    });
}
