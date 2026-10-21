import {
  DemoProvider,
  LlmBudgetExceededError,
  LlmRefusalError,
  LlmSchemaError,
  LlmUnavailableError,
  ScriptedProvider,
} from "@attesta/llm-client";
import { describe, expect, it } from "vitest";
import { demoHandlers, generateTailoredCv, type ProgressEvent } from "../src/pipeline.js";
import { analysis, honestDraft, inventedDraft, lea, offerText } from "./fixtures.js";

const input = { profile: lea, offerText, analysis };
const deps = (provider: ScriptedProvider | DemoProvider, maxCostUsd = 1) => ({ provider, maxCostUsd });

describe("pipeline de génération", () => {
  it("rédige, contrôle et signale les mots-clés absents", async () => {
    const provider = new ScriptedProvider({ redaction: [{ data: honestDraft }] });
    const events: ProgressEvent[] = [];

    const result = await generateTailoredCv(deps(provider), input, { onProgress: (e) => events.push(e) });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.report.score).toBe(1);
    expect(result.cv.missingKeywords).toEqual(["Kubernetes"]);
    expect(result.usage.map((u) => u.step)).toEqual(["redaction"]);
    expect(result.pipelineVersion).toBe("redaction@v1");
    expect(events.map((e) => `${e.stage}:${e.status}`)).toEqual([
      "analyse:done",
      "redaction:start",
      "controle:done",
    ]);
  });

  it("n'envoie au modèle ni identité, ni coordonnées, ni employeurs", async () => {
    const provider = new ScriptedProvider({ redaction: [{ data: honestDraft }] });

    await generateTailoredCv(deps(provider), input);

    const sent = JSON.stringify(provider.requests.map((r) => [r.system, r.messages]));
    for (const secret of [
      "Léa Martin",
      "lea.martin@example.org",
      "+33 6",
      'Lyon",\n  "countryCode',
      "Transports Rhône",
      "INSA",
    ]) {
      expect(sent).not.toContain(secret);
    }
  });

  it("retire les inventions avant qu'elles n'atteignent le CV", async () => {
    const provider = new ScriptedProvider({ redaction: [{ data: inventedDraft }] });

    const result = await generateTailoredCv(deps(provider), input);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.removed).toHaveLength(4);
    const exported = JSON.stringify(result.cv);
    expect(exported).not.toContain("Kubernetes avec");
    expect(exported).not.toContain("60 %");
    expect(exported).not.toContain("AWS");
  });

  it("relance avec la liste des écarts quand la sortie viole le contrat, puis réussit", async () => {
    const broken = { ...honestDraft, work: [{ ref: "work/0", highlights: [] }] };
    const provider = new ScriptedProvider({ redaction: [{ data: broken }, { data: honestDraft }] });

    const result = await generateTailoredCv(deps(provider), input);

    expect(result.status).toBe("ok");
    const retry = provider.requests[1]!;
    expect(retry.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(retry.messages[2]!.content).toContain("Référence attendue : /work/<index>");
  });

  it("passe en mode dégradé après deux relances infructueuses", async () => {
    const broken = { ...honestDraft, work: [{ ref: "work/0", highlights: [] }] };
    const provider = new ScriptedProvider({
      redaction: [{ data: broken }, { data: broken }, { data: broken }],
    });

    const result = await generateTailoredCv(deps(provider), input);

    expect(result).toMatchObject({ status: "degraded", reason: "non-conforme" });
    expect(provider.requests).toHaveLength(3);
  });

  it.each([
    [new LlmUnavailableError("503", 503), "indisponible"],
    [new LlmRefusalError(null), "refus"],
    [new LlmSchemaError("tronqué"), "non-conforme"],
    [new LlmBudgetExceededError("cv-generation"), "budget"],
  ])("passe en mode dégradé sur %s", async (error, reason) => {
    const provider = new ScriptedProvider({ redaction: [{ error }, { error }, { error }] });

    const result = await generateTailoredCv(deps(provider), input);

    expect(result).toMatchObject({ status: "degraded", reason });
  });

  it("n'engage aucune relance au-delà du budget par CV", async () => {
    const broken = { ...honestDraft, work: [{ ref: "work/0", highlights: [] }] };
    const provider = new ScriptedProvider({ redaction: [{ data: broken }, { data: honestDraft }] });

    const result = await generateTailoredCv(deps(provider, 0.01), input);

    expect(result).toMatchObject({ status: "degraded", reason: "budget" });
    expect(provider.requests).toHaveLength(1);
  });

  it("propage une erreur inattendue (ni panne ni contrat)", async () => {
    const provider = new ScriptedProvider({ redaction: [{ error: new TypeError("bogue") }] });
    await expect(generateTailoredCv(deps(provider), input)).rejects.toThrow("bogue");
  });

  it("fonctionne de bout en bout avec le fournisseur de démonstration, sans invention", async () => {
    const result = await generateTailoredCv(deps(new DemoProvider(demoHandlers)), input);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.providerKind).toBe("demo");
    expect(result.report.score).toBe(1);
    expect(result.cv.missingKeywords).toContain("Kubernetes");
    // Les faits les plus proches de l'offre viennent en tête.
    expect(result.cv.work[0]!.highlights[0]!.text).toContain("Node.js");
  });
});
