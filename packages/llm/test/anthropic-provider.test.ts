import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AnthropicProvider,
  LlmRefusalError,
  LlmSchemaError,
  LlmUnavailableError,
  type LlmRequest,
} from "../src/index.js";

/** Réponses enregistrées au format de `messages.parse` (champs utilisés uniquement). */
const recorded = (overrides: Record<string, unknown>) => ({
  stop_reason: "end_turn",
  stop_details: null,
  usage: { input_tokens: 2000, output_tokens: 1000 },
  parsed_output: { title: "Développeur" },
  ...overrides,
});

function providerReturning(response: unknown) {
  const parse = vi.fn(async () => response);
  const provider = new AnthropicProvider({ messages: { parse } } as never, {
    model: "claude-opus-5-5",
    timeoutMs: 1000,
  });
  return { provider, parse };
}

const request: LlmRequest<{ title: string }> = {
  step: "analyse-offre",
  system: "prompt système",
  messages: [{ role: "user", content: "<offre>…</offre>" }],
  schema: z.object({ title: z.string() }),
  effort: "low",
  maxTokens: 8000,
  input: {},
};

describe("AnthropicProvider (contrat)", () => {
  it("demande une sortie structurée, met le prompt système en cache, sans température", async () => {
    const { provider, parse } = providerReturning(recorded({}));

    const result = await provider.generate(request);

    const [params] = parse.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      system: [{ type: "text", text: "prompt système", cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low" },
    });
    expect(params).not.toHaveProperty("temperature");
    expect(result.data).toEqual({ title: "Développeur" });
    // 2 000 × 4 $ + 1 000 × 20 $ par million de jetons
    expect(result.usage.costUsd).toBeCloseTo(0.028);
  });

  it("transforme un refus du modèle en erreur dédiée", async () => {
    const { provider } = providerReturning(
      recorded({
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "cyber" },
        parsed_output: null,
      }),
    );
    await expect(provider.generate(request)).rejects.toBeInstanceOf(LlmRefusalError);
  });

  it("rejette une sortie tronquée ou non conforme", async () => {
    await expect(
      providerReturning(recorded({ stop_reason: "max_tokens" })).provider.generate(request),
    ).rejects.toBeInstanceOf(LlmSchemaError);
    await expect(
      providerReturning(recorded({ parsed_output: null })).provider.generate(request),
    ).rejects.toBeInstanceOf(LlmSchemaError);
  });

  it("signale le fournisseur indisponible après les relances du SDK", async () => {
    const parse = vi.fn(async () => {
      throw new Anthropic.APIConnectionError({ message: "connexion impossible" });
    });
    const provider = new AnthropicProvider({ messages: { parse } } as never, {
      model: "claude-opus-5-5",
      timeoutMs: 1000,
    });

    await expect(provider.generate(request)).rejects.toBeInstanceOf(LlmUnavailableError);
  });
});
