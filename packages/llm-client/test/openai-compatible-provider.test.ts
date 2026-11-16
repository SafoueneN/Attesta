import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  LlmRefusalError,
  LlmSchemaError,
  LlmUnavailableError,
  OpenAiCompatibleProvider,
  type LlmRequest,
} from "../src/index.js";

/** Réponses enregistrées au format de `chat.completions.create` (champs utilisés uniquement). */
const recorded = (message: Record<string, unknown>, finish_reason = "stop") => ({
  choices: [{ finish_reason, message: { role: "assistant", refusal: null, ...message } }],
  usage: { prompt_tokens: 2000, completion_tokens: 1000 },
});

function providerWith(create: (...args: unknown[]) => Promise<unknown>, name = "groq", free = false) {
  const mock = vi.fn(create);
  const provider = new OpenAiCompatibleProvider({ chat: { completions: { create: mock } } } as never, {
    name,
    model: "openai/gpt-oss-120b",
    timeoutMs: 1000,
    free,
  });
  return { provider, create: mock };
}

const returning = (response: unknown, name?: string, free?: boolean) =>
  providerWith(async () => response, name, free);
const throwing = (error: Error) => providerWith(async () => Promise.reject(error));

const request: LlmRequest<{ title: string }> = {
  step: "analyse-offre",
  system: "prompt système",
  messages: [{ role: "user", content: "<offre>…</offre>" }],
  schema: z.object({ title: z.string() }),
  effort: "low",
  maxTokens: 8000,
  input: {},
};

describe("OpenAiCompatibleProvider (Groq, Ollama)", () => {
  it("demande une sortie au schéma JSON, prompt système en premier message, et la valide", async () => {
    const { provider, create } = returning(recorded({ content: '{"title":"Développeur"}' }));

    const result = await provider.generate(request);

    const [params, options] = create.mock.calls[0] as unknown as [Record<string, unknown>, unknown];
    expect(params).toMatchObject({
      model: "openai/gpt-oss-120b",
      max_tokens: 8000,
      messages: [
        { role: "system", content: "prompt système" },
        { role: "user", content: "<offre>…</offre>" },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "sortie", schema: { type: "object", required: ["title"] } },
      },
    });
    expect(params).not.toHaveProperty("temperature");
    expect(options).toMatchObject({ timeout: 1000 });
    expect(result.data).toEqual({ title: "Développeur" });
    // 2 000 × 0,15 $ + 1 000 × 0,60 $ par million de jetons
    expect(result.usage).toMatchObject({
      model: "openai/gpt-oss-120b",
      inputTokens: 2000,
      outputTokens: 1000,
    });
    expect(result.usage.costUsd).toBeCloseTo(0.0009);
  });

  it("compte un coût nul pour un modèle local (Ollama)", async () => {
    const { provider } = returning(recorded({ content: '{"title":"Développeur"}' }), "ollama", true);
    expect((await provider.generate(request)).usage.costUsd).toBe(0);
  });

  it("rejette une sortie tronquée, non JSON ou hors schéma, sans en recopier le contenu", async () => {
    for (const response of [
      recorded({ content: '{"title":' }, "length"),
      recorded({ content: "Je ne peux pas, Léa Martin" }),
      recorded({ content: '{"titre":"Léa Martin"}' }),
      recorded({ content: null }),
    ]) {
      const error = await returning(response)
        .provider.generate(request)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LlmSchemaError);
      expect((error as LlmSchemaError).usage?.inputTokens).toBe(2000);
      expect((error as Error).message).not.toContain("Léa");
    }
  });

  it("transforme un refus ou un filtrage en erreur dédiée", async () => {
    await expect(
      returning(recorded({ content: null, refusal: "non" })).provider.generate(request),
    ).rejects.toBeInstanceOf(LlmRefusalError);
    await expect(
      returning(recorded({ content: null }, "content_filter")).provider.generate(request),
    ).rejects.toBeInstanceOf(LlmRefusalError);
  });

  it("qualifie le quota atteint, le délai dépassé et la coupure réseau", async () => {
    await expect(
      throwing(new OpenAI.RateLimitError(429, undefined, "quota", new Headers())).provider.generate(request),
    ).rejects.toMatchObject({ status: 429, reason: "quota" });
    await expect(
      throwing(new OpenAI.APIConnectionTimeoutError()).provider.generate(request),
    ).rejects.toMatchObject({ reason: "timeout" });
    const network = await throwing(new OpenAI.APIConnectionError({ message: "coupé" }))
      .provider.generate(request)
      .catch((e: unknown) => e);
    expect(network).toBeInstanceOf(LlmUnavailableError);
    expect(network).toMatchObject({ reason: "reseau" });
    expect((network as Error).message).toContain("groq");
  });

  it("traite le refus de schéma de Groq (400 json_validate_failed) comme une sortie non conforme", async () => {
    const rejected = new OpenAI.BadRequestError(
      400,
      { code: "json_validate_failed", failed_generation: "Léa Martin" },
      "Failed to validate JSON",
      new Headers(),
    );
    const error = await throwing(rejected)
      .provider.generate(request)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmSchemaError);
    expect((error as Error).message).not.toContain("Léa");
    // Une autre erreur 400 reste une indisponibilité.
    await expect(
      throwing(
        new OpenAI.BadRequestError(400, { code: "autre" }, "invalide", new Headers()),
      ).provider.generate(request),
    ).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it("signale indisponible une réponse qui n'est pas une complétion, sans planter", async () => {
    await expect(returning("OK").provider.generate(request)).rejects.toMatchObject({ reason: "autre" });
  });

  it("laisse passer l'annulation par l'appelant", async () => {
    await expect(throwing(new OpenAI.APIUserAbortError()).provider.generate(request)).rejects.toBeInstanceOf(
      OpenAI.APIUserAbortError,
    );
  });
});
