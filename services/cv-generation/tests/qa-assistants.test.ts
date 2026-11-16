import {
  AssistUnavailableError,
  DemoProvider,
  LlmBudgetExceededError,
  LlmRefusalError,
  LlmSchemaError,
  LlmUnavailableError,
  ScriptedProvider,
} from "@attesta/llm-client";
import { beforeAll, describe, expect, it } from "vitest";
import { assistantDemoHandlers, judgeFidelity, type GenerationSnapshot } from "../src/assistants.js";
import { generateTailoredCv } from "../src/pipeline.js";
import { analysis, honestDraft, lea, offerText } from "./fixtures.js";

/*
 * Campagne QA (A-06) : juge de fidélité du Studio IA avec un fournisseur scripté. Réponse valide (verdicts
 * hors CV écartés, reformulation gardée seulement si elle passe le contrôle de fidélité), sortie non
 * conforme, panne, délai dépassé, refus et budget atteint.
 */

let snapshot: GenerationSnapshot;
let paths: string[];

beforeAll(async () => {
  const result = await generateTailoredCv(
    { provider: new ScriptedProvider({ redaction: [{ data: honestDraft }] }), maxCostUsd: 1 },
    { profile: lea, offerText, analysis },
  );
  if (result.status !== "ok") throw new Error("génération de référence impossible");
  snapshot = { profile: lea, cv: result.cv, analysis, offerTitle: analysis.title, offerText };
  const probe = new ScriptedProvider({ "juge-fidelite": [{ data: { verdicts: [] } }] });
  await judgeFidelity(probe, snapshot);
  paths = (probe.requests[0]!.input as { lignes: { path: string; text: string }[] }).lignes.map(
    (l) => l.path,
  );
});

const textOf = (path: string) =>
  path
    .split("/")
    .slice(1)
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], snapshot.cv) as {
    text: string;
  };

describe("judgeFidelity (campagne QA)", () => {
  it("transmet chaque ligne du CV avec le texte de ses sources", async () => {
    const probe = new ScriptedProvider({ "juge-fidelite": [{ data: { verdicts: [] } }] });
    await judgeFidelity(probe, snapshot);
    const lignes = (
      probe.requests[0]!.input as { lignes: { sources: { pointer: string; text: string }[] }[] }
    ).lignes;
    expect(lignes.length).toBeGreaterThan(0);
    expect(lignes.every((l) => l.sources.every((s) => s.text.length > 0))).toBe(true);
  });

  it("écarte les verdicts sur une ligne inconnue et ne propose jamais de reformulation pour une ligne fidèle", async () => {
    const llm = new ScriptedProvider({
      "juge-fidelite": [
        {
          data: {
            verdicts: [
              { path: paths[0]!, verdict: "fidele", explanation: "ok", suggestion: "Autre texte" },
              { path: "/work/9/highlights/0", verdict: "infidele", explanation: "inventé", suggestion: null },
            ],
          },
        },
      ],
    });
    const out = await judgeFidelity(llm, snapshot);
    expect(out.verdicts).toHaveLength(1);
    expect(out.verdicts[0]).toMatchObject({ path: paths[0], verdict: "fidele", suggestion: null });
    expect(out.providerKind).toBe("ia");
  });

  it("refuse une reformulation qui invente (chiffre modifié), garde celle qui reste fidèle", async () => {
    const target = paths.find((p) => /40 %/.test(textOf(p).text))!;
    const other = paths.find((p) => p !== target && /12 services/.test(textOf(p).text))!;
    const llm = new ScriptedProvider({
      "juge-fidelite": [
        {
          data: {
            verdicts: [
              {
                path: target,
                verdict: "nuance",
                explanation: "chiffre",
                suggestion: "Réduction de 60 % du temps de réponse d'une API de réservation",
              },
              {
                path: other,
                verdict: "nuance",
                explanation: "formulation",
                suggestion: "  Migration vers Node.js 20   de 12 services Express ",
              },
            ],
          },
        },
      ],
    });
    const [invented, faithful] = (await judgeFidelity(llm, snapshot)).verdicts;
    expect(invented!.suggestion).toBeNull();
    // Mêmes faits, autre ordre : proposée, espaces normalisés.
    expect(faithful!.suggestion).toBe("Migration vers Node.js 20 de 12 services Express");
  });

  it.each([
    ["sortie non conforme 3 fois", () => new LlmSchemaError("JSON cassé"), "non-conforme", 3],
    ["panne du fournisseur", () => new LlmUnavailableError("503", 503), "indisponible", 1],
    [
      "délai dépassé",
      () => new LlmUnavailableError("délai", undefined, { reason: "timeout" }),
      "indisponible",
      1,
    ],
    ["refus du modèle", () => new LlmRefusalError("cyber"), "refus", 1],
    ["budget atteint", () => new LlmBudgetExceededError("cv-generation"), "budget", 1],
  ])("%s → assistant indisponible (%s)", async (_cas, failure, reason, calls) => {
    const llm = new ScriptedProvider({ "juge-fidelite": [0, 1, 2].map(() => ({ error: failure() })) });
    const error = await judgeFidelity(llm, snapshot).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AssistUnavailableError);
    expect((error as AssistUnavailableError).reason).toBe(reason);
    expect(llm.requests).toHaveLength(calls);
  });

  it("mode démonstration : un verdict par ligne du CV, sans plantage", async () => {
    const out = await judgeFidelity(new DemoProvider(assistantDemoHandlers), snapshot);
    expect(out.providerKind).toBe("demo");
    expect(out.verdicts.map((v) => v.path).sort()).toEqual([...paths].sort());
  });
});
