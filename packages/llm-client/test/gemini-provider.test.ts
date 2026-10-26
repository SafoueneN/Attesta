import { ApiError, FinishReason } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  GeminiProvider,
  LlmRefusalError,
  LlmSchemaError,
  LlmUnavailableError,
  type LlmRequest,
} from "../src/index.js";

/** Réponses enregistrées au format de `models.generateContent` (champs utilisés uniquement). */
const recorded = (overrides: Record<string, unknown> = {}, finishReason: string = FinishReason.STOP) => ({
  text: '{"title":"Développeur"}',
  candidates: [{ finishReason }],
  usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 800, thoughtsTokenCount: 200 },
  ...overrides,
});

function providerWith(generateContent: (params: never) => Promise<unknown>, timeoutMs = 1000) {
  const mock = vi.fn(generateContent);
  const provider = new GeminiProvider({ models: { generateContent: mock } } as never, {
    model: "gemini-2.5-flash",
    timeoutMs,
  });
  return { provider, generateContent: mock };
}

const returning = (response: unknown) => providerWith(async () => response);
const throwing = (error: Error) => providerWith(async () => Promise.reject(error));

const request: LlmRequest<{ title: string }> = {
  step: "analyse-offre",
  system: "prompt système",
  messages: [
    { role: "user", content: "<offre>…</offre>" },
    { role: "assistant", content: "{}" },
  ],
  schema: z.object({ title: z.string() }),
  effort: "low",
  maxTokens: 8000,
  input: {},
};

describe("GeminiProvider", () => {
  it("demande une sortie JSON au schéma, prompt système à part, et la valide", async () => {
    const { provider, generateContent } = returning(recorded());

    const result = await provider.generate(request);

    const [params] = generateContent.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params).toMatchObject({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: "<offre>…</offre>" }] },
        { role: "model", parts: [{ text: "{}" }] },
      ],
      config: {
        systemInstruction: "prompt système",
        maxOutputTokens: 8000,
        responseMimeType: "application/json",
        responseJsonSchema: { type: "object", required: ["title"] },
      },
    });
    expect(result.data).toEqual({ title: "Développeur" });
    // Réflexion comptée en sortie : 2 000 × 0,30 $ + 1 000 × 2,50 $ par million de jetons
    expect(result.usage).toMatchObject({ inputTokens: 2000, outputTokens: 1000 });
    expect(result.usage.costUsd).toBeCloseTo(0.0031);
  });

  it("rejette une sortie tronquée, non JSON ou hors schéma, sans en recopier le contenu", async () => {
    for (const response of [
      recorded({}, FinishReason.MAX_TOKENS),
      recorded({ text: "Je ne peux pas, Léa Martin" }),
      recorded({ text: '{"titre":"Léa Martin"}' }),
      recorded({ text: undefined }),
    ]) {
      const error = await returning(response)
        .provider.generate(request)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LlmSchemaError);
      expect((error as Error).message).not.toContain("Léa");
    }
  });

  it("transforme un blocage de la requête ou de la réponse en refus", async () => {
    await expect(
      returning(recorded({ promptFeedback: { blockReason: "SAFETY" }, candidates: [] })).provider.generate(
        request,
      ),
    ).rejects.toBeInstanceOf(LlmRefusalError);
    await expect(
      returning(recorded({}, FinishReason.SAFETY)).provider.generate(request),
    ).rejects.toMatchObject({
      category: "SAFETY",
    });
  });

  it("qualifie le quota atteint et la coupure réseau", async () => {
    await expect(
      throwing(new ApiError({ message: "quota", status: 429 })).provider.generate(request),
    ).rejects.toMatchObject({ status: 429, reason: "quota" });
    const network = await throwing(new TypeError("fetch failed"))
      .provider.generate(request)
      .catch((e: unknown) => e);
    expect(network).toBeInstanceOf(LlmUnavailableError);
    expect(network).toMatchObject({ reason: "reseau" });
  });

  it("applique son délai et le distingue d'une annulation par l'appelant", async () => {
    const hanging = (params: { config: { abortSignal: AbortSignal } }) =>
      new Promise((_, reject) =>
        params.config.abortSignal.addEventListener("abort", () => reject(new Error("abort"))),
      );

    const timedOut = providerWith(hanging as never, 20).provider;
    await expect(timedOut.generate(request)).rejects.toMatchObject({ reason: "timeout" });

    const controller = new AbortController();
    const pending = providerWith(hanging as never, 10_000).provider.generate({
      ...request,
      signal: controller.signal,
    });
    controller.abort();
    const error = await pending.catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(LlmUnavailableError);
  });
});
