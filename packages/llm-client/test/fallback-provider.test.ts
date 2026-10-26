import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  FallbackProvider,
  LlmRefusalError,
  LlmSchemaError,
  LlmUnavailableError,
  ScriptedProvider,
  type FallbackEvent,
  type LlmRequest,
} from "../src/index.js";

const request = (signal?: AbortSignal): LlmRequest<{ title: string }> => ({
  step: "analyse-offre",
  system: "prompt système",
  messages: [{ role: "user", content: "<offre>…</offre>" }],
  schema: z.object({ title: z.string() }),
  effort: "low",
  maxTokens: 8000,
  input: {},
  signal,
});

const ok = { data: { title: "Développeur" } };
const quota = { error: new LlmUnavailableError("Appel LLM en échec (429)", 429) };
const timeout = { error: new LlmUnavailableError("délai", undefined, { reason: "timeout" }) };

function chain(...scripts: { error: Error }[][]) {
  const providers = [
    ...scripts.map((replies, i) => new ScriptedProvider({ "analyse-offre": replies }, `modele-${i}`)),
    new ScriptedProvider({ "analyse-offre": [ok] }, "dernier"),
  ];
  const events: FallbackEvent[] = [];
  return { fallback: new FallbackProvider(providers, (e) => events.push(e)), providers, events };
}

describe("FallbackProvider", () => {
  it("passe au fournisseur suivant sur quota atteint puis sur délai dépassé", async () => {
    const { fallback, providers, events } = chain([quota], [timeout]);

    const result = await fallback.generate(request());

    expect(result.data).toEqual({ title: "Développeur" });
    expect(result.usage.model).toBe("dernier");
    expect(providers.map((p) => p.requests.length)).toEqual([1, 1, 1]);
    expect(events).toEqual([
      { from: "modele-0", to: "modele-1", reason: "quota" },
      { from: "modele-1", to: "dernier", reason: "timeout" },
    ]);
  });

  it("ne bascule pas sur un refus, une sortie non conforme ou une autre panne", async () => {
    for (const error of [
      new LlmRefusalError("cyber"),
      new LlmSchemaError("Sortie non conforme au schéma"),
      new LlmUnavailableError("Appel LLM en échec (500)", 500),
      new LlmUnavailableError("Appel LLM en échec (réseau)"),
    ]) {
      const { fallback, providers } = chain([{ error }]);
      await expect(fallback.generate(request())).rejects.toBe(error);
      expect(providers[1]!.requests).toHaveLength(0);
    }
  });

  it("ne bascule pas après une annulation par l'appelant", async () => {
    const controller = new AbortController();
    controller.abort();
    const { fallback, providers } = chain([timeout]);

    await expect(fallback.generate(request(controller.signal))).rejects.toBe(timeout.error);
    expect(providers[1]!.requests).toHaveLength(0);
  });

  it("propage l'erreur du dernier fournisseur quand toute la chaîne échoue", async () => {
    const last = new LlmUnavailableError("Appel LLM en échec (429)", 429);
    const fallback = new FallbackProvider([
      new ScriptedProvider({ "analyse-offre": [quota] }),
      new ScriptedProvider({ "analyse-offre": [{ error: last }] }),
    ]);

    await expect(fallback.generate(request())).rejects.toBe(last);
  });

  it("prend le modèle et la nature du premier fournisseur, et en exige au moins un", () => {
    const { fallback } = chain([quota]);
    expect(fallback.model).toBe("modele-0");
    expect(fallback.kind).toBe("ia");
    expect(() => new FallbackProvider([])).toThrow();
  });
});
